// 주기 기록에서 생리 기간·평균 주기·다음 예정일·배란 예정일·가임기를 **추정**한다.
// 순수 함수 — DB 도 화면도 모른다. 날짜는 lib/date.ts 와 같은 로컬 자정 규칙이다.
//
// 화면에 나가는 값은 전부 "추정" 이다. 아기 페이지는 "의료 시기 문구를 넣지 않는다" 가 원칙인데
// **여기서 나온 날짜만** 예외로 보여 준다(AGENTS.md) — 날짜와 "추정" 표시뿐, 권하는 문장은 없다.
import { addDays } from "date-fns";
import type { PaletteKey } from "@/lib/colors";
import { startOfDay, differenceInCalendarDays } from "@/lib/date";

export type CycleKind = "periodStart" | "periodEnd" | "ovulationTest";
export type TestResult = "negative" | "faint" | "positive";
export const CYCLE_KINDS: CycleKind[] = ["periodStart", "periodEnd", "ovulationTest"];
export const TEST_RESULTS: TestResult[] = ["negative", "faint", "positive"];

export const CYCLE_KIND_META: Record<CycleKind, { label: string; emoji: string }> = {
  periodStart: { label: "생리 시작", emoji: "🌸" },
  periodEnd: { label: "생리 끝", emoji: "🌿" },
  ovulationTest: { label: "테스트기", emoji: "🧪" },
};
export const TEST_RESULT_META: Record<TestResult, { label: string; color: PaletteKey }> = {
  negative: { label: "음성", color: "sky" },
  faint: { label: "희미", color: "butter" },
  positive: { label: "양성", color: "mint" },
};

/** 기록이 모자랄 때 쓰는 값. 화면은 basis 로 "기록이 쌓이면 더 맞아져요" 를 붙인다. */
export const DEFAULT_CYCLE = 28;
export const DEFAULT_PERIOD = 5;
// 이 밖의 간격은 빠뜨린 기록이나 잘못 적은 날로 본다 — 넣으면 평균이 90일로 튄다.
const CYCLE_MIN = 15;
const CYCLE_MAX = 60;
const PERIOD_MAX = 14;
const RECENT = 6;
// 달력 계산법: 배란 = 다음 예정 − 14일, 가임기 = 배란 −5일 ~ +1일.
const LUTEAL_DAYS = 14;
const FERTILE_BEFORE = 5;
const FERTILE_AFTER = 1;

export interface CycleEventLike {
  date: Date | string;
  kind: string;
  result?: string | null;
}

export interface Period {
  start: Date;
  /** 끝난 날을 안 적었으면 null */
  end: Date | null;
  /** 끝-시작+1. 끝을 모르면 null */
  length: number | null;
}

export interface CyclePrediction {
  lastStart: Date;
  /** 오늘이 이번 주기 며칠째인지(시작일 = 1) */
  cycleDay: number;
  avgCycle: number;
  avgPeriod: number;
  /** records = 기록으로 낸 평균, default = 기록이 모자라 기본 28일 */
  basis: "records" | "default";
  nextStart: Date;
  /** 다음 예정일까지 남은 날. 지났으면 음수 */
  daysUntilNext: number;
  /** 예정일에서 지난 날(지나지 않았으면 0). 굴려서 다음 달로 넘기지 않는다 */
  lateDays: number;
  ovulation: Date;
  fertileStart: Date;
  fertileEnd: Date;
}

const dayOf = (d: Date | string) => startOfDay(new Date(d));

/** 날짜순, 같은 날은 하나만 */
function uniqueDays(days: Date[]): Date[] {
  const seen = new Set<number>();
  return [...days]
    .sort((a, b) => a.getTime() - b.getTime())
    .filter((d) => (seen.has(d.getTime()) ? false : (seen.add(d.getTime()), true)));
}

const mean = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;

/** 생리 기간들(시작 날짜순). 끝 = 그 시작 이후·다음 시작 이전의 첫 "생리 끝". 짝 없는 끝은 버린다. */
export function periodsFrom(events: CycleEventLike[]): Period[] {
  const starts = uniqueDays(events.filter((e) => e.kind === "periodStart").map((e) => dayOf(e.date)));
  const ends = uniqueDays(events.filter((e) => e.kind === "periodEnd").map((e) => dayOf(e.date)));
  return starts.map((start, i) => {
    const next = starts[i + 1];
    const end =
      ends.find((e) => e.getTime() >= start.getTime() && (!next || e.getTime() < next.getTime())) ?? null;
    return { start, end, length: end ? differenceInCalendarDays(end, start) + 1 : null };
  });
}

/** 다음 예정일·배란 예정일·가임기(전부 추정). 오늘까지의 시작 기록이 없으면 null. */
export function predictCycle(events: CycleEventLike[], today: Date = new Date()): CyclePrediction | null {
  const t = dayOf(today);
  // 미래 날짜로 잘못 적은 시작은 뺀다 — 그걸 기준으로 삼으면 "주기 -20일째" 가 된다.
  const periods = periodsFrom(events).filter((p) => p.start.getTime() <= t.getTime());
  if (periods.length === 0) return null;

  const gaps: number[] = [];
  for (let i = 1; i < periods.length; i++) {
    const gap = differenceInCalendarDays(periods[i].start, periods[i - 1].start);
    if (gap >= CYCLE_MIN && gap <= CYCLE_MAX) gaps.push(gap);
  }
  const recentGaps = gaps.slice(-RECENT);
  const basis = recentGaps.length > 0 ? "records" : "default";
  const avgCycle = recentGaps.length > 0 ? Math.round(mean(recentGaps)) : DEFAULT_CYCLE;

  const lengths = periods
    .map((p) => p.length)
    .filter((n): n is number => n !== null && n >= 1 && n <= PERIOD_MAX)
    .slice(-RECENT);
  const avgPeriod = lengths.length > 0 ? Math.round(mean(lengths)) : DEFAULT_PERIOD;

  const lastStart = periods[periods.length - 1].start;
  const nextStart = addDays(lastStart, avgCycle);
  const daysUntilNext = differenceInCalendarDays(nextStart, t);
  const ovulation = addDays(nextStart, -LUTEAL_DAYS);

  return {
    lastStart,
    cycleDay: differenceInCalendarDays(t, lastStart) + 1,
    avgCycle,
    avgPeriod,
    basis,
    nextStart,
    daysUntilNext,
    lateDays: Math.max(0, -daysUntilNext),
    ovulation,
    fertileStart: addDays(ovulation, -FERTILE_BEFORE),
    fertileEnd: addDays(ovulation, FERTILE_AFTER),
  };
}
