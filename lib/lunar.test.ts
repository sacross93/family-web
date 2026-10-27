import { describe, it, expect } from "vitest";
import {
  lunarToSolar,
  solarToLunar,
  lunarInYear,
  nextLunar,
  hasLeapMonth,
  lunarLabel,
  parseLunar,
  matchesLunar,
} from "./lunar";

const ymd = (d: Date | null) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null;
const L = (month: number, day: number, leap = false) => ({ month, day, leap });

// ── 맞춰 본 값의 출처 ──────────────────────────────────────────────
// 한국천문연구원 천문우주지식정보 「음력 자료」(2026-10-27 확인):
//   https://astro.kasi.re.kr/life/post/calendarData?search_year=2024
//   https://astro.kasi.re.kr/life/post/calendarData?search_year=2025
//   https://astro.kasi.re.kr/life/post/calendarData?search_year=2026
// 각 쪽의 "음력 월 / 1일의 양력 날짜 / 대(30일)·소(29일)" 표에서 뽑았다. 그 쪽은 스스로
// "공식 발표 자료가 아닙니다 — 월력요항 참고" 라고 적어 두었다(공휴일 표의 설·추석 연휴와도 맞는다).
//   2024 1월 1일 = 2/10(1월은 소) · 8월 1일 = 9/3 → 8월 15일 = 9/17
//   2025 1월 1일 = 1/29 · 6월(대) 6/25 · **윤6월(소) 7/25** · 7월 8/23 · 8월 1일 = 9/22 → 8월 15일 = 10/6
//   2026 1월 1일 = 2/17 · 6월 1일 = 7/14 · 8월 1일 = 9/11 → 8월 15일 = 9/25 · 윤달 없음
describe("음력 → 양력 — KASI 표와 맞는가", () => {
  it.each([
    ["2024 설날", 2024, L(1, 1), "2024-02-10"],
    ["2024 추석", 2024, L(8, 15), "2024-09-17"],
    ["2025 설날", 2025, L(1, 1), "2025-01-29"],
    ["2025 추석", 2025, L(8, 15), "2025-10-06"],
    ["2026 설날", 2026, L(1, 1), "2026-02-17"],
    ["2026 추석", 2026, L(8, 15), "2026-09-25"],
    ["2025 윤6월 1일", 2025, L(6, 1, true), "2025-07-25"],
    ["2025 윤6월 29일(소 — 마지막 날)", 2025, L(6, 29, true), "2025-08-22"],
    ["2025 평6월 30일(대)", 2025, L(6, 30), "2025-07-24"],
  ])("%s", (_name, year, l, want) => {
    expect(ymd(lunarToSolar(year, l))).toBe(want);
  });

  it("없는 날은 null — 2024 음력 1월은 29일까지, 2025 윤6월도 29일까지, 2026 에는 윤6월이 없다", () => {
    expect(lunarToSolar(2024, L(1, 30))).toBeNull();
    expect(lunarToSolar(2025, L(6, 30, true))).toBeNull();
    expect(lunarToSolar(2026, L(6, 15, true))).toBeNull();
  });

  it("오래된 생일도 된다(1930~)", () => {
    // 폼 미리보기의 예("양력 1962년 4월 19일")와 같은 값. 1930 설날 = 1930-01-30.
    expect(ymd(lunarToSolar(1962, L(3, 15)))).toBe("1962-04-19");
    expect(ymd(lunarToSolar(1930, L(1, 1)))).toBe("1930-01-30");
  });

  it("범위 밖(2050-11-18 뒤)은 던지지 않고 null", () => {
    expect(ymd(lunarToSolar(2050, L(11, 18)))).toBe("2050-12-31");
    expect(lunarToSolar(2050, L(12, 1))).toBeNull();
    expect(lunarInYear(2051, L(1, 1))).toBeNull();
    expect(solarToLunar(new Date(2051, 0, 1))).toBeNull();
  });
});

describe("양력 → 음력", () => {
  it("윤달을 알아본다", () => {
    expect(solarToLunar(new Date(2025, 6, 25))).toEqual({ year: 2025, month: 6, day: 1, leap: true });
    expect(solarToLunar(new Date(2025, 5, 25))).toEqual({ year: 2025, month: 6, day: 1, leap: false });
  });

  it("음력 12월은 양력 이듬해에 온다 — 해는 음력 해로", () => {
    // KASI 2026 표: 음력 12월 1일 = 2027-01-08
    expect(solarToLunar(new Date(2027, 0, 8))).toEqual({ year: 2026, month: 12, day: 1, leap: false });
  });

  it("hasLeapMonth", () => {
    expect(hasLeapMonth(2025, 6)).toBe(true);
    expect(hasLeapMonth(2025, 5)).toBe(false);
    expect(hasLeapMonth(2026, 6)).toBe(false);
  });
});

