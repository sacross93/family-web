import { describe, it, expect } from "vitest";
import { buildOccasions, occasionWindow, type CalendarOccasions } from "./occasions";
import { occasionsOn, occasionsSpeech, planRange, upcomingOccasions } from "./occasion-marks";
import { interleaveMarks } from "./journey-marks";

const TODAY = new Date(2026, 9, 27); // 2026-10-27

describe("buildOccasions — 서버가 세어 넘기는 것", () => {
  const annis = [
    // 음력 3월 15일 반복 — 해마다 양력 날이 다르다(2026-05-01 · 2027-04-21 …)
    { id: "mom", title: "엄마 생일", emoji: "🎂", date: new Date(1962, 3, 19), recurring: true, lunar: { month: 3, day: 15, leap: false } },
    // 양력 반복
    { id: "wed", title: "결혼기념일", emoji: "💍", date: new Date(2020, 10, 3), recurring: true, lunar: null },
    // 한 번뿐, 범위 밖(옛날)
    { id: "old", title: "옛 행사", emoji: "🎉", date: new Date(2001, 0, 1), recurring: false },
  ];
  const plans = [
    { id: "jeju", title: "제주 여행", emoji: "🌴", startDate: new Date(2026, 9, 26), endDate: new Date(2026, 9, 29) },
    { id: "nodate", title: "언젠가", emoji: "🗺️", startDate: null, endDate: null },
    { id: "oneday", title: "소풍", emoji: "🧺", startDate: new Date(2026, 10, 7), endDate: null },
    { id: "backwards", title: "끝이 앞", emoji: "🧭", startDate: new Date(2026, 10, 10), endDate: new Date(2026, 10, 8) },
  ];
  const o = buildOccasions(annis, plans, TODAY);

  it("범위는 작년 1월 1일 ~ 내후년 12월 31일", () => {
    const w = occasionWindow(TODAY);
    expect([w.from, w.to]).toEqual([new Date(2025, 0, 1), new Date(2028, 11, 31)]);
  });

  it("음력 기념일은 음력으로 센 날에 — 저장된 양력 날(4/19)이 아니다", () => {
    const mom = o.anniversaries.find((a) => a.id === "mom")!;
    expect(mom.lunar).toBe("음력 3월 15일");
    expect(mom.dates).toContain("2026-05-01");
    expect(mom.dates).not.toContain("2026-04-19");
    expect(mom.dates).toHaveLength(4); // 2025·2026·2027·2028
  });

  it("양력 반복은 해마다 같은 날", () => {
    expect(o.anniversaries.find((a) => a.id === "wed")!.dates).toEqual([
      "2025-11-03", "2026-11-03", "2027-11-03", "2028-11-03",
    ]);
  });

  it("범위에 걸리는 날이 없으면 싣지 않는다", () => {
    expect(o.anniversaries.map((a) => a.id)).not.toContain("old");
  });

  it("계획: 날짜 없는 것은 빼고, 끝이 없거나 앞이면 하루짜리", () => {
    expect(o.plans).toEqual([
      { id: "jeju", title: "제주 여행", emoji: "🌴", start: "2026-10-26", end: "2026-10-29" },
      { id: "oneday", title: "소풍", emoji: "🧺", start: "2026-11-07", end: "2026-11-07" },
      { id: "backwards", title: "끝이 앞", emoji: "🧭", start: "2026-11-10", end: "2026-11-10" },
    ]);
  });
});

const occ: CalendarOccasions = {
  anniversaries: [
    { id: "mom", title: "엄마 생일", emoji: "🎂", lunar: "음력 3월 15일", dates: ["2026-05-01", "2027-04-21"] },
    { id: "wed", title: "결혼기념일", emoji: "💍", lunar: null, dates: ["2025-11-03", "2026-11-03", "2027-11-03"] },
  ],
  plans: [
    { id: "jeju", title: "제주 여행", emoji: "🌴", start: "2026-10-26", end: "2026-10-29" },
    { id: "pic", title: "소풍", emoji: "🧺", start: "2026-11-07", end: "2026-11-07" },
    { id: "far", title: "먼 여행", emoji: "✈️", start: "2027-03-01", end: "2027-03-05" },
  ],
};

describe("occasionsOn·occasionsSpeech — 격자 칸", () => {
  it("계획은 시작~끝 사이 날마다(끝 포함), 기념일은 그날", () => {
    expect(occasionsOn(occ, "2026-10-29").plans.map((p) => p.id)).toEqual(["jeju"]);
    expect(occasionsOn(occ, "2026-10-30").plans).toEqual([]);
    expect(occasionsOn(occ, "2026-11-03").anniversaries.map((a) => a.id)).toEqual(["wed"]);
  });

  it("칸 이름에 붙일 글", () => {
    expect(occasionsSpeech(occasionsOn(occ, "2026-10-01"))).toBe("");
    expect(occasionsSpeech(occasionsOn(occ, "2026-11-03"))).toBe(", 기념일 결혼기념일");
    expect(occasionsSpeech(occasionsOn(occ, "2026-10-27"))).toBe(", 계획 제주 여행");
  });
});

describe("upcomingOccasions — 폰 목록", () => {
  it("오늘~until 사이, 기념일은 첫 날 하나, 계획은 첫날 하나 — 이미 시작한 계획은 오늘 줄로", () => {
    const got = upcomingOccasions(occ, "2026-10-27", "2026-12-26");
    expect(got.map((g) => `${g.date} ${g.kind} ${g.id}${g.ongoing ? " 진행중" : ""}`)).toEqual([
      "2026-10-27 plan jeju 진행중",
      "2026-11-03 anniversary wed",
      "2026-11-07 plan pic",
    ]);
  });

  it("링크는 그 화면으로", () => {
    const got = upcomingOccasions(occ, "2026-10-27", "2026-12-26");
    expect(got.find((g) => g.id === "jeju")!.href).toBe("/plans/jeju");
    expect(got.find((g) => g.id === "wed")!.href).toBe("/anniversaries");
  });

  it("until 너머는 넣지 않는다(먼 여행·내년 생일)", () => {
    const ids = upcomingOccasions(occ, "2026-10-27", "2026-12-26").map((g) => g.id);
    expect(ids).not.toContain("far");
    expect(ids).not.toContain("mom");
  });

  it("끝난 계획은 넣지 않는다", () => {
    expect(upcomingOccasions(occ, "2026-10-30", "2026-11-01").map((g) => g.id)).toEqual([]);
  });

  it("일정 사이에 날짜순으로 끼울 수 있다(같은 날이면 표시가 먼저)", () => {
    const rows = interleaveMarks(
      [{ id: "e1", day: "2026-11-03" }],
      (e) => e.day,
      upcomingOccasions(occ, "2026-10-27", "2026-12-26")
    );
    expect(rows.map((r) => (r.type === "mark" ? r.mark.id : r.item.id))).toEqual(["jeju", "wed", "e1", "pic"]);
  });
});

describe("planRange", () => {
  it("하루면 그 날, 여러 날이면 ~", () => {
    expect(planRange({ start: "2026-11-07", end: "2026-11-07" })).toBe("11월 7일");
    expect(planRange({ start: "2026-10-26", end: "2026-10-29" })).toBe("10월 26일 ~ 10월 29일");
  });
});
