import { describe, it, expect } from "vitest";
import {
  PREGNANCY_DAYS,
  dueDateFromLmp,
  pregnancyProgress,
  weekLabel,
  daysSinceBirth,
  toDateInput,
  fromDateInput,
  parseDateInput,
  kDateRelative,
  kDateShort,
  kDateShortYear,
} from "@/lib/date";

// 예정일 2027-05-20 고정. daysBefore(n) = 예정일 n일 전.
const DUE = new Date(2027, 4, 20);
function daysBefore(n: number) {
  const d = new Date(DUE);
  d.setDate(d.getDate() - n);
  return d;
}

describe("pregnancyProgress", () => {
  it("예정일 245일 전은 5주 0일, 1분기, D-245", () => {
    const p = pregnancyProgress(DUE, daysBefore(245));
    expect(p.elapsedDays).toBe(35);
    expect(p.weeks).toBe(5);
    expect(p.days).toBe(0);
    expect(p.trimester).toBe(1);
    expect(p.dueDays).toBe(245);
    expect(p.dueLabel).toBe("D-245");
    expect(p.progress).toBeCloseTo(35 / 280);
    expect(p.overdue).toBe(false);
    expect(weekLabel(p)).toBe("5주 0일");
  });

  it("예정일 242일 전은 5주 3일", () => {
    const p = pregnancyProgress(DUE, daysBefore(242));
    expect(weekLabel(p)).toBe("5주 3일");
  });

  it("시작일(예정일 280일 전)은 0주 0일, 진행 0", () => {
    const p = pregnancyProgress(DUE, daysBefore(280));
    expect(p.elapsedDays).toBe(0);
    expect(weekLabel(p)).toBe("0주 0일");
    expect(p.progress).toBe(0);
  });

  it("시작일 이전이면 경과일을 0으로 클램프", () => {
    const p = pregnancyProgress(DUE, daysBefore(300));
    expect(p.elapsedDays).toBe(0);
    expect(p.dueDays).toBe(300);
  });

  it("분기 경계: 13주6일=1분기, 14주0일=2분기, 27주6일=2분기, 28주0일=3분기", () => {
    expect(pregnancyProgress(DUE, daysBefore(280 - 97)).trimester).toBe(1); // 13w6d
    expect(pregnancyProgress(DUE, daysBefore(280 - 98)).trimester).toBe(2); // 14w0d
    expect(pregnancyProgress(DUE, daysBefore(280 - 195)).trimester).toBe(2); // 27w6d
    expect(pregnancyProgress(DUE, daysBefore(280 - 196)).trimester).toBe(3); // 28w0d
  });

  it("예정일 당일은 40주 0일, D-DAY, 진행 1", () => {
    const p = pregnancyProgress(DUE, daysBefore(0));
    expect(weekLabel(p)).toBe("40주 0일");
    expect(p.dueLabel).toBe("D-DAY");
    expect(p.progress).toBe(1);
    expect(p.overdue).toBe(false);
  });

  it("예정일 3일 뒤는 40주 3일, D+3, overdue, 진행 1 클램프", () => {
    const p = pregnancyProgress(DUE, daysBefore(-3));
    expect(weekLabel(p)).toBe("40주 3일");
    expect(p.dueLabel).toBe("D+3");
    expect(p.overdue).toBe(true);
    expect(p.progress).toBe(1);
  });

  it("문자열 날짜도 받는다", () => {
    const p = pregnancyProgress("2027-05-20T00:00:00", daysBefore(245));
    expect(p.weeks).toBe(5);
  });
});

describe("dueDateFromLmp", () => {
  it("마지막 생리일 + 280일", () => {
    const due = dueDateFromLmp(new Date(2026, 7, 13)); // 2026-08-13
    expect(toDateInput(due)).toBe("2027-05-20");
    expect(PREGNANCY_DAYS).toBe(280);
  });
});

