import { describe, it, expect, vi, beforeEach } from "vitest";
import { LIST_TAKE, MORE_TITLE, PAST_TAKE, RESOURCES } from "@/lib/agent/resources";
import { resolvePath } from "@/lib/agent/registry";
import { executeTool } from "@/lib/agent/tools";

// 실제 리소스를 그대로 돌리되 DB 는 타지 않는다. 몇 행을 돌려줄지는 테스트가 정한다.
// (행 수를 상한에 딱 맞추면 "더 있음" 표시가 붙어야 하고, 하나 모자라면 붙으면 안 된다.)
const db = vi.hoisted(() => ({
  /** findMany 가 돌려줄 행 수. 인자는 그 쿼리의 take. */
  rows: (take?: number) => take ?? 3,
  calls: [] as { model: string; args?: Record<string, unknown> }[],
}));

vi.mock("@/lib/prisma", () => {
  const row = (i: number) => ({
    id: `id${i}`,
    title: `제목${i}`,
    name: `이름${i}`,
    nickname: "콩이",
    content: `내용${i}`,
    text: `항목${i}`,
    url: `https://example.com/${i}`,
    quantity: null,
    role: null,
    type: "여행",
    location: null,
    pinned: false,
    done: false,
    recurring: false,
    allDay: false,
    date: new Date("2026-09-20T00:00:00Z"),
    createdAt: new Date("2026-09-01T00:00:00Z"),
    start: new Date("2026-09-20T09:00:00Z"),
    startDate: null,
    endDate: null,
    takenOn: null,
    dueDate: new Date("2027-05-20T00:00:00Z"),
    birthDate: null,
    author: { name: "엄마" },
    _count: { photos: 0, items: 0, entries: 12 },
  });

  /** 아기 상세가 돌려주는 한 벌(일기·체크리스트·참고 사이트). */
  const babyDetail = () => ({
    ...row(0),
    entries: [{ id: "e1", content: "오늘 태동을 느꼈다" }],
    checklist: [{ id: "c1", text: "산모수첩 챙기기" }],
    links: [{ id: "l1", url: "https://example.com/baby" }],
  });

  const model = (name: string) => ({
    findMany: async (args?: { take?: number }) => {
      db.calls.push({ model: name, args });
      return Array.from({ length: db.rows(args?.take) }, (_, i) => row(i));
    },
    findFirst: async (args?: Record<string, unknown>) => {
      db.calls.push({ model: name, args });
      return babyDetail();
    },
    findUnique: async (args?: Record<string, unknown>) => {
      db.calls.push({ model: name, args });
      return babyDetail();
    },
    count: async () => 0,
  });

  return { prisma: new Proxy({}, { get: (_t, name: string) => model(name) }) };
});

/** LLM 에게 절대 묻지 않는 내부 식별자들. 문맥은 toBody 가 DB 에서 채운다. */
const INTERNAL_IDS = ["albumId", "planId", "babyId", "authorId", "memberId", "addedById"];

