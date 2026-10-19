import { describe, it, expect, afterEach } from "vitest";
import {
  seoulDate,
  seoulMidnight,
  toGoogle,
  fromGoogle,
  sameDaySameTitle,
  readOnlyOf,
  type SiteFields,
} from "@/lib/gcal/map";
import type { GEvent } from "@/lib/gcal/client";

// 서버 시간대에 기대면 안 된다 — 운영(Vercel)은 UTC, 이 맥은 Asia/Seoul 이다.
// 이 맥에서만 돌리면 "로컬 시각에 기댄 실수" 가 그대로 통과하므로, 시험이 TZ 를 직접 바꿔 가며 두 번 본다.
const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

/** TZ 를 바꾸고, 정말 바뀌었는지 카나리아로 확인한다(바뀌지 않으면 두 번 돌린 의미가 없다). */
function useTz(tz: "UTC" | "Asia/Seoul") {
  process.env.TZ = tz;
  const offset = new Date("2026-10-20T00:00:00").getTimezoneOffset();
  expect(offset).toBe(tz === "UTC" ? 0 : -540);
}

const base: SiteFields = {
  title: "치과",
  description: null,
  location: null,
  start: new Date("2026-10-20T10:00:00+09:00"),
  end: new Date("2026-10-20T11:00:00+09:00"),
  allDay: false,
  color: "rose",
};

function g(over: Partial<GEvent>): GEvent {
  return { id: "g1", status: "confirmed", updated: "2026-10-16T00:00:00.000Z", summary: "치과", ...over };
}

describe("seoulDate · seoulMidnight", () => {
  for (const tz of ["UTC", "Asia/Seoul"] as const) {
    it(`TZ=${tz} 에서도 한국 날짜 — 자정 직전·직후 경계`, () => {
      useTz(tz);
      // 2026-10-19 15:00Z = 10/20 00:00 KST
      expect(seoulDate(new Date("2026-10-19T14:59:59.999Z"))).toBe("2026-10-19");
      expect(seoulDate(new Date("2026-10-19T15:00:00.000Z"))).toBe("2026-10-20");
      expect(seoulMidnight("2026-10-20").toISOString()).toBe("2026-10-19T15:00:00.000Z");
      expect(seoulDate(seoulMidnight("2026-12-31"))).toBe("2026-12-31");
    });
  }
});

