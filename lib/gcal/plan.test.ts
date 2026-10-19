import { describe, it, expect } from "vitest";
import { planSync, type PlanInput, type PlanLink, type PlanSite, type Action } from "@/lib/gcal/plan";
import type { GEvent } from "@/lib/gcal/client";

// 시험의 중심. 스펙 §5 의 갈래를 하나씩 — 특히 "지우기" 는 끝까지 읽은 목록에서만 나와야 한다.

const NOW = new Date("2026-10-16T03:00:00.000Z"); // 10/16 12:00 KST
const DAY = 86_400_000;
const WINDOW = { min: new Date(NOW.getTime() - 90 * DAY), max: new Date(NOW.getTime() + 365 * DAY) };

const SYNCED = new Date("2026-10-10T00:00:00.000Z"); // 마지막으로 맞춘 때
const LATER = new Date("2026-10-12T00:00:00.000Z");
const LATEST = new Date("2026-10-13T00:00:00.000Z");
const INITIAL_DONE = new Date("2026-10-01T00:00:00.000Z");

function site(id: string, over: Partial<PlanSite> = {}): PlanSite {
  return {
    id,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: SYNCED,
    source: "local",
    start: new Date("2026-10-20T01:00:00.000Z"), // 10/20 10:00 KST
    title: id,
    ...over,
  };
}

function link(id: string, eventId: string | null, googleEventId: string, over: Partial<PlanLink> = {}): PlanLink {
  return {
    id,
    eventId,
    googleEventId,
    googleUpdated: SYNCED,
    siteSyncedAt: SYNCED,
    readOnly: null,
    pendingPush: false,
    pendingDelete: false,
    ...over,
  };
}

function gev(id: string, over: Partial<GEvent> = {}): GEvent {
  return {
    id,
    status: "confirmed",
    updated: SYNCED.toISOString(),
    summary: id,
    start: { dateTime: "2026-10-20T10:00:00+09:00", timeZone: "Asia/Seoul" },
    end: { dateTime: "2026-10-20T11:00:00+09:00", timeZone: "Asia/Seoul" },
    ...over,
  };
}

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    now: NOW,
    window: WINDOW,
    complete: true,
    google: [],
    site: [],
    links: [],
    initialDoneAt: INITIAL_DONE,
    initial: false,
    ...over,
  };
}

const kinds = (actions: Action[]) => actions.map((a) => a.kind);

describe("planSync — 연결 없는 구글 일정", () => {
  it("연결 없는 구글 일정 → createSite, 취소된 것·이미 연결된 것은 제외", () => {
    const a = gev("a");
    const actions = planSync(
      input({
        google: [a, gev("b", { status: "cancelled" }), gev("c")],
        site: [site("e-c")],
        links: [link("L-c", "e-c", "c")],
      }),
    );
    expect(actions).toEqual([{ kind: "createSite", google: a }]);
  });

  it("같은 구글 id 가 목록에 두 번 와도 createSite 는 한 번", () => {
    const a = gev("a");
    expect(planSync(input({ google: [a, { ...a }] }))).toEqual([{ kind: "createSite", google: a }]);
  });
});

