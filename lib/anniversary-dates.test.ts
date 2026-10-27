import { describe, it, expect } from "vitest";
import { anniversaryWhen, anniversaryDatesBetween } from "./anniversary-dates";

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const TODAY = new Date(2026, 9, 27, 14, 30); // 2026-10-27 오후

describe("anniversaryWhen — 양력은 dday 그대로", () => {
  it("반복 양력 생일", () => {
    const w = anniversaryWhen({ date: new Date(1990, 10, 3), recurring: true }, TODAY);
    expect(ymd(w.nextDate)).toBe("2026-11-03");
    expect(w.label).toBe("D-7");
    expect(w.years).toBe(36);
  });

  it("반복 아님 — 지난 날은 D+, 나이 없음", () => {
    const w = anniversaryWhen({ date: new Date(2026, 9, 20), recurring: false }, TODAY);
    expect(w.label).toBe("D+7");
    expect(w.years).toBe(0);
  });

  it("lunar 가 null 이면 양력", () => {
    const w = anniversaryWhen({ date: new Date(1962, 3, 19), recurring: true, lunar: null }, TODAY);
    expect(ymd(w.nextDate)).toBe("2027-04-19");
  });
});

describe("anniversaryWhen — 음력", () => {
  // 음력 1962-03-15 생(양력 1962-04-19). 2026 음력 3월 15일 = 2026-05-01(지났다) → 2027.
  const mom = { date: new Date(1962, 3, 19), recurring: true, lunar: { month: 3, day: 15, leap: false } };

  it("다음 날은 음력으로 센다 — 저장된 양력(4/19)으로 세지 않는다", () => {
    const w = anniversaryWhen(mom, TODAY);
    expect(ymd(w.nextDate)).not.toBe("2027-04-19");
    // 음력 2027-03-15. 2027 음력 1월 1일 = 2027-02-07 이고 그 뒤로 대·소가 섞여 4월 하순에 온다.
    expect(w.nextDate.getFullYear()).toBe(2027);
    expect(w.label).toBe(`D-${w.days}`);
    expect(w.years).toBe(65);
  });

  it("올해 것이 아직이면 올해 — 2026-04-01 에는 2026-05-01", () => {
    const w = anniversaryWhen(mom, new Date(2026, 3, 1));
    expect(ymd(w.nextDate)).toBe("2026-05-01");
    expect(w.days).toBe(30);
    expect(w.years).toBe(64);
  });

  it("음력 12월생의 나이는 음력 해로 — 양력 해로 빼면 한 살 많다", () => {
    // KASI 표: 음력 2024-12-01 = 2024-12-31, 음력 2025-12-01 = 2026-01-19.
    // 그날 태어난 아이의 첫 생일은 2026-01-19 — 양력 해로 빼면(2026-2024) 두 살이 된다.
    const born = { date: new Date(2024, 11, 31), recurring: true, lunar: { month: 12, day: 1, leap: false } };
    const w = anniversaryWhen(born, new Date(2026, 0, 10));
    expect(ymd(w.nextDate)).toBe("2026-01-19");
    expect(w.days).toBe(9);
    expect(w.years).toBe(1);
  });

  it("음력 12월 — 양력 1월 초에도 음력 작년 12월 것을 고른다(한 해를 건너뛰지 않는다)", () => {
    const born = { date: new Date(1963, 0, 14), recurring: true, lunar: { month: 12, day: 20, leap: false } };
    const w = anniversaryWhen(born, new Date(2027, 0, 10));
    expect(ymd(w.nextDate)).toBe("2027-01-27");
    expect(w.days).toBe(17);
  });

  it("음력이어도 반복이 아니면 저장된 양력 날짜 그대로", () => {
    const w = anniversaryWhen(
      { date: new Date(2027, 1, 7), recurring: false, lunar: { month: 1, day: 1, leap: false } },
      TODAY
    );
    expect(ymd(w.nextDate)).toBe("2027-02-07");
    expect(w.years).toBe(0);
  });

  it("음력 표 범위를 넘으면 던지지 않고 양력으로 센다", () => {
    const w = anniversaryWhen(mom, new Date(2050, 11, 20));
    expect(ymd(w.nextDate)).toBe("2051-04-19");
  });
});

describe("anniversaryDatesBetween — 달력에 얹을 날", () => {
  it("양력 반복 — 범위 안의 해마다", () => {
    const got = anniversaryDatesBetween(
      { date: new Date(1990, 10, 3), recurring: true },
      new Date(2025, 0, 1),
      new Date(2026, 11, 31)
    ).map(ymd);
    expect(got).toEqual(["2025-11-03", "2026-11-03"]);
  });

  it("음력 반복 — 해마다 다른 양력 날", () => {
    const got = anniversaryDatesBetween(
      { date: new Date(2024, 8, 17), recurring: true, lunar: { month: 8, day: 15, leap: false } },
      new Date(2024, 0, 1),
      new Date(2026, 11, 31)
    ).map(ymd);
    expect(got).toEqual(["2024-09-17", "2025-10-06", "2026-09-25"]);
  });

  it("음력 12월은 양력 이듬해 1월 칸에 선다", () => {
    const got = anniversaryDatesBetween(
      { date: new Date(1963, 0, 14), recurring: true, lunar: { month: 12, day: 20, leap: false } },
      new Date(2027, 0, 1),
      new Date(2027, 0, 31)
    ).map(ymd);
    expect(got).toEqual(["2027-01-27"]);
  });

  it("원래 날짜 앞의 해에는 그리지 않는다", () => {
    const got = anniversaryDatesBetween(
      { date: new Date(2027, 4, 1), recurring: true },
      new Date(2026, 0, 1),
      new Date(2028, 11, 31)
    ).map(ymd);
    expect(got).toEqual(["2027-05-01", "2028-05-01"]);
  });

  it("반복 아님 — 범위 안일 때 그 하루만", () => {
    const a = { date: new Date(2026, 9, 3), recurring: false };
    expect(anniversaryDatesBetween(a, new Date(2026, 9, 1), new Date(2026, 9, 31)).map(ymd)).toEqual(["2026-10-03"]);
    expect(anniversaryDatesBetween(a, new Date(2026, 10, 1), new Date(2026, 10, 30))).toEqual([]);
  });
});
