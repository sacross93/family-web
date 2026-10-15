import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pregnancy } from "@prisma/client";
import { LIST_TAKE, MEMORY_TAKE, MORE_TITLE, PAST_TAKE, RESOURCES } from "@/lib/agent/resources";
import { resolvePath } from "@/lib/agent/registry";
import { executeTool } from "@/lib/agent/tools";
import { CYCLE_KINDS, TEST_RESULTS, predictCycle } from "@/lib/cycle";
import { kDateShortYear } from "@/lib/date";
import type { JourneyState } from "@/lib/journey-core";

// 실제 리소스를 그대로 돌리되 DB 는 타지 않는다. 몇 행을 돌려줄지는 테스트가 정한다.
// (행 수를 상한에 딱 맞추면 "더 있음" 표시가 붙어야 하고, 하나 모자라면 붙으면 안 된다.)
const db = vi.hoisted(() => ({
  /** findMany 가 돌려줄 행 수. 인자는 그 쿼리의 take. */
  rows: (take?: number) => take ?? 3,
  calls: [] as { model: string; op: string; args?: Record<string, unknown> }[],
  /** 모델별 findFirst/findUnique 결과. 없는 모델은 row(0). (진행 중인 임신이 있나 없나를 여기서 정한다) */
  first: {} as Record<string, unknown>,
  /** count 가 돌려줄 수 */
  count: 0,
  /** 아기 페이지 상태 — journeyState() 대신 이것을 돌려준다(아래 vi.mock 참고). */
  journey: undefined as unknown,
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

  /** 그 모델에만 있는 칸. 주기 기록은 종류가 돌아가며 나오고 테스트기만 결과가 있다. */
  const KINDS = ["periodStart", "periodEnd", "ovulationTest"];
  const SHAPES: Record<string, (i: number) => Record<string, unknown>> = {
    cycleEvent: (i) => ({ kind: KINDS[i % 3], result: i % 3 === 2 ? "faint" : null }),
    // 상세에서 걷어내야 할 외래키를 일부러 싣는다.
    journeyEntry: () => ({ kind: "diary", pregnancyId: "p1", authorId: "m1" }),
    journeyChecklistItem: () => ({ pregnancyId: "p1" }),
  };
  const shaped = (name: string, i: number) => ({ ...row(i), ...(SHAPES[name]?.(i) ?? {}) });

  const model = (name: string) => ({
    findMany: async (args?: { take?: number }) => {
      db.calls.push({ model: name, op: "findMany", args });
      return Array.from({ length: db.rows(args?.take) }, (_, i) => shaped(name, i));
    },
    findFirst: async (args?: Record<string, unknown>) => {
      db.calls.push({ model: name, op: "findFirst", args });
      return name in db.first ? db.first[name] : shaped(name, 0);
    },
    findUnique: async (args?: Record<string, unknown>) => {
      db.calls.push({ model: name, op: "findUnique", args });
      return name in db.first ? db.first[name] : shaped(name, 0);
    },
    count: async (args?: Record<string, unknown>) => {
      db.calls.push({ model: name, op: "count", args });
      return db.count;
    },
  });

  return { prisma: new Proxy({}, { get: (_t, name: string) => model(name) }) };
});

// 아기 페이지 상태는 시험이 정한다. 진짜 journeyState() 를 가짜 DB 로 돌리면 그 안의
// "다가오는 병원 기록 20개" 쿼리가 아기 목차의 상한처럼 잡혀 위 상한 시험이 엉뚱하게 깨진다
// (아기 목차는 상한을 쓰지 않는다). journeyState 자체는 lib/journey-core 시험과 smoke 가 본다.
vi.mock("@/lib/journey", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/journey")>()),
  journeyState: async () => db.journey,
}));