describe("planSync — 연결된 일정", () => {
  const e1 = site("e1");
  const L1 = link("L1", "e1", "g1");

  it("구글만 바뀜 → updateSite", () => {
    const g1 = gev("g1", { updated: LATER.toISOString() });
    expect(planSync(input({ google: [g1], site: [e1], links: [L1] }))).toEqual([
      { kind: "updateSite", linkId: "L1", eventId: "e1", google: g1 },
    ]);
  });

  it("사이트만 바뀜(readOnly 아님) → pushUpdate", () => {
    expect(planSync(input({ google: [gev("g1")], site: [site("e1", { updatedAt: LATER })], links: [L1] }))).toEqual([
      { kind: "pushUpdate", linkId: "L1", eventId: "e1", googleEventId: "g1" },
    ]);
  });

  it("아무도 안 바뀜 → 아무것도", () => {
    expect(planSync(input({ google: [gev("g1")], site: [e1], links: [L1] }))).toEqual([]);
  });

  it("둘 다 바뀜 — 사이트가 나중이면 pushUpdate", () => {
    const actions = planSync(
      input({ google: [gev("g1", { updated: LATER.toISOString() })], site: [site("e1", { updatedAt: LATEST })], links: [L1] }),
    );
    expect(actions).toEqual([{ kind: "pushUpdate", linkId: "L1", eventId: "e1", googleEventId: "g1" }]);
  });

  it("둘 다 바뀜 — 구글이 나중이면 updateSite", () => {
    const g1 = gev("g1", { updated: LATEST.toISOString() });
    expect(planSync(input({ google: [g1], site: [site("e1", { updatedAt: LATER })], links: [L1] }))).toEqual([
      { kind: "updateSite", linkId: "L1", eventId: "e1", google: g1 },
    ]);
  });

  it("둘 다 바뀜 — 같은 시각이면 구글이 이긴다", () => {
    const g1 = gev("g1", { updated: LATER.toISOString() });
    expect(planSync(input({ google: [g1], site: [site("e1", { updatedAt: LATER })], links: [L1] }))).toEqual([
      { kind: "updateSite", linkId: "L1", eventId: "e1", google: g1 },
    ]);
  });

  it("구글에서 cancelled → deleteSite", () => {
    const cancelled: GEvent = { id: "g1", status: "cancelled", updated: LATER.toISOString() }; // 취소된 건 시작도 없이 온다
    expect(planSync(input({ google: [cancelled], site: [e1], links: [L1] }))).toEqual([
      { kind: "deleteSite", linkId: "L1", eventId: "e1" },
    ]);
  });

  it("pendingPush → pushUpdate (시각이 그대로여도)", () => {
    expect(planSync(input({ google: [gev("g1")], site: [e1], links: [{ ...L1, pendingPush: true }] }))).toEqual([
      { kind: "pushUpdate", linkId: "L1", eventId: "e1", googleEventId: "g1" },
    ]);
  });

  it("pendingPush 인데 구글이 더 나중에 바뀌었으면 구글이 이긴다", () => {
    const g1 = gev("g1", { updated: LATEST.toISOString() });
    expect(planSync(input({ google: [g1], site: [site("e1", { updatedAt: LATER })], links: [{ ...L1, pendingPush: true }] }))).toEqual([
      { kind: "updateSite", linkId: "L1", eventId: "e1", google: g1 },
    ]);
  });

  it("연결의 사이트 일정이 입력에 없으면 그 연결은 건너뛴다(판단할 재료가 없다) — 구글 일정도 새로 만들지 않는다", () => {
    expect(planSync(input({ google: [gev("g1", { updated: LATER.toISOString() })], site: [], links: [L1] }))).toEqual([]);
  });

  it("한 연결에서 액션은 많아야 하나", () => {
    const actions = planSync(
      input({
        google: [gev("g1", { updated: LATER.toISOString() })],
        site: [site("e1", { updatedAt: LATEST })],
        links: [{ ...L1, pendingPush: true }],
      }),
    );
    expect(actions).toHaveLength(1);
  });
});