describe("toGoogle / fromGoogle", () => {
  it("시간 일정 왕복 — KST 10:00~11:00 → dateTime + Asia/Seoul → 같은 절대 시각", () => {
    const body = toGoogle(base);
    expect(body.start).toEqual({ dateTime: "2026-10-20T01:00:00.000Z", timeZone: "Asia/Seoul" });
    expect(body.end).toEqual({ dateTime: "2026-10-20T02:00:00.000Z", timeZone: "Asia/Seoul" });
    expect(body.summary).toBe("치과");

    const back = fromGoogle(g({ ...body }));
    expect(back.readOnly).toBeNull();
    expect(back.fields.allDay).toBe(false);
    expect(back.fields.start.getTime()).toBe(base.start.getTime());
    expect(back.fields.end?.getTime()).toBe(base.end!.getTime());
    expect(back.fields).toEqual({ ...base });
  });

  it("구글이 +09:00 오프셋으로 준 dateTime 도 같은 절대 시각", () => {
    const back = fromGoogle(
      g({ start: { dateTime: "2026-10-20T10:00:00+09:00", timeZone: "Asia/Seoul" }, end: { dateTime: "2026-10-20T11:00:00+09:00" } }),
    );
    expect(back.fields.start.toISOString()).toBe("2026-10-20T01:00:00.000Z");
    expect(back.fields.end?.toISOString()).toBe("2026-10-20T02:00:00.000Z");
  });

  it("끝 없는 사이트 일정 → 구글 끝 = 시작 + 1시간 (구글은 끝이 필수)", () => {
    const body = toGoogle({ ...base, end: null });
    expect(body.end).toEqual({ dateTime: "2026-10-20T02:00:00.000Z", timeZone: "Asia/Seoul" });
  });

  it("끝 없는 늦은 일정(23:30)은 끝을 그날 자정으로 — 이틀짜리가 되어 readOnly 로 잠기지 않게", () => {
    const late = { ...base, start: new Date("2026-10-20T23:30:00+09:00"), end: null };
    const body = toGoogle(late);
    expect(body.end?.dateTime).toBe(new Date("2026-10-21T00:00:00+09:00").toISOString());
    expect(fromGoogle(g({ ...body })).readOnly).toBeNull();
  });

  it("끝이 시작보다 앞이면 시작 + 1시간 (구글이 거절하는 빈 구간을 보내지 않는다)", () => {
    const body = toGoogle({ ...base, end: new Date("2026-10-20T09:00:00+09:00") });
    expect(body.end?.dateTime).toBe("2026-10-20T02:00:00.000Z");
  });

  it("메모·장소는 그대로, 비었으면 빈 글자로 보내(PATCH 에서 지워지게) 돌아올 때 null", () => {
    const withText = toGoogle({ ...base, description: "스케일링", location: "서울치과" });
    expect(withText.description).toBe("스케일링");
    expect(withText.location).toBe("서울치과");
    const empty = toGoogle(base);
    expect(empty.description).toBe("");
    expect(empty.location).toBe("");
    const back = fromGoogle(g({ ...empty }));
    expect(back.fields.description).toBeNull();
    expect(back.fields.location).toBeNull();
    expect(fromGoogle(g({ ...withText })).fields).toMatchObject({ description: "스케일링", location: "서울치과" });
  });

  for (const tz of ["UTC", "Asia/Seoul"] as const) {
    it(`종일 10/20 → {date:2026-10-20}/{date:2026-10-21} → 돌아와 10/20 KST 자정 (TZ=${tz})`, () => {
      useTz(tz);
      // 사이트가 실제로 저장하는 모양: /api/events 는 "yyyy-MM-ddT00:00:00" 을 **서버 로컬** 자정으로 만든다.
      const serverLocal = new Date("2026-10-20T00:00:00");
      for (const start of [serverLocal, seoulMidnight("2026-10-20")]) {
        const body = toGoogle({ ...base, allDay: true, start, end: null });
        expect(body.start).toEqual({ date: "2026-10-20" });
        expect(body.end).toEqual({ date: "2026-10-21" });
      }
      const back = fromGoogle(g({ start: { date: "2026-10-20" }, end: { date: "2026-10-21" } }));
      expect(back.readOnly).toBeNull();
      expect(back.fields.allDay).toBe(true);
      expect(back.fields.end).toBeNull();
      expect(back.fields.start.toISOString()).toBe("2026-10-19T15:00:00.000Z");
      expect(seoulDate(back.fields.start)).toBe("2026-10-20");
    });

    it(`종일 일정의 다음 날 — 달·해 넘김 (TZ=${tz})`, () => {
      useTz(tz);
      expect(toGoogle({ ...base, allDay: true, start: seoulMidnight("2026-10-31"), end: null }).end).toEqual({ date: "2026-11-01" });
      expect(toGoogle({ ...base, allDay: true, start: seoulMidnight("2026-12-31"), end: null }).end).toEqual({ date: "2027-01-01" });
    });
  }

  it("여러 날 종일(10/20~10/23) → readOnly multiday, 시작 10/20", () => {
    const back = fromGoogle(g({ start: { date: "2026-10-20" }, end: { date: "2026-10-24" } }));
    expect(back.readOnly).toBe("multiday");
    expect(back.fields.allDay).toBe(true);
    expect(seoulDate(back.fields.start)).toBe("2026-10-20");
  });

  it("자정을 넘는 시간 일정(22:00~다음 날 01:00)도 multiday — 사이트 양식이 하루짜리라", () => {
    const back = fromGoogle(
      g({ start: { dateTime: "2026-10-20T22:00:00+09:00" }, end: { dateTime: "2026-10-21T01:00:00+09:00" } }),
    );
    expect(back.readOnly).toBe("multiday");
  });

  it("자정에 끝나는 시간 일정(23:00~24:00)은 하루짜리", () => {
    const back = fromGoogle(
      g({ start: { dateTime: "2026-10-20T23:00:00+09:00" }, end: { dateTime: "2026-10-21T00:00:00+09:00" } }),
    );
    expect(back.readOnly).toBeNull();
  });

  it("recurringEventId → readOnly recurring (여러 날이어도 recurring 이 먼저)", () => {
    const one = fromGoogle(g({ recurringEventId: "series1", start: { date: "2026-10-20" }, end: { date: "2026-10-21" } }));
    expect(one.readOnly).toBe("recurring");
    const multi = fromGoogle(g({ recurringEventId: "series1", start: { date: "2026-10-20" }, end: { date: "2026-10-23" } }));
    expect(multi.readOnly).toBe("recurring");
  });

  it("recurrence 가 있는 일정(반복 시리즈 원본) → readOnly recurring — 원본 id 로 고치면 시리즈 전체가 바뀐다", () => {
    const master = g({
      recurrence: ["RRULE:FREQ=WEEKLY"],
      start: { dateTime: "2026-10-20T10:00:00+09:00" },
      end: { dateTime: "2026-10-20T11:00:00+09:00" },
    });
    expect(readOnlyOf(master)).toBe("recurring");
    expect(fromGoogle(master).readOnly).toBe("recurring");
    expect(readOnlyOf(g({ recurrence: [] }))).toBeNull(); // 빈 배열은 반복이 아니다
  });

  it("색 왕복 — 스펙 표(lavender↔1, mint↔2, rose↔4, butter↔5, peach↔6, sky↔7)", () => {
    const table: [string, string][] = [
      ["lavender", "1"],
      ["mint", "2"],
      ["rose", "4"],
      ["butter", "5"],
      ["peach", "6"],
      ["sky", "7"],
    ];
    for (const [color, colorId] of table) {
      expect(toGoogle({ ...base, color }).colorId).toBe(colorId);
      expect(fromGoogle(g({ colorId, start: { date: "2026-10-20" }, end: { date: "2026-10-21" } })).fields.color).toBe(color);
    }
  });

  it("모르는 colorId·색 없음 → 사이트 기본 sky", () => {
    for (const colorId of ["3", "11", undefined]) {
      expect(fromGoogle(g({ colorId, start: { date: "2026-10-20" }, end: { date: "2026-10-21" } })).fields.color).toBe("sky");
    }
  });

  it("제목 없는 구글 일정은 '(제목 없음)' — 사이트 일정은 제목이 필수라", () => {
    const back = fromGoogle(g({ summary: undefined, start: { date: "2026-10-20" }, end: { date: "2026-10-21" } }));
    expect(back.fields.title).toBe("(제목 없음)");
  });

  it("시작이 없으면(취소된 일정 모양) 던진다 — 호출하는 쪽이 cancelled 를 먼저 거른다", () => {
    expect(() => fromGoogle({ id: "x", status: "cancelled", updated: "2026-10-16T00:00:00Z" })).toThrow();
  });
});