describe("daysSinceBirth", () => {
  it("오늘 태어났으면 0, 10일 뒤는 10", () => {
    const birth = new Date(2027, 4, 18);
    expect(daysSinceBirth(birth, birth)).toBe(0);
    expect(daysSinceBirth(birth, new Date(2027, 4, 28))).toBe(10);
  });
});

describe("toDateInput / fromDateInput", () => {
  it("yyyy-MM-dd 왕복, 로컬 자정", () => {
    expect(toDateInput(new Date(2027, 4, 20, 15, 30))).toBe("2027-05-20");
    const d = fromDateInput("2027-05-20");
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(0);
  });
});

describe("parseDateInput", () => {
  it('"yyyy-MM-dd" 는 서버 로컬 자정', () => {
    const d = parseDateInput("2027-05-20")!;
    expect(d).not.toBeNull();
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(0);
  });

  it("전체 ISO 문자열은 그 순간 그대로", () => {
    const iso = "2027-05-20T15:00:00.000Z";
    expect(parseDateInput(iso)!.getTime()).toBe(new Date(iso).getTime());
  });

  it("잘못된 문자열·빈 값·문자열이 아니면 null", () => {
    expect(parseDateInput("not-a-date")).toBeNull();
    expect(parseDateInput("")).toBeNull();
    expect(parseDateInput("   ")).toBeNull();
    expect(parseDateInput(null)).toBeNull();
    expect(parseDateInput(undefined)).toBeNull();
    expect(parseDateInput(123)).toBeNull();
  });
});

describe("kDateRelative", () => {
  const today = new Date("2026-09-20T15:00:00");
  const at = (iso: string) => kDateRelative(new Date(iso), today);

  it("오늘·내일·모레는 상대말로", () => {
    expect(at("2026-09-20T09:00:00")).toBe("오늘");
    expect(at("2026-09-21T23:59:00")).toBe("내일");
    expect(at("2026-09-22T00:01:00")).toBe("모레");
  });

  it("사흘 뒤부터는 날짜로 — 세고 있기엔 머니까", () => {
    expect(at("2026-09-23T09:00:00")).toBe("9월 23일 (수)");
  });

  it("같은 날이면 시각이 일러도 '오늘' — 달력 날짜로 센다", () => {
    // 시각 차이로 빼면 오늘 아침 일정이 '어제'가 된다.
    expect(at("2026-09-20T00:30:00")).toBe("오늘");
    expect(at("2026-09-20T23:30:00")).toBe("오늘");
  });

  it("지난 날은 상대말로 바꾸지 않는다 — 언제였는지가 궁금한 자리다", () => {
    expect(at("2026-09-19T09:00:00")).toBe("9월 19일 (토)");
    expect(at("2026-09-13T09:00:00")).toBe("9월 13일 (일)");
  });
});

describe("다른 해면 해를 밝힌다", () => {
  // 포동이가 "내일" 을 2020년으로 적었는데 `kDateShort` 로는 2026년 것과 **글자가 같아**
  // 되읽어 확인하는 장치도 멀쩡하다고 판단했다. 여섯 해가 틀렸는데 아무도 못 알아챘다.
  const today = new Date("2026-09-21T09:00:00+09:00");

  it("같은 해에는 글자가 하나도 늘지 않는다 — 목차 예산에 영향이 없게", () => {
    const d = new Date("2026-09-19T00:00:00+09:00");
    expect(kDateShortYear(d, today)).toBe(kDateShort(d));
  });

  it("다른 해면 해를 붙인다", () => {
    const old = new Date("2020-09-19T00:00:00+09:00");
    expect(kDateShortYear(old, today)).toContain("2020년");
    expect(kDateShortYear(old, today)).not.toBe(kDateShort(old));
  });

  it("앞으로의 해도 밝힌다 — 예정일·기념일이 내년일 수 있다", () => {
    expect(kDateShortYear(new Date("2027-05-03T00:00:00+09:00"), today)).toContain("2027년");
  });
});