describe("planSync — 목록에 없는 연결(지우기는 끝까지 읽었을 때만)", () => {
  const inWindow = site("e1"); // 10/20
  const L1 = link("L1", "e1", "g1");

  it("창 안 연결이 (끝까지 읽은) 목록에 없음 → recheck, 지우지 않는다", () => {
    const actions = planSync(input({ google: [], site: [inWindow], links: [L1] }));
    expect(actions).toEqual([{ kind: "recheck", linkId: "L1", eventId: "e1", googleEventId: "g1" }]);
    expect(kinds(actions)).not.toContain("deleteSite");
  });

  it("complete=false → deleteSite·recheck 를 하나도 만들지 않는다(취소됨이 보여도)", () => {
    const actions = planSync(
      input({
        complete: false,
        google: [{ id: "g2", status: "cancelled", updated: LATER.toISOString() }],
        site: [inWindow, site("e2")],
        links: [L1, link("L2", "e2", "g2")],
      }),
    );
    expect(kinds(actions)).not.toContain("deleteSite");
    expect(kinds(actions)).not.toContain("recheck");
    expect(actions).toEqual([]);
  });

  it("창 밖 연결(목록에 없음)은 손대지 않는다 — 창 끝 너머·창 시작 이전 모두", () => {
    const far = site("e-far", { start: new Date(WINDOW.max.getTime() + DAY) });
    const old = site("e-old", { start: new Date(WINDOW.min.getTime() - DAY) });
    const actions = planSync(
      input({
        google: [],
        site: [far, old],
        links: [link("L-far", "e-far", "g-far"), link("L-old", "e-old", "g-old")],
      }),
    );
    expect(actions).toEqual([]);
  });

  it("창 밖 연결이라도 pendingPush 면 보낸다(사이트에 못 보낸 변경이 있다는 표시라)", () => {
    const far = site("e-far", { start: new Date(WINDOW.max.getTime() + DAY) });
    expect(planSync(input({ google: [], site: [far], links: [link("L-far", "e-far", "g-far", { pendingPush: true })] }))).toEqual([
      { kind: "pushUpdate", linkId: "L-far", eventId: "e-far", googleEventId: "g-far" },
    ]);
  });

  it("창 안·목록에 없음·pendingPush → recheck 만(지워졌을지 모르는 구글 일정에 덮어쓰지 않는다)", () => {
    expect(planSync(input({ google: [], site: [inWindow], links: [{ ...L1, pendingPush: true }] }))).toEqual([
      { kind: "recheck", linkId: "L1", eventId: "e1", googleEventId: "g1" },
    ]);
  });
});

describe("planSync — readOnly 연결은 사이트에서 구글로 보내지 않는다", () => {
  const L = (over: Partial<PlanLink> = {}) => link("L1", "e1", "g1", { readOnly: "recurring", ...over });

  it("사이트가 바뀌었어도 · pendingPush 여도 · 둘 다 바뀌고 사이트가 나중이어도 · 창 밖 pendingPush 여도 pushUpdate 없음", () => {
    const cases: PlanInput[] = [
      input({ google: [gev("g1")], site: [site("e1", { updatedAt: LATER })], links: [L()] }),
      input({ google: [gev("g1")], site: [site("e1")], links: [L({ pendingPush: true })] }),
      input({ google: [gev("g1", { updated: LATER.toISOString() })], site: [site("e1", { updatedAt: LATEST })], links: [L({ readOnly: "multiday" })] }),
      input({ google: [], site: [site("e1", { start: new Date(WINDOW.max.getTime() + DAY) })], links: [L({ pendingPush: true })] }),
    ];
    for (const c of cases) expect(kinds(planSync(c))).not.toContain("pushUpdate");
  });

  it("연결에 readOnly 가 아직 없어도 지금 구글 일정이 반복 회차·여러 날이면 보내지 않는다", () => {
    const recurring = gev("g1", { recurringEventId: "series" });
    const multiday = gev("g1", { start: { date: "2026-10-20" }, end: { date: "2026-10-23" } });
    for (const g of [recurring, multiday]) {
      expect(kinds(planSync(input({ google: [g], site: [site("e1", { updatedAt: LATER })], links: [link("L1", "e1", "g1")] })))).not.toContain(
        "pushUpdate",
      );
    }
  });

  it("구글이 바뀌면 readOnly 라도 updateSite 는 한다", () => {
    const g1 = gev("g1", { updated: LATER.toISOString(), recurringEventId: "series" });
    expect(planSync(input({ google: [g1], site: [site("e1")], links: [L()] }))).toEqual([
      { kind: "updateSite", linkId: "L1", eventId: "e1", google: g1 },
    ]);
  });
});