const TODAY = new Date(2026, 9, 16); // 로컬 자정
const PREGNANCY: Pregnancy = {
  id: "p1",
  nickname: "콩이",
  emoji: "🌱",
  color: "rose",
  dueDate: new Date(2027, 4, 20),
  birthDate: null,
  endedAt: null,
  createdAt: new Date(2026, 8, 1),
  updatedAt: new Date(2026, 8, 1),
};

function journey(over: Partial<JourneyState>): JourneyState {
  return {
    showOnHome: false,
    active: null,
    stage: "prep",
    cycleEvents: [],
    prediction: null,
    latestEntry: null,
    upcomingHospital: [],
    hasAnything: false,
    ...over,
  };
}

const PREGNANT = journey({ active: PREGNANCY, stage: "pregnant", hasAnything: true });
/** 준비 단계 — 예측은 진짜 계산기로 낸다(날짜를 손으로 지어내지 않는다). */
const PREP_EVENTS = [
  { date: new Date(2026, 7, 20), kind: "periodStart" },
  { date: new Date(2026, 8, 17), kind: "periodStart" },
  { date: new Date(2026, 9, 14), kind: "periodStart" },
];
const PREP = journey({ stage: "prep", prediction: predictCycle(PREP_EVENTS, TODAY), hasAnything: true });

beforeEach(() => {
  db.calls.length = 0;
  db.rows = (take) => take ?? 3;
  db.first = {};
  db.count = 0;
  db.journey = PREGNANT;
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
    // 이름 붙은 상한만 쓴다. 새 상한이 생기면 **여기 이름을 더한다** — 숫자를 더하지 않는다.
    expect([...takes].sort((a, b) => a - b)).toEqual(
      [PAST_TAKE, LIST_TAKE, MEMORY_TAKE].sort((a, b) => a - b)
    );
  });
});

// ─────────────────────────────────────────────────────────────
// 아기 — 준비 → 임신 → 출생을 한 페이지에서. 키(baby·babyEntry·babyChecklist·babyLink)는 그대로다
// (옛 대화의 되돌리기 카드가 키로 리소스를 찾는다).
// ─────────────────────────────────────────────────────────────

const find = (key: string) => RESOURCES.find((r) => r.key === key)!;
const callsOf = (model: string, op: string) => db.calls.filter((c) => c.model === model && c.op === op);

/** 객체 안의 모든 키(깊이 무관). 상세가 내부 식별자를 흘리는지 본다. */
function allKeys(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out));
  else if (v && typeof v === "object" && !(v instanceof Date)) {
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      allKeys(x, out);
    }
  }
  return out;
}

describe("아기 목차 — 단계마다 한 줄", () => {
  it("임신 중이면 태명과 예정일", async () => {
    expect(await find("baby").catalog()).toEqual([
      { title: "콩이", hint: `예정일 ${kDateShortYear(PREGNANCY.dueDate)}` },
    ]);
  });

  it("태어났으면 출생일", async () => {
    const birthDate = new Date(2027, 4, 18);
    db.journey = journey({ active: { ...PREGNANCY, birthDate }, stage: "born" });
    expect(await find("baby").catalog()).toEqual([{ title: "콩이", hint: `출생 ${kDateShortYear(birthDate)}` }]);
  });

  it("준비 단계의 예측은 날짜마다 '추정' 이라고 말한다 — 모델이 사실처럼 옮기지 않게", async () => {
    db.journey = PREP;
    const p = PREP.prediction!;
    const [entry, ...rest] = await find("baby").catalog();
    expect(rest).toEqual([]);
    expect(entry.title).toBe("아기 준비");
    expect(entry.hint).toContain(`다음 생리 예정 ${kDateShortYear(p.nextStart)}(추정)`);
    expect(entry.hint).toContain(`가임기 ${kDateShortYear(p.fertileStart)}~${kDateShortYear(p.fertileEnd)}(추정)`);
    expect(entry.hint!.match(/\(추정\)/g)).toHaveLength(2);
  });

  it("주기 기록이 없으면 예측을 지어내지 않는다", async () => {
    db.journey = journey({ stage: "prep" });
    expect(await find("baby").catalog()).toEqual([{ title: "아기 준비", hint: "주기 기록 없음" }]);
  });
});