describe("lunarInYear — 해마다 돌아오는 날의 두 규칙", () => {
  it("그 해에 윤달이 없으면 평달로", () => {
    // 2025 윤6월 1일 생 → 2026 에는 윤6월이 없다 → 평6월 1일 = 2026-07-14
    expect(ymd(lunarInYear(2026, L(6, 1, true)))).toBe("2026-07-14");
    // 윤달이 있는 해에는 윤달 그대로
    expect(ymd(lunarInYear(2025, L(6, 1, true)))).toBe("2025-07-25");
  });

  it("30일이 없는 달이면 그 달 마지막 날(29일)로 — 다음 달로 넘기지 않는다", () => {
    // 2024 음력 1월은 소(29일) → 1월 29일 = 2024-03-09 (2월 1일 = 3/10 이 아니다)
    expect(ymd(lunarInYear(2024, L(1, 30)))).toBe("2024-03-09");
    // 2026 음력 1월은 대 → 30일 그대로 = 2/17 + 29 = 2026-03-18
    expect(ymd(lunarInYear(2026, L(1, 30)))).toBe("2026-03-18");
  });

  it("윤달·30일이 겹쳐도 — 2025 윤6월은 소라 윤6월 29일", () => {
    expect(ymd(lunarInYear(2025, L(6, 30, true)))).toBe("2025-08-22");
  });
});

describe("nextLunar — 다음에 돌아오는 날", () => {
  it("올해 것이 아직이면 올해", () => {
    // 2026-09-01 에 추석을 물으면 2026-09-25
    expect(nextLunar(L(8, 15), new Date(2026, 8, 1))).toEqual({ date: new Date(2026, 8, 25), lunarYear: 2026 });
  });

  it("오늘이면 오늘", () => {
    expect(ymd(nextLunar(L(8, 15), new Date(2026, 8, 25, 15, 0))!.date)).toBe("2026-09-25");
  });

  it("지났으면 이듬해", () => {
    const n = nextLunar(L(8, 15), new Date(2026, 9, 27))!;
    expect(n.lunarYear).toBe(2027);
    expect(n.date.getFullYear()).toBe(2027);
  });

  it("음력 12월 — 양력 1월 초에는 **음력 작년** 12월이 아직 남아 있다", () => {
    // 음력 2026-12-20 = 2027-01-08 + 19 = 2027-01-27. 2027 음력부터 보면 이듬해 1월로 한 해를 건너뛴다.
    const n = nextLunar(L(12, 20), new Date(2027, 0, 10))!;
    expect(ymd(n.date)).toBe("2027-01-27");
    expect(n.lunarYear).toBe(2026);
  });

  it("범위를 넘으면 null(2050-11 뒤)", () => {
    expect(nextLunar(L(12, 1), new Date(2050, 11, 1))).toBeNull();
  });
});

describe("글자·검사", () => {
  it("lunarLabel", () => {
    expect(lunarLabel(L(3, 15))).toBe("음력 3월 15일");
    expect(lunarLabel(L(6, 1, true))).toBe("음력 윤6월 1일");
  });

  it("parseLunar — null 은 양력, 모양이 틀리면 invalid", () => {
    expect(parseLunar(null)).toEqual({ ok: true, value: null });
    expect(parseLunar({ month: 3, day: 15, leap: false })).toEqual({ ok: true, value: L(3, 15) });
    expect(parseLunar({ month: 3, day: 15 })).toEqual({ ok: true, value: L(3, 15) });
    for (const bad of [
      undefined, "3-15", [], { month: 0, day: 1 }, { month: 13, day: 1 }, { month: 3, day: 31 },
      { month: 3, day: 0 }, { month: 3.5, day: 1 }, { month: "3", day: 1 }, { month: 3, day: 1, leap: "yes" },
    ]) {
      expect(parseLunar(bad), JSON.stringify(bad)).toEqual({ ok: false });
    }
  });

  it("matchesLunar — 저장할 양력 날짜가 정말 그 음력 날짜인가", () => {
    expect(matchesLunar(new Date(1962, 3, 19), L(3, 15))).toBe(true);
    expect(matchesLunar(new Date(1962, 3, 20), L(3, 15))).toBe(false);
    expect(matchesLunar(new Date(2025, 6, 25), L(6, 1, true))).toBe(true);
    expect(matchesLunar(new Date(2025, 6, 25), L(6, 1, false))).toBe(false);
  });
});