describe("planSync — 묘비", () => {
  it("pendingDelete(eventId null) → deleteGoogle, 그 구글 일정을 사이트에 다시 만들지 않는다", () => {
    const actions = planSync(
      input({ google: [gev("g1")], site: [], links: [link("L1", null, "g1", { pendingDelete: true })] }),
    );
    expect(actions).toEqual([{ kind: "deleteGoogle", linkId: "L1", googleEventId: "g1" }]);
  });

  it("readOnly 연결의 묘비는 구글에서 지우지 않는다 — 반복 회차·시리즈를 사이트에서 지우는 길은 없다", () => {
    expect(
      planSync(input({ google: [gev("g1_1")], links: [link("L1", null, "g1_1", { pendingDelete: true, readOnly: "recurring" })] })),
    ).toEqual([]);
    expect(
      planSync(input({ google: [], links: [link("L1", null, "g2", { pendingDelete: true, readOnly: "multiday" })] })),
    ).toEqual([]);
  });

  it("묘비인데 지금 구글 일정이 여러 날·반복이면(연결엔 아직 표시가 없어도) 지우지 않는다", () => {
    const multi = gev("g1", { start: { date: "2026-10-20" }, end: { date: "2026-10-23" } });
    expect(planSync(input({ google: [multi], links: [link("L1", null, "g1", { pendingDelete: true })] }))).toEqual([]);
    const inst = gev("g2_1", { recurringEventId: "g2" });
    expect(planSync(input({ google: [inst], links: [link("L2", null, "g2_1", { pendingDelete: true })] }))).toEqual([]);
  });

  it("목록에 없어도·끝까지 못 읽었어도 묘비는 지운다(사이트에서 사람이 지운 것이라)", () => {
    expect(
      planSync(input({ complete: false, google: [], links: [link("L1", null, "g1", { pendingDelete: true })] })),
    ).toEqual([{ kind: "deleteGoogle", linkId: "L1", googleEventId: "g1" }]);
  });

  it("eventId 가 null 인데 묘비 표시가 없는 연결은 아무것도 안 한다 — 구글을 지우지도, 다시 만들지도 않는다", () => {
    // 사이트에서 지운 직후(구글 삭제 전) 잠깐 생기는 모양이고, 견본 일정을 통째로 지웠을 때도 생긴다.
    // 여기서 구글을 지우면 사이트 DB 를 비우는 것만으로 진짜 캘린더가 비워진다.
    expect(planSync(input({ google: [gev("g1")], links: [link("L1", null, "g1")] }))).toEqual([]);
  });
});

