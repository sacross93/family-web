import { describe, it, expect } from "vitest";
import { periodsFrom, predictCycle, DEFAULT_CYCLE, DEFAULT_PERIOD } from "./cycle";

const d = (s: string) => {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
};
const ymd = (x: Date) =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
const start = (s: string) => ({ date: d(s), kind: "periodStart" });
const end = (s: string) => ({ date: d(s), kind: "periodEnd" });

describe("periodsFrom", () => {
  it("시작마다 그 뒤·다음 시작 전의 첫 끝을 짝짓는다", () => {
    const p = periodsFrom([start("2026-09-01"), end("2026-09-05"), start("2026-09-29"), end("2026-10-03")]);
    expect(p.map((x) => [ymd(x.start), x.end && ymd(x.end), x.length])).toEqual([
      ["2026-09-01", "2026-09-05", 5],
      ["2026-09-29", "2026-10-03", 5],
    ]);
  });
  it("같은 날 두 번 적은 시작은 하나다", () => {
    expect(periodsFrom([start("2026-09-01"), start("2026-09-01")])).toHaveLength(1);
  });
  it("시작 없는 끝·다음 시작 뒤의 끝은 버린다", () => {
    const p = periodsFrom([end("2026-08-20"), start("2026-09-01"), start("2026-09-29"), end("2026-10-02")]);
    expect(p[0].end).toBeNull();
    expect(ymd(p[1].end!)).toBe("2026-10-02");
  });
  it("넘어온 순서와 상관없이 날짜순이다", () => {
    const p = periodsFrom([start("2026-09-29"), start("2026-09-01")]);
    expect(p.map((x) => ymd(x.start))).toEqual(["2026-09-01", "2026-09-29"]);
  });
});

describe("predictCycle", () => {
  it("시작 기록이 없으면 null", () => {
    expect(predictCycle([end("2026-09-05")], d("2026-10-01"))).toBeNull();
  });
  it("오늘 이후로 잘못 적은 시작은 예측에서 뺀다", () => {
    expect(predictCycle([start("2026-11-30")], d("2026-10-01"))).toBeNull();
    const p = predictCycle([start("2026-09-20"), start("2026-11-30")], d("2026-10-01"))!;
    expect(ymd(p.lastStart)).toBe("2026-09-20");
  });
  it("시작 하나면 기본 28일 · basis default · 배란 = 다음 예정 −14 · 가임기 −5~+1", () => {
    const p = predictCycle([start("2026-10-01")], d("2026-10-05"))!;
    expect(p.avgCycle).toBe(DEFAULT_CYCLE);
    expect(p.basis).toBe("default");
    expect(ymd(p.nextStart)).toBe("2026-10-29");
    expect(ymd(p.ovulation)).toBe("2026-10-15");
    expect(ymd(p.fertileStart)).toBe("2026-10-10");
    expect(ymd(p.fertileEnd)).toBe("2026-10-16");
    expect(p.cycleDay).toBe(5);
    expect(p.daysUntilNext).toBe(24);
    expect(p.lateDays).toBe(0);
  });
  it("두 번 이상이면 기록으로 평균(반올림)", () => {
    const p = predictCycle([start("2026-08-01"), start("2026-08-29"), start("2026-09-29")], d("2026-10-01"))!;
    // 28, 31 → 29.5 → 30
    expect(p.avgCycle).toBe(30);
    expect(p.basis).toBe("records");
    expect(ymd(p.nextStart)).toBe("2026-10-29");
  });
  it("15~60일 밖의 간격(빠진 기록)은 쓰지 않는다 — 남는 게 없으면 기본값", () => {
    const p = predictCycle([start("2026-05-01"), start("2026-09-01")], d("2026-09-10"))!;
    expect(p.avgCycle).toBe(DEFAULT_CYCLE);
    expect(p.basis).toBe("default");
  });
  it("최근 여섯 주기만 쓴다", () => {
    // 처음 한 번은 45일, 그 뒤 여섯 번은 28일
    const days = ["2026-01-01", "2026-02-15", "2026-03-15", "2026-04-12", "2026-05-10", "2026-06-07", "2026-07-05", "2026-08-02"];
    const p = predictCycle(days.map(start), d("2026-08-05"))!;
    expect(p.avgCycle).toBe(28);
  });
  it("생리 길이는 끝을 아는 기간의 평균, 없으면 기본 5일", () => {
    expect(predictCycle([start("2026-10-01")], d("2026-10-02"))!.avgPeriod).toBe(DEFAULT_PERIOD);
    const p = predictCycle([start("2026-09-01"), end("2026-09-04"), start("2026-09-29"), end("2026-10-04")], d("2026-10-05"))!;
    // 4일, 6일 → 5
    expect(p.avgPeriod).toBe(5);
  });
  it("예정일이 지나면 굴리지 않고 지난 일수를 준다", () => {
    const p = predictCycle([start("2026-09-01")], d("2026-10-02"))!;
    expect(ymd(p.nextStart)).toBe("2026-09-29");
    expect(p.daysUntilNext).toBe(-3);
    expect(p.lateDays).toBe(3);
  });
  it("오늘 시작했으면 1일째", () => {
    expect(predictCycle([start("2026-10-01")], d("2026-10-01"))!.cycleDay).toBe(1);
  });
  it("생리 길이를 기록으로 냈는지 기본값인지 알린다(periodBasis)", () => {
    expect(predictCycle([start("2026-10-01")], d("2026-10-02"))!.periodBasis).toBe("default");
    expect(predictCycle([start("2026-10-01"), end("2026-10-05")], d("2026-10-06"))!.periodBasis).toBe("records");
  });
});

