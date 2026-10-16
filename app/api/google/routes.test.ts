import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// /api/google/{sync,status,initial} — 누가 무엇을 부를 수 있는지와 응답 모양. 엔진은 가짜(lib/gcal/sync.test.ts 가 따로 본다).

const s = vi.hoisted(() => ({
  user: null as null | { uid: string; username: string; name: string | null; isAdmin: boolean },
  runSync: [] as unknown[],
  status: {
    config: "on",
    calendarId: "family@example.com",
    initialDoneAt: null as string | null,
    lastSyncAt: null,
    lastError: null,
    linked: 0,
    pending: 0,
  } as Record<string, unknown>,
  preview: { toPush: 1, toLink: 2, toImport: 3 } as unknown,
  throwSync: false,
}));

vi.mock("@/lib/current-user", () => ({ getCurrentUser: async () => s.user }));
vi.mock("@/lib/gcal/sync", () => ({
  runSync: vi.fn(async (opts: unknown) => {
    s.runSync.push(opts);
    if (s.throwSync) throw new Error("Bearer ya29.SECRET");
    return { ran: true, changed: 2, error: null };
  }),
  gcalStatus: vi.fn(async () => ({ ...s.status })),
  previewInitial: vi.fn(async () => s.preview),
}));

import { POST as syncPOST } from "@/app/api/google/sync/route";
import { GET as statusGET } from "@/app/api/google/status/route";
import { POST as initialPOST } from "@/app/api/google/initial/route";

const ADMIN = { uid: "u1", username: "admin", name: null, isAdmin: true };
const FAMILY = { uid: "u2", username: "mom", name: "엄마", isAdmin: false };
const post = (body?: unknown) =>
  new NextRequest("http://localhost/api/google/sync", {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });

beforeEach(() => {
  s.user = ADMIN;
  s.runSync.length = 0;
  s.status.initialDoneAt = null;
  s.status.config = "on";
  s.throwSync = false;
});

describe("POST /api/google/sync", () => {
  it("가족 누구나 — force 는 관리자만(가족이 보내면 조용히 뺀다)", async () => {
    s.user = FAMILY;
    const res = await syncPOST(post({ force: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ran: true, changed: 2, error: null });
    s.user = ADMIN;
    await syncPOST(post({ force: true }));
    await syncPOST(post());
    expect(s.runSync).toEqual([{ force: false }, { force: true }, { force: false }]);
  });

  it("로그인 없으면 401", async () => {
    s.user = null;
    expect((await syncPOST(post())).status).toBe(401);
    expect(s.runSync).toHaveLength(0);
  });

  it("엔진이 던져도 200 + error 문구(예외 문구는 싣지 않는다)", async () => {
    s.throwSync = true;
    const res = await syncPOST(post());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ran: true, changed: 0 });
    expect(JSON.stringify(body)).not.toContain("Bearer");
  });
});

describe("GET /api/google/status", () => {
  it("관리자만 — 아니면 403", async () => {
    s.user = FAMILY;
    const res = await statusGET();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "관리자만 볼 수 있어요." });
  });

  it("처음 맞추기 전·켜짐 → 미리보기를 같이", async () => {
    expect(await (await statusGET()).json()).toEqual({ ...s.status, preview: { toPush: 1, toLink: 2, toImport: 3 } });
  });

  it("처음 맞추기 뒤·꺼짐 → 미리보기 없음", async () => {
    s.status.initialDoneAt = "2026-10-16T03:00:00.000Z";
    expect(await (await statusGET()).json()).not.toHaveProperty("preview");
    s.status.initialDoneAt = null;
    s.status.config = "missing";
    expect(await (await statusGET()).json()).not.toHaveProperty("preview");
  });
});

describe("POST /api/google/initial", () => {
  it("관리자만 — 아니면 403, 엔진을 부르지 않는다", async () => {
    s.user = FAMILY;
    expect((await initialPOST()).status).toBe(403);
    expect(s.runSync).toHaveLength(0);
  });

  it("관리자 → runSync({ initial:true, force:true }) 결과 그대로", async () => {
    const res = await initialPOST();
    expect(await res.json()).toEqual({ ran: true, changed: 2, error: null });
    expect(s.runSync).toEqual([{ initial: true, force: true }]);
  });
});