describe("planSync — 처음 합치기 (initial=true)", () => {
  it("오늘 이후·연결 없는 사이트 일정: 같은 날·같은 제목이면 link, 없으면 pushNew, 짝 없는 지난 일정은 아무것도", () => {
    const gDentist = gev("g-dentist", { summary: "치과 " }); // 10/20 10:00 KST
    const sDentist = site("s-dentist", { title: "치과", start: new Date("2026-10-20T05:00:00.000Z") }); // 같은 날 다른 시각
    const sNew = site("s-new", { title: "새 일정" });
    const sToday = site("s-today", { title: "오늘", start: new Date("2026-10-15T15:00:00.000Z") }); // 10/16 00:00 KST = 오늘
    const sPast = site("s-past", { title: "지난 일정", start: new Date("2026-10-15T14:00:00.000Z") }); // 10/15 23:00 KST
    const actions = planSync(
      input({ initial: true, initialDoneAt: null, google: [gDentist], site: [sDentist, sNew, sToday, sPast] }),
    );
    expect(actions).toEqual([
      { kind: "link", eventId: "s-dentist", google: gDentist },
      { kind: "pushNew", eventId: "s-new" },
      { kind: "pushNew", eventId: "s-today" },
    ]);
  });

  // 지난 일정(창 안)도 잇기는 한다 — 안 이으면 양쪽에 따로 적힌 지난 일정이 createSite 로 사이트에 하나 더 생긴다.
  // 보내지는(pushNew) 않는다.
  const PAST_DAY = { dateTime: "2026-10-10T19:00:00+09:00", timeZone: "Asia/Seoul" }; // 10/10 KST — 오늘(10/16) 전, 창 안
  const pastSite = (id: string, title: string) => site(id, { title, start: new Date("2026-10-10T03:00:00.000Z") }); // 10/10 12:00 KST

  it("(a) 지난 사이트 일정 + 같은 날·같은 제목 지난 구글 일정 → link, 그 구글 일정은 createSite 안 함 · 짝 없는 지난 구글 일정은 createSite", () => {
    const gAnniv = gev("g-anniv", { summary: "결혼기념일", start: PAST_DAY, end: PAST_DAY });
    const gOther = gev("g-other", { summary: "지난 다른 일", start: PAST_DAY, end: PAST_DAY });
    const actions = planSync(
      input({ initial: true, initialDoneAt: null, google: [gAnniv, gOther], site: [pastSite("s-anniv", "결혼기념일")] }),
    );
    expect(actions).toEqual([
      { kind: "link", eventId: "s-anniv", google: gAnniv },
      { kind: "createSite", google: gOther },
    ]);
  });

  it("(b) 짝 없는 지난 사이트 일정 → 아무것도(pushNew 없음) — 창 밖으로 오래된 것도", () => {
    const old = site("s-old", { title: "아주 옛일", start: new Date(WINDOW.min.getTime() - DAY) });
    expect(planSync(input({ initial: true, initialDoneAt: null, google: [], site: [pastSite("s-past", "지난 일"), old] }))).toEqual([]);
  });

  it("(c) 구글 일정 하나는 지난·앞으로의 사이트 일정에 두 번 이어지지 않는다(같은 used 를 나눠 쓴다)", () => {
    // 같은 날이어야 짝이 되므로 지난 일정과 앞으로의 일정이 한 구글 일정을 두고 다툴 수는 없다 — 대신
    // ① 같은 제목의 지난·앞으로 일정이 함께 있어도 각자 제 날짜의 구글 일정에만 이어지고,
    // ② 같은 날 지난 일정 둘이 구글 하나를 두고 다투면 하나만 이어지고 나머지는 보내지도 않는다.
    const gPast = gev("g-past", { summary: "치과", start: PAST_DAY, end: PAST_DAY });
    const gFuture = gev("g-future", { summary: "치과" }); // 10/20
    const sPast = pastSite("s-past", "치과");
    const sFuture = site("s-future", { title: "치과" }); // 10/20
    expect(planSync(input({ initial: true, initialDoneAt: null, google: [gFuture, gPast], site: [sFuture, sPast] }))).toEqual([
      { kind: "link", eventId: "s-future", google: gFuture },
      { kind: "link", eventId: "s-past", google: gPast },
    ]);
    // 앞으로의 짝만 있으면 지난 일정은 그 구글 일정을 가져가지 않는다(날짜가 다르다) — 그대로 사이트에만
    expect(planSync(input({ initial: true, initialDoneAt: null, google: [gFuture], site: [sPast, sFuture] }))).toEqual([
      { kind: "link", eventId: "s-future", google: gFuture },
    ]);
    // 같은 날 지난 일정 둘 · 구글 하나 → link 하나, 나머지는 아무것도
    expect(
      planSync(input({ initial: true, initialDoneAt: null, google: [gPast], site: [pastSite("s-p1", "치과"), pastSite("s-p2", "치과")] })),
    ).toEqual([{ kind: "link", eventId: "s-p1", google: gPast }]);
  });

  it("남은 구글 일정은 createSite, 취소된 구글 일정과는 잇지 않는다", () => {
    const cancelled: GEvent = { ...gev("g-x", { summary: "치과" }), status: "cancelled" };
    const other = gev("g-other", { summary: "다른 일" });
    const s = site("s1", { title: "치과" });
    expect(planSync(input({ initial: true, initialDoneAt: null, google: [cancelled, other], site: [s] }))).toEqual([
      { kind: "createSite", google: other },
      { kind: "pushNew", eventId: "s1" },
    ]);
  });

  it("같은 구글 일정은 한 번만 쓰인다 — 사이트 둘·구글 하나 → link 하나 + pushNew 하나", () => {
    const g = gev("g1", { summary: "치과" });
    const actions = planSync(
      input({ initial: true, initialDoneAt: null, google: [g], site: [site("s1", { title: "치과" }), site("s2", { title: "치과" })] }),
    );
    expect(actions).toEqual([
      { kind: "link", eventId: "s1", google: g },
      { kind: "pushNew", eventId: "s2" },
    ]);
  });

  it("사이트 일정도 한 번만 — 사이트 하나·구글 둘 → link 하나 + createSite 하나", () => {
    const g1 = gev("g1", { summary: "치과" });
    const g2 = gev("g2", { summary: "치과" });
    expect(planSync(input({ initial: true, initialDoneAt: null, google: [g1, g2], site: [site("s1", { title: "치과" })] }))).toEqual([
      { kind: "link", eventId: "s1", google: g1 },
      { kind: "createSite", google: g2 },
    ]);
  });

  it("이미 연결된 사이트 일정·구글 일정은 처음 합치기 대상이 아니다", () => {
    const g1 = gev("g1", { summary: "치과" });
    const actions = planSync(
      input({ initial: true, initialDoneAt: null, google: [g1], site: [site("s1", { title: "치과" })], links: [link("L1", "s1", "g1")] }),
    );
    expect(actions).toEqual([]);
  });

  it("끝까지 못 읽었으면(complete=false) pushNew 를 만들지 않는다 — 못 읽은 쪽에 짝이 있을 수 있다", () => {
    const g = gev("g1", { summary: "치과" });
    const actions = planSync(
      input({
        initial: true,
        initialDoneAt: null,
        complete: false,
        google: [g],
        site: [site("s1", { title: "치과" }), site("s2", { title: "짝 없음" })],
      }),
    );
    expect(kinds(actions)).not.toContain("pushNew");
    expect(actions).toEqual([{ kind: "link", eventId: "s1", google: g }]);
  });
});

