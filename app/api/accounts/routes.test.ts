import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// /api/accounts — 관리자만 부를 수 있는지, passwordHash 가 밖으로 안 나가는지, 만든 해시로 정말 로그인되는지.
// prisma 는 가짜지만 **`select` 를 진짜처럼 따른다** — 고르지 않으면 passwordHash 까지 돌려준다.
// 그래야 라우트에서 select 를 빼먹었을 때 "응답에 passwordHash 없음" 이 빨개진다.
// 세션 쿠키는 **진짜** `lib/session` 으로 만들고 풀어 본다 — 새 이름이 정말 쿠키에 실렸는지까지.

type Row = { id: string; username: string; passwordHash: string; name: string | null; isAdmin: boolean; createdAt: Date };

const s = vi.hoisted(() => ({
  user: null as null | { uid: string; username: string; name: string | null; isAdmin: boolean },
  rows: [] as Row[],
  calls: [] as { op: string; args: Record<string, unknown> }[],
  createError: null as unknown,
  updateCount: 1,
}));

function project(row: Row, select?: Record<string, boolean>) {
  if (!select) return { ...row };
  return Object.fromEntries(Object.entries(row).filter(([k]) => select[k]));
}

vi.mock("@/lib/current-user", () => ({ getCurrentUser: async () => s.user }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appUser: {
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        s.calls.push({ op: "findMany", args });
        return s.rows.map((r) => project(r, args?.select as Record<string, boolean> | undefined));
      }),
      create: vi.fn(async (args: { data: Omit<Row, "id" | "createdAt">; select?: Record<string, boolean> }) => {
        s.calls.push({ op: "create", args });
        if (s.createError) throw s.createError;
        const row: Row = { id: "new-1", createdAt: new Date("2026-10-19T00:00:00Z"), ...args.data };
        return project(row, args.select);
      }),
      updateMany: vi.fn(async (args: { where: { id: string }; data: Partial<Row> }) => {
        s.calls.push({ op: "updateMany", args });
        if (s.updateCount > 0) Object.assign(s.rows.find((r) => r.id === args.where.id) ?? {}, args.data);
        return { count: s.updateCount };
      }),
      findUnique: vi.fn(async (args: { where: { id: string }; select?: Record<string, boolean> }) => {
        s.calls.push({ op: "findUnique", args });
        const row = s.rows.find((r) => r.id === args.where.id);
        return row ? project(row, args.select) : null;
      }),
    },
  },
}));

import { GET, POST } from "@/app/api/accounts/route";
import { PATCH } from "@/app/api/accounts/[id]/route";

const ADMIN = { uid: "u1", username: "admin", name: "아빠", isAdmin: true };
const FAMILY = { uid: "u2", username: "mom", name: "엄마", isAdmin: false };
const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/accounts", {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const created = () => s.calls.find((c) => c.op === "create")?.args.data as Record<string, unknown>;
const updated = () => s.calls.find((c) => c.op === "updateMany")?.args as { where: unknown; data: Record<string, unknown> };

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "test-secret-for-accounts-routes-0123456789");
  s.user = ADMIN;
  s.calls.length = 0;
  s.createError = null;
  s.updateCount = 1;
  s.rows = [
    { id: "u1", username: "admin", passwordHash: "$2a$10$SECRETHASH", name: "아빠", isAdmin: true, createdAt: new Date("2026-01-01") },
    { id: "u2", username: "mom", passwordHash: "$2a$10$MOMSECRET", name: "엄마", isAdmin: false, createdAt: new Date("2026-01-02") },
  ];
});
afterEach(() => vi.unstubAllEnvs());

describe("관리자만", () => {
  for (const [who, user] of [
    ["가족", FAMILY],
    ["로그인 안 함", null],
  ] as const) {
    it(`${who} → GET·POST·PATCH 모두 403, prisma 를 부르지 않는다`, async () => {
      s.user = user;
      expect((await GET()).status).toBe(403);
      expect((await POST(req("POST", { username: "eomma", password: "1234", isAdmin: true }))).status).toBe(403);
      expect((await PATCH(req("PATCH", { password: "1234" }), params("u1"))).status).toBe(403);
      expect(s.calls).toEqual([]);
    });
  }
});