describe("sameDaySameTitle", () => {
  for (const tz of ["UTC", "Asia/Seoul"] as const) {
    it(`앞뒤 공백 무시 · 대소문자 그대로 · KST 날짜 비교 (TZ=${tz})`, () => {
      useTz(tz);
      const site = { start: new Date("2026-10-20T00:00:00"), title: "  Dentist " }; // 서버 로컬 자정(종일 일정 모양)
      const allDay = g({ summary: "Dentist", start: { date: "2026-10-20" }, end: { date: "2026-10-21" } });
      expect(sameDaySameTitle(site, allDay)).toBe(true);
      expect(sameDaySameTitle(site, { ...allDay, summary: " Dentist  " })).toBe(true);
      expect(sameDaySameTitle(site, { ...allDay, summary: "dentist" })).toBe(false);
      expect(sameDaySameTitle(site, { ...allDay, start: { date: "2026-10-21" } })).toBe(false);

      // 시간 일정 — 10/20 23:30 KST 는 UTC 로는 10/20 14:30, 10/21 00:30 KST 는 UTC 로 10/20 15:30
      const timedSite = { start: new Date("2026-10-20T23:30:00+09:00"), title: "Dentist" };
      expect(sameDaySameTitle(timedSite, g({ summary: "Dentist", start: { dateTime: "2026-10-20T09:00:00+09:00" } }))).toBe(true);
      expect(sameDaySameTitle(timedSite, g({ summary: "Dentist", start: { dateTime: "2026-10-21T00:30:00+09:00" } }))).toBe(false);
    });
  }

  it("시작이 없는 구글 일정(취소됨)은 맞지 않는다 — 던지지 않는다", () => {
    expect(sameDaySameTitle(base, { id: "x", status: "cancelled", updated: "2026-10-16T00:00:00Z" })).toBe(false);
  });
});