// 임신이 끝나 준비 단계로 돌아오면 그 전 생리 시작이 마지막 기록으로 남는다 — 그걸 기준으로 삼으면
// 히어로가 "21일 지남" 을 날마다 키운다. `since`(준비로 돌아온 날) 이전의 시작은 기준이 못 된다.
describe("predictCycle — since(준비 단계로 돌아온 날)", () => {
  const before = [start("2026-08-01"), start("2026-08-29")];

  it("since 뒤에 시작 기록이 없으면 null — 임신 전 생리를 기준으로 '지남' 을 세지 않는다", () => {
    // since 가 없으면 8/29 기준 예정 9/26 → 10/1 에는 "5일 지남" 이 된다(고치기 전 모습).
    expect(predictCycle(before, d("2026-10-01"))!.lateDays).toBe(5);
    expect(predictCycle(before, d("2026-10-01"), d("2026-09-10"))).toBeNull();
  });

  it("since 뒤의 시작이 기준이고, 평균은 since 앞의 간격도 쓴다", () => {
    // 6/1 → 6/29(28) → 7/29(30) · 임신 · 9/20 준비로 · 10/1 시작(7/29 와 64일 → 15~60 밖이라 빠진다)
    const events = [start("2026-06-01"), start("2026-06-29"), start("2026-07-29"), start("2026-10-01")];
    const p = predictCycle(events, d("2026-10-05"), d("2026-09-20"))!;
    expect(ymd(p.lastStart)).toBe("2026-10-01");
    expect(p.basis).toBe("records");
    expect(p.avgCycle).toBe(29);
    expect(p.cycleDay).toBe(5);
    expect(p.lateDays).toBe(0);
  });

  it("since 와 같은 날 시작한 것은 기준이 된다", () => {
    const p = predictCycle([...before, start("2026-09-10")], d("2026-09-12"), d("2026-09-10"))!;
    expect(ymd(p.lastStart)).toBe("2026-09-10");
  });

  it("since 는 Date 로도 문자열로도 받는다", () => {
    const events = [...before, start("2026-09-20")];
    const asDate = predictCycle(events, d("2026-10-01"), d("2026-09-10"));
    const asString = predictCycle(events, d("2026-10-01"), d("2026-09-10").toISOString());
    expect(asDate).not.toBeNull();
    expect(asString).toEqual(asDate);
    expect(predictCycle(before, d("2026-10-01"), d("2026-09-10").toISOString())).toBeNull();
  });

  it("since 가 null·undefined 면 예전과 같다", () => {
    expect(predictCycle(before, d("2026-10-01"), null)).toEqual(predictCycle(before, d("2026-10-01")));
    expect(predictCycle(before, d("2026-10-01"), undefined)).toEqual(predictCycle(before, d("2026-10-01")));
  });
});

// 출생 뒤 준비로 돌아왔거나 오래 안 적었으면 마지막 시작이 한참 전이다 — "90일 지남" 은 예측이 아니다.
describe("predictCycle — 60일 넘게 새 시작이 없으면 예측하지 않는다", () => {
  it("60일째까지는 예측, 61일째부터 null", () => {
    expect(predictCycle([start("2026-08-01")], d("2026-09-29"))!.cycleDay).toBe(60);
    expect(predictCycle([start("2026-08-01")], d("2026-09-30"))).toBeNull();
  });
});
