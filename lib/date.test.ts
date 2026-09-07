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