describe("planSync — 평소 (initial=false)", () => {
  it("createdAt >= initialDoneAt · source=local · 연결 없음 → pushNew, 나머지는 아무것도", () => {
    const after = site("s-after", { createdAt: new Date(INITIAL_DONE.getTime() + 1000) });
    const exactly = site("s-exact", { createdAt: INITIAL_DONE });
    const before = site("s-before", { createdAt: new Date(INITIAL_DONE.getTime() - 1000) });
    const fromGoogle = site("s-google", { source: "google", createdAt: new Date(INITIAL_DONE.getTime() + 1000) });
    const linked = site("s-linked", { createdAt: new Date(INITIAL_DONE.getTime() + 1000) });
    const past = site("s-past", { createdAt: new Date(INITIAL_DONE.getTime() + 1000), start: new Date("2026-09-01T00:00:00Z") });
    const actions = planSync(
      input({
        google: [gev("g-linked")],
        site: [after, exactly, before, fromGoogle, linked, past],
        links: [link("L", "s-linked", "g-linked")],
      }),
    );
    expect(actions).toEqual([
      { kind: "pushNew", eventId: "s-after" },
      { kind: "pushNew", eventId: "s-exact" },
      { kind: "pushNew", eventId: "s-past" }, // 처음 합치기 뒤에 만든 것이면 날짜와 상관없이 보낸다(스펙 §6)
    ]);
  });

  it("평소에는 같은 날·같은 제목이어도 잇지 않는다(link 없음)", () => {
    const g = gev("g1", { summary: "치과" });
    const s = site("s1", { title: "치과", createdAt: new Date(INITIAL_DONE.getTime() + 1000) });
    expect(planSync(input({ google: [g], site: [s] }))).toEqual([
      { kind: "createSite", google: g },
      { kind: "pushNew", eventId: "s1" },
    ]);
  });

  it("initialDoneAt 이 없으면 pushNew 를 만들지 않는다", () => {
    const s = site("s1", { createdAt: new Date(INITIAL_DONE.getTime() + 1000) });
    expect(planSync(input({ initialDoneAt: null, site: [s] }))).toEqual([]);
  });
});
