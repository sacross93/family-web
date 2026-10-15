import { describe, it, expect } from "vitest";
import { stageOf, journeyMarks, firstLineOf } from "./journey-core";
import { predictCycle } from "./cycle";

const d = (s: string) => {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
};
const preg = (over: Partial<{ birthDate: Date | null; dueDate: Date; nickname: string }> = {}) => ({
  id: "p1", nickname: "콩이", emoji: "🌱", color: "rose", dueDate: d("2027-05-01"),
  birthDate: null, endedAt: null, createdAt: d("2026-09-01"), updatedAt: d("2026-09-01"), ...over,
});
const ev = (date: string, kind: string, result: string | null = null) =>
  ({ id: date + kind, date: d(date), kind, result, createdAt: d(date) });
const hosp = (date: string, content: string) =>
  ({ id: "h" + date, date: d(date), kind: "checkup", mood: null, content, authorId: null, pregnancyId: null, createdAt: d(date), updatedAt: d(date) });

describe("stageOf", () => {
  it("진행 중인 임신 없음 → prep, 있음 → pregnant, 출생일 → born", () => {
    expect(stageOf(null)).toBe("prep");
    expect(stageOf(preg())).toBe("pregnant");
    expect(stageOf(preg({ birthDate: d("2027-05-02") }))).toBe("born");
  });
});

describe("journeyMarks", () => {
  const events = [ev("2026-09-01", "periodStart"), ev("2026-09-04", "periodEnd"), ev("2026-09-29", "periodStart")];
  const today = d("2026-10-05");

  it("준비: 기록된 생리 · 예정(추정) · 가임기(추정) · 배란 예정(추정)", () => {
    const marks = journeyMarks({ stage: "prep", active: null, cycleEvents: events, prediction: predictCycle(events, today), upcomingHospital: [] });
    const of = (k: string) => marks.filter((m) => m.kind === k).map((m) => m.date);
    expect(of("period")).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-29"]);
    // 평균 28 → 다음 10/27, 생리 길이 4일
    expect(of("periodPredicted")).toEqual(["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);
    expect(of("ovulation")).toEqual(["2026-10-13"]);
    expect(of("fertile")).toEqual(["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-14"]);
    for (const m of marks.filter((m) => m.kind !== "period")) expect(m.label).toContain("추정");
  });
  it("예정일이 지났으면 예정·가임기를 그리지 않는다", () => {
    const late = predictCycle(events, d("2026-11-10"));
    const marks = journeyMarks({ stage: "prep", active: null, cycleEvents: events, prediction: late, upcomingHospital: [] });
    expect(marks.some((m) => m.kind !== "period")).toBe(false);
  });
  it("임신: 주기 표시는 없고 출산 예정일이 있다", () => {
    const marks = journeyMarks({ stage: "pregnant", active: preg(), cycleEvents: events, prediction: null, upcomingHospital: [] });
    expect(marks.map((m) => m.kind)).toEqual(["due"]);
    expect(marks[0]).toMatchObject({ date: "2027-05-01", label: "콩이 출산 예정일" });
  });
  it("병원 기록은 단계와 상관없이 첫 줄로", () => {
    const h = [hosp("2026-10-20", "## 산부인과 상담\n물어볼 것")];
    for (const stage of ["prep", "pregnant", "born"] as const) {
      const marks = journeyMarks({ stage, active: stage === "prep" ? null : preg(), cycleEvents: [], prediction: null, upcomingHospital: h });
      expect(marks.find((m) => m.kind === "hospital")).toMatchObject({ date: "2026-10-20", label: "병원 · 산부인과 상담" });
    }
  });
});

describe("firstLineOf", () => {
  it("마크다운 기호를 떼고 첫 줄만, 길면 줄인다", () => {
    expect(firstLineOf("\n\n> **안녕** 하세요\n둘째 줄")).toBe("안녕 하세요");
    expect(firstLineOf("가".repeat(40), 10)).toBe("가".repeat(10) + "…");
    expect(firstLineOf("![사진](/uploads/a.png)")).toBe("사진");
  });
});