describe("GET /api/accounts", () => {
  it("passwordHash 를 고르지 않고, 응답에도 없다", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const select = s.calls[0].args.select as Record<string, boolean>;
    expect(select).toBeTruthy();
    expect(select).not.toHaveProperty("passwordHash");
    const text = await res.text();
    expect(text).not.toContain("passwordHash");
    expect(text).not.toContain("SECRETHASH");
    expect(text).not.toContain("MOMSECRET");
    expect(JSON.parse(text)).toEqual([
      { id: "u1", username: "admin", name: "아빠", isAdmin: true, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "u2", username: "mom", name: "엄마", isAdmin: false, createdAt: "2026-01-02T00:00:00.000Z" },
    ]);
  });
});

describe("POST /api/accounts", () => {
  it("저장한 해시로 진짜 bcrypt 가 통과한다(평문이 아니다) · 응답에 passwordHash 없음 · 201", async () => {
    const res = await POST(req("POST", { username: "eomma", password: "꽃잎 1234", name: "  엄마  " }));
    expect(res.status).toBe(201);
    const data = created();
    expect(data.passwordHash).not.toBe("꽃잎 1234");
    expect(await bcrypt.compare("꽃잎 1234", String(data.passwordHash))).toBe(true);
    expect(await bcrypt.compare("꽃잎 12345", String(data.passwordHash))).toBe(false);
    expect(data.name).toBe("엄마");
    const text = await res.text();
    expect(text).not.toContain("passwordHash");
    expect(JSON.parse(text)).toMatchObject({ id: "new-1", username: "eomma", name: "엄마", isAdmin: false });
  });

  it("isAdmin 은 true(불리언)일 때만 — 글자 \"true\" 도, 빠져도 가족", async () => {
    await POST(req("POST", { username: "a-1", password: "1234", isAdmin: "true" }));
    await POST(req("POST", { username: "a-2", password: "1234", isAdmin: true }));
    await POST(req("POST", { username: "a-3", password: "1234" }));
    await POST(req("POST", { username: "a-4", password: "1234", isAdmin: 1 }));
    const flags = s.calls.filter((c) => c.op === "create").map((c) => (c.args.data as Row).isAdmin);
    expect(flags).toEqual([false, true, false, false]);
  });

  it("이름이 비면 null", async () => {
    await POST(req("POST", { username: "eomma", password: "1234", name: "   " }));
    expect(created().name).toBeNull();
  });

  it("아이디: 대문자·앞뒤 빈칸은 맞춰 주고, 가운데 빈칸·한글·짧은 것·긴 것은 400", async () => {
    await POST(req("POST", { username: "  Eomma.K_1  ", password: "1234" }));
    expect(created().username).toBe("eomma.k_1");

    for (const username of ["eo mma", "엄마", "ab", "a".repeat(21), "", undefined, "eomma!"]) {
      s.calls.length = 0;
      const res = await POST(req("POST", { username, password: "1234" }));
      expect(res.status, String(username)).toBe(400);
      expect((await res.json()).error).toContain("3~20자");
      expect(s.calls).toEqual([]);
    }
  });

  it("비밀번호: 3자·앞뒤 빈칸·72바이트 넘음은 400 — 다듬지 않고 돌려보낸다", async () => {
    for (const password of ["123", " 1234", "1234 ", "", undefined, 12345678, "a".repeat(73), "가".repeat(25)]) {
      s.calls.length = 0;
      const res = await POST(req("POST", { username: "eomma", password }));
      expect(res.status, String(password)).toBe(400);
      expect(s.calls).toEqual([]);
    }
    // 경계: 72바이트는 된다, 가운데 빈칸도 된다(로그인은 비밀번호를 다듬지 않는다)
    expect((await POST(req("POST", { username: "eomma", password: "a".repeat(72) }))).status).toBe(201);
    expect((await POST(req("POST", { username: "eomma", password: "12 34" }))).status).toBe(201);
  });

  it("같은 아이디(P2002) → 409, 500 이 아니다 · 덮어쓰지 않는다", async () => {
    s.createError = Object.assign(new Error("Unique constraint failed on the fields: (`username`)"), { code: "P2002" });
    const res = await POST(req("POST", { username: "admin", password: "1234" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "이미 있는 아이디예요." });
    expect(s.calls.map((c) => c.op)).toEqual(["create"]);
  });

  it("그 밖의 DB 오류는 삼키지 않는다", async () => {
    s.createError = Object.assign(new Error("connection lost"), { code: "P1001" });
    await expect(POST(req("POST", { username: "eomma", password: "1234" }))).rejects.toThrow("connection lost");
  });
});

describe("PATCH /api/accounts/[id]", () => {
  const sessionIn = (res: NextResponse) => verifySessionToken(res.cookies.get(SESSION_COOKIE)?.value);

  it("비밀번호만 → 새 해시만 쓴다 · 응답은 고친 계정(passwordHash 없음)", async () => {
    const res = await PATCH(req("PATCH", { password: "새비번99" }), params("u2"));
    expect(res.status).toBe(200);
    const { where, data } = updated();
    expect(where).toEqual({ id: "u2" });
    expect(Object.keys(data)).toEqual(["passwordHash"]);
    expect(await bcrypt.compare("새비번99", String(data.passwordHash))).toBe(true);
    const text = await res.text();
    expect(text).not.toContain("passwordHash");
    expect(text).not.toContain("$2");
    expect(JSON.parse(text)).toEqual({
      id: "u2", username: "mom", name: "엄마", isAdmin: false, createdAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("이름만 → data 는 정확히 { name: 다듬은 이름 } (passwordHash 칸 없음)", async () => {
    const res = await PATCH(req("PATCH", { name: "  어머니   최고  " }), params("u2"));
    expect(res.status).toBe(200);
    expect(updated().data).toEqual({ name: "어머니 최고" });
    expect(await res.json()).toMatchObject({ id: "u2", name: "어머니 최고" });
  });

  it("이름을 비우면 null — 위에는 아이디가 대신 나온다", async () => {
    await PATCH(req("PATCH", { name: "   " }), params("u2"));
    expect(updated().data).toEqual({ name: null });
  });

  it("이름도 비밀번호도 없으면 400, DB 를 부르지 않는다", async () => {
    for (const body of [{}, { isAdmin: true }, { username: "x" }, null, "name", []]) {
      s.calls.length = 0;
      const res = await PATCH(req("PATCH", body), params("u2"));
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(s.calls).toEqual([]);
    }
  });

  it("본문의 isAdmin·username·passwordHash 는 무시 — 쓰는 칸은 name·passwordHash 둘뿐", async () => {
    const res = await PATCH(
      req("PATCH", { isAdmin: true, username: "x", name: "a", password: "abcd", passwordHash: "plain", id: "u1" }),
      params("u2")
    );
    expect(res.status).toBe(200);
    const { where, data } = updated();
    expect(where).toEqual({ id: "u2" });
    expect(Object.keys(data).sort()).toEqual(["name", "passwordHash"]);
    expect(data.name).toBe("a");
    expect(await bcrypt.compare("abcd", String(data.passwordHash))).toBe(true);
    expect(await res.json()).toMatchObject({ username: "mom", isAdmin: false });
  });

  it("비밀번호가 틀리면 이름도 쓰지 않는다 — 3자·앞뒤 빈칸·null → 400, DB 를 부르지 않는다", async () => {
    for (const password of ["123", " 1234", null, ""]) {
      s.calls.length = 0;
      const res = await PATCH(req("PATCH", { password, name: "새이름" }), params("u2"));
      expect(res.status, String(password)).toBe(400);
      expect(s.calls).toEqual([]);
    }
  });

  it("내 이름 → 응답에 새 세션 쿠키: 새 이름 + 지금 세션의 uid·아이디·관리자 여부(본문 것 아님)", async () => {
    const res = await PATCH(req("PATCH", { name: "  새 이름  ", isAdmin: false, username: "x" }), params("u1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain(`${SESSION_COOKIE}=`);
    expect(await sessionIn(res)).toEqual({ uid: "u1", username: "admin", name: "새 이름", isAdmin: true });
    expect(await res.text()).not.toContain("passwordHash");
  });

  it("내 이름을 비우면 쿠키의 이름도 null", async () => {
    const res = await PATCH(req("PATCH", { name: "" }), params("u1"));
    expect(await sessionIn(res)).toEqual({ uid: "u1", username: "admin", name: null, isAdmin: true });
  });

  it("남의 이름 → 쿠키를 싣지 않는다(실으면 관리자가 그 사람으로 로그인된다)", async () => {
    const res = await PATCH(req("PATCH", { name: "어머니" }), params("u2"));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("내 비밀번호만 → 쿠키를 다시 굽지 않는다", async () => {
    const res = await PATCH(req("PATCH", { password: "새비번99" }), params("u1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("없는 계정(count 0) → 404, 쿠키 없음", async () => {
    s.updateCount = 0;
    for (const body of [{ password: "1234" }, { name: "누구" }]) {
      const res = await PATCH(req("PATCH", body), params("nope"));
      expect(res.status).toBe(404);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });
});