describe("RESOURCES 계약", () => {
  it("key 가 중복되지 않는다", () => {
    const keys = RESOURCES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("모든 리소스가 key·label·listPath·catalog 를 갖는다", () => {
    for (const r of RESOURCES) {
      expect(r.key, `${r.key}.key`).toBeTruthy();
      expect(r.label, `${r.key}.label`).toBeTruthy();
      expect(r.listPath.startsWith("/"), `${r.key}.listPath`).toBe(true);
      expect(typeof r.catalog, `${r.key}.catalog`).toBe("function");
    }
  });

  it("추가 가능한 리소스는 되돌리기 경로를 갖는다", () => {
    for (const r of RESOURCES) {
      if (!r.create) continue;
      expect(r.create.undoApi, `${r.key}.undoApi`).toBeTypeOf("function");
      expect(r.create.undoApi!("X"), `${r.key}.undoApi`).toBe(`${r.create.api}/X`);
    }
  });

  it("추가 스키마의 required 는 properties 안에 있다", () => {
    for (const r of RESOURCES) {
      for (const req of r.create?.schema.required ?? []) {
        expect(Object.keys(r.create!.schema.properties), `${r.key}.${req}`).toContain(req);
      }
    }
  });

  it("detailPattern 이 있으면 listPath 로 시작한다", () => {
    for (const r of RESOURCES) {
      if (r.detailPattern) expect(r.detailPattern.startsWith(r.listPath)).toBe(true);
    }
  });

  it("실제 경로가 해석된다", () => {
    expect(resolvePath("/albums/abc", RESOURCES)?.key).toBe("album");
    expect(resolvePath("/plans/xyz", RESOURCES)?.key).toBe("plan");
    expect(resolvePath("/admin", RESOURCES)).toBeNull();
    // 홈은 여러 리소스를 모아 보여주는 대시보드라 어떤 리소스에도 매이지 않는다.
    expect(resolvePath("/", RESOURCES)).toBeNull();
  });

  it("목록 경로가 겹치면 부모 리소스로 해석된다", () => {
    // 자식(photo·planItem·babyEntry …)이 부모보다 앞에 오면 이 테스트가 깨진다.
    expect(resolvePath("/albums", RESOURCES)?.key).toBe("album");
    expect(resolvePath("/plans", RESOURCES)?.key).toBe("plan");
    expect(resolvePath("/baby", RESOURCES)?.key).toBe("baby");
  });

  it("가족은 목차에만 있고 에이전트가 만들 수 없다", () => {
    const family = RESOURCES.find((r) => r.key === "familyMember");
    expect(family, "familyMember").toBeDefined();
    expect(family!.create, "familyMember.create").toBeUndefined();
  });

  it("추가 스키마가 내부 식별자를 묻지 않는다", () => {
    for (const r of RESOURCES) {
      for (const prop of Object.keys(r.create?.schema.properties ?? {})) {
        expect(INTERNAL_IDS, `${r.key}.${prop}`).not.toContain(prop);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────
// 목록 상한 — 잘렸다는 사실을 반드시 남긴다.
// (목차에서 조용히 빠지면 에이전트가 "그런 건 없어요"라고 자신 있게 틀린 답을 한다.)
// ─────────────────────────────────────────────────────────────

/** 모든 리소스의 목차를 한 번씩 만들고, 그때 쓰인 take 와 제목들을 모은다. */
async function catalogsWith(rows: (take?: number) => number) {
  db.rows = rows;
  const out: { key: string; take?: number; titles: string[] }[] = [];
  for (const r of RESOURCES) {
    const from = db.calls.length;
    const entries = await r.catalog();
    const take = db.calls
      .slice(from)
      .map((c) => c.args?.take)
      .find((t): t is number => typeof t === "number");
    out.push({ key: r.key, take, titles: entries.map((e) => e.title) });
  }
  return out;
}

describe("목록 상한 표시", () => {
  beforeEach(() => {
    db.calls.length = 0;
    db.rows = (take) => take ?? 3;
  });

  it("상한까지 꽉 찬 목록에는 '더 있음' 표시가 붙는다", async () => {
    for (const r of await catalogsWith((take) => take ?? 3)) {
      if (r.take === undefined) continue; // 상한 없이 전부 싣는 리소스(가족)
      expect(r.titles, r.key).toContain(MORE_TITLE);
    }
  });

  it("상한에 못 미치면 표시가 붙지 않는다(거짓 알림 금지)", async () => {
    for (const r of await catalogsWith((take) => Math.max((take ?? 3) - 1, 0))) {
      expect(r.titles, r.key).not.toContain(MORE_TITLE);
    }
  });

  it("상한이 다른 갈래(지난 일정 폴백)도 걸리면 표시를 남긴다", async () => {
    // 앞으로의 일정이 하나도 없으면 캘린더는 지난 일정을 대신 싣는다. 그 갈래의 상한은 PAST_TAKE 라,
    // 표시 여부를 LIST_TAKE 로 판단하면 10건이 잘려도 아무 흔적이 남지 않는다.
    const rows = await catalogsWith((take) => (take === LIST_TAKE ? 0 : take ?? 3));
    const event = rows.find((r) => r.key === "event")!;
    expect(event.titles).toContain(MORE_TITLE);
  });

  it("상한 값은 한 곳에서 관리한다(catalog 안에 매직 넘버를 두지 않는다)", async () => {
    await catalogsWith(() => 0); // 0행이면 캘린더가 지난 일정 폴백까지 탄다
    const takes = new Set(
      db.calls.map((c) => c.args?.take).filter((t): t is number => typeof t === "number")
    );
    expect([...takes].sort((a, b) => a - b)).toEqual([PAST_TAKE, LIST_TAKE].sort((a, b) => a - b));
  });
});

// ─────────────────────────────────────────────────────────────
// 아기 상세 — /baby 에는 id 가 없으므로 open_page 가 id 없이 detail 을 부른다.
// ─────────────────────────────────────────────────────────────

describe("아기 상세", () => {
  beforeEach(() => {
    db.calls.length = 0;
    db.rows = (take) => take ?? 3;
  });

  it("open_page('/baby') 가 일기·체크리스트·참고 사이트를 돌려준다", async () => {
    const r = await executeTool("open_page", { path: "/baby" }, { origin: "http://t.local", cookie: "" });
    expect(r).toMatchObject({ ok: true, path: "/baby", label: "아기" });
    const data = (r as {
      data: { entries: { content: string }[]; checklist: { text: string }[]; links: { url: string }[] };
    }).data;
    expect(data.entries[0].content).toBe("오늘 태동을 느꼈다");
    expect(data.checklist[0].text).toBe("산모수첩 챙기기");
    expect(data.links[0].url).toBe("https://example.com/baby");
  });

  it("기록은 상한만큼만 싣되 전체 개수를 함께 준다(잘린 줄 모르게 두지 않는다)", async () => {
    const baby = RESOURCES.find((r) => r.key === "baby")!;
    const data = (await baby.detail!()) as { _count: { entries: number } };
    const call = db.calls.find((c) => c.model === "baby")!;
    const include = call.args?.include as
      | { entries?: { take?: number }; _count?: { select?: { entries?: boolean } } }
      | undefined;
    expect(include?.entries?.take).toBe(LIST_TAKE);
    expect(include?._count?.select?.entries).toBe(true);
    expect(data._count.entries).toBe(12);
  });
});

describe("글이 본체인 리소스는 본문을 싣는다", () => {
  const find = (key: string) => RESOURCES.find((r) => r.key === key)!;
  /** "더 있음" 꼬리는 항목이 아니라 표시라 본문이 없다. */
  const items = async (key: string) => (await find(key).catalog()).filter((e) => e.title !== MORE_TITLE);

  it("아기 기록이 개수가 아니라 기록들을 준다 — 교환일기를 다시 읽을 수 있어야 한다", async () => {
    const entries = await items("babyEntry");
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.title).toBeTruthy();
      expect(typeof e.body).toBe("string");
      expect(e.body!.length).toBeGreaterThan(0);
    }
  });

  it("게시판 글이 본문을 싣는다", async () => {
    const entries = await items("board");
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) expect(typeof e.body).toBe("string");
  });

  it("본문은 제목보다 짧지 않다 — 제목은 첫 줄을 자른 것이다", async () => {
    for (const key of ["babyEntry", "board"]) {
      for (const e of await items(key)) {
        if (e.body) expect(e.body.length).toBeGreaterThanOrEqual(e.title.replace(/…$/, "").length);
      }
    }
  });
});
