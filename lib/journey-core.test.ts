import { describe, it, expect } from "vitest";
import { stageOf, journeyMarks, firstLineOf, prepCountdown, findNextCheckup } from "./journey-core";
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
const hosp = (date: string, content: string, pregnancyId: string | null = null) =>
  ({ id: "h" + date, date: d(date), kind: "checkup", mood: null, content, authorId: null, pregnancyId, createdAt: d(date), updatedAt: d(date) });

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

// 홈 카드·초대 줄·포동이 목차가 **이 하나에서** 글자를 받는다(예전엔 세 군데가 따로 만들었다).
describe("prepCountdown", () => {
  it("예정일 전: D-N", () => {
    const p = predictCycle([ev("2026-10-01", "periodStart")], d("2026-10-05"))!;
    expect(prepCountdown(p)).toEqual({ label: "다음 생리 예정", value: "D-24", line: "다음 생리 예정 D-24 · 추정" });
  });
  it("예정일 당일: 오늘", () => {
    const p = predictCycle([ev("2026-10-01", "periodStart")], d("2026-10-29"))!;
    expect(prepCountdown(p)).toEqual({ label: "다음 생리 예정", value: "오늘", line: "다음 생리 예정 오늘 · 추정" });
  });
  it("예정일이 지났으면 굴리지 않고 지난 날수 — '다음' 이라고 하지 않는다", () => {
    const p = predictCycle([ev("2026-09-01", "periodStart")], d("2026-10-02"))!;
    const c = prepCountdown(p);
    expect(c).toEqual({ label: "예정일에서", value: "3일 지남", line: "예정일에서 3일 지남 · 추정" });
    expect(c.line).not.toContain("다음");
  });
});

// 끝난(남기기 한) 임신 때 적어 둔 앞날의 병원 기록이 준비 단계 히어로의 "다음 진료" 로 올라오면 안 된다.
describe("findNextCheckup", () => {
  const today = d("2026-10-05");
  const entries = [
    hosp("2026-10-07", "끝난 임신 때 잡은 진료", "old"),
    hosp("2026-10-09", "지금 임신 진료", "p1"),
    hosp("2026-10-12", "준비 때 상담", null),
    hosp("2026-10-01", "지난 진료", null),
  ];
  it("준비 단계: 임신에 딸린 기록은 건너뛰고 준비 때 것만", () => {
    expect(findNextCheckup(entries, null, today)?.content).toBe("준비 때 상담");
  });
  it("임신 중: 그 임신 것과 준비 때 것 — 끝난 임신 것은 건너뛴다", () => {
    expect(findNextCheckup(entries, "p1", today)?.content).toBe("지금 임신 진료");
    expect(findNextCheckup(entries.filter((e) => e.pregnancyId !== "p1"), "p1", today)?.content).toBe("준비 때 상담");
  });
  it("오늘은 들어가고, 지난 것·일기는 빠진다", () => {
    const todayVisit = hosp("2026-10-05", "오늘 진료");
    const diary = { ...hosp("2026-10-06", "일기"), kind: "diary" };
    expect(findNextCheckup([diary, todayVisit, hosp("2026-10-04", "어제")], null, today)?.content).toBe("오늘 진료");
    expect(findNextCheckup([hosp("2026-10-04", "어제")], null, today)).toBeNull();
  });
});