describe("아기 상세 — /baby 에는 id 가 없으므로 open_page 가 id 없이 detail 을 부른다", () => {
  const open = async () => {
    const r = await executeTool("open_page", { path: "/baby" }, { origin: "http://t.local", cookie: "" });
    expect(r).toMatchObject({ ok: true, path: "/baby", label: "아기" });
    return (r as { data: Record<string, unknown> }).data as {
      stage: string;
      pregnancy: { nickname: string } | null;
      entries: { content: string }[];
      entryCount: number;
      checklist: { text: string }[];
      links: { url: string }[];
      cycle: ({ note: string; nextStart: Date } & Record<string, unknown>) | null;
    };
  };

  it("임신 중 — 단계·임신·일기·체크리스트·참고 사이트를 돌려주고 주기 예측은 싣지 않는다", async () => {
    const data = await open();
    expect(data.stage).toBe("pregnant");
    expect(data.pregnancy?.nickname).toBe("콩이");
    expect(data.entries[0].content).toBe("내용0");
    expect(data.checklist[0].text).toBe("항목0");
    expect(data.links[0].url).toBe("https://example.com/0");
    // 임신 중에 "다음 생리 예정" 을 말하면 안 된다.
    expect(data.cycle).toBeNull();
  });

  it("일기는 상한만큼만 싣되 전체 수를 함께 준다(잘린 줄 모르게 두지 않는다)", async () => {
    db.count = 42;
    const data = await open();
    expect(callsOf("journeyEntry", "findMany")[0].args?.take).toBe(LIST_TAKE);
    expect(data.entries).toHaveLength(LIST_TAKE);
    expect(data.entryCount).toBe(42);
  });

  it("체크리스트는 지금 단계 것만 — 임신 중이면 그 임신, 준비면 준비 것", async () => {
    await open();
    expect(callsOf("journeyChecklistItem", "findMany")[0].args?.where).toEqual({ pregnancyId: "p1" });

    db.calls.length = 0;
    db.journey = PREP;
    await open();
    expect(callsOf("journeyChecklistItem", "findMany")[0].args?.where).toEqual({ pregnancyId: null });
  });

  it("준비 단계 — 주기 요약을 싣고 그것이 추정이라고 밝힌다", async () => {
    db.journey = PREP;
    const data = await open();
    expect(data.stage).toBe("prep");
    expect(data.pregnancy).toBeNull();
    expect(data.cycle?.nextStart).toEqual(PREP.prediction!.nextStart);
    expect(data.cycle?.note).toContain("추정");
  });

  it("내부 식별자(…Id)·집안 값은 상세 밖으로 나가지 않는다", async () => {
    for (const state of [PREGNANT, PREP]) {
      db.journey = state;
      const keys = allKeys(await open());
      expect(keys.filter((k) => /^[a-z][A-Za-z]*Id$/.test(k)), "외래키").toEqual([]);
      expect(keys).not.toContain("createdAt");
      expect(keys).not.toContain("updatedAt");
    }
  });
});

describe("아기 체크리스트 목차", () => {
  it("지금 단계 것만 센다 — 지난 임신이나 준비 때 것을 섞지 않는다", async () => {
    db.first = { pregnancy: { id: "p1" } };
    db.count = 4;
    expect(await find("babyChecklist").catalog()).toEqual([{ title: "아기 체크리스트 항목 4개", hint: "완료 4" }]);
    const wheres = callsOf("journeyChecklistItem", "count").map((c) => c.args?.where);
    expect(wheres).toEqual([{ pregnancyId: "p1" }, { pregnancyId: "p1", done: true }]);

    db.calls.length = 0;
    db.first = { pregnancy: null };
    await find("babyChecklist").catalog();
    expect(callsOf("journeyChecklistItem", "count").map((c) => c.args?.where)).toEqual([
      { pregnancyId: null },
      { pregnancyId: null, done: true },
    ]);
  });
});

describe("아기 쪽 추가는 준비 단계에서도 된다 — 단계는 서버가 찍는다", () => {
  // 진행 중인 임신이 없다(준비 단계). 예전엔 여기서 "아기 정보가 아직 없어요" 를 던졌다.
  beforeEach(() => {
    db.journey = journey({ stage: "prep" });
    db.first = { pregnancy: null };
  });

  const cases: [string, Record<string, unknown>, Record<string, unknown>][] = [
    [
      "babyEntry",
      { content: "오늘 병원 다녀왔어요", kind: "checkup" },
      { content: "오늘 병원 다녀왔어요", date: undefined, kind: "checkup", mood: undefined, authorId: undefined },
    ],
    ["babyChecklist", { text: "태명 후보 적어 보기" }, { text: "태명 후보 적어 보기" }],
    ["babyLink", { url: "https://example.com/a", title: "참고" }, { url: "https://example.com/a", title: "참고" }],
  ];

  for (const [key, args, body] of cases) {
    it(`${key} 의 본문에 babyId 가 없다`, async () => {
      const out = await find(key).create!.toBody(args);
      expect(out).toEqual(body);
      expect(Object.keys(out)).not.toContain("babyId");
      expect(Object.keys(out)).not.toContain("pregnancyId");
    });
  }
});

describe("주기 기록(cycle)", () => {
  it("/baby 는 여전히 아기(baby)로 해석된다 — 주기 기록이 부모를 가로채지 않는다", () => {
    expect(resolvePath("/baby", RESOURCES)?.key).toBe("baby");
    expect(RESOURCES.findIndex((r) => r.key === "cycle")).toBeGreaterThan(RESOURCES.findIndex((r) => r.key === "baby"));
  });

  it("목차는 종류·날짜를 제목으로, 테스트기 결과만 보조 정보로 — 본문은 싣지 않는다", async () => {
    db.rows = () => 3; // 상한 아래 — "더 있음" 꼬리 없이 세 줄
    const entries = await find("cycle").catalog();
    expect(entries).toHaveLength(3);
    expect(entries[0].title).toMatch(/^생리 시작 /);
    expect(entries[1].title).toMatch(/^생리 끝 /);
    expect(entries[2].title).toMatch(/^테스트기 /);
    expect(entries.map((e) => e.hint)).toEqual([undefined, undefined, "희미"]);
    for (const e of entries) {
      expect(e.id).toBeTruthy(); // 되읽기(confirmCreated)가 id 로 찾는다
      expect(e.body).toBeUndefined();
    }
  });

  it("추가 본문은 kind·date·result 만 — 빈 값은 비워 라우트 기본값(오늘)을 살린다", async () => {
    const toBody = find("cycle").create!.toBody;
    expect(await toBody({ kind: "ovulationTest", date: "2026-10-16", result: "positive" })).toEqual({
      kind: "ovulationTest",
      date: "2026-10-16",
      result: "positive",
    });
    const blank = await toBody({ kind: "periodStart", date: "", result: " " });
    expect(blank).toEqual({ kind: "periodStart", date: undefined, result: undefined });
    expect(Object.keys(blank)).not.toContain("babyId");
  });

  it("고를 수 있는 값이 라우트가 받는 값과 같다", () => {
    const create = find("cycle").create!;
    expect(create.api).toBe("/api/cycle-events");
    expect(create.schema.required).toEqual(["kind"]);
    expect(create.schema.properties.kind.enum).toEqual(CYCLE_KINDS);
    expect(create.schema.properties.result.enum).toEqual(TEST_RESULTS);
    expect(create.undoApi!("c1")).toBe("/api/cycle-events/c1");
  });
});

describe("글이 본체인 리소스는 본문을 싣는다", () => {
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
