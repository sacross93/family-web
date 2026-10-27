// 기념일이 **언제 돌아오는가** — 양력이든 음력이든 화면·홈·포동이·달력이 이 한 곳에서 묻는다.
// 따로 세면 기념일 화면은 음력으로, 홈은 양력으로 세는 날이 온다(같은 생일에 D-day 가 둘).
// 순수 모듈 — 기념일 화면(클라이언트)이 가져와도 prisma 가 섞이지 않는다.
import { dday, ddayFrom } from "@/lib/date";
import { lunarInYear, nextLunar, solarToLunar, type LunarDate } from "@/lib/lunar";

export interface AnniversaryDateFields {
  /** 양력 날짜. 음력 기념일이면 원래 음력 날짜의 양력 날짜다. */
  date: Date | string;
  recurring: boolean;
  /** 있으면 음력 기념일 */
  lunar?: LunarDate | null;
}

export interface AnniversaryWhen {
  days: number;
  label: string;
  /** 다음에 돌아오는 날(반복이 아니면 그 날 자체) — 로컬 자정 */
  nextDate: Date;
  /** 그날이 처음부터 몇 번째 해인가(생일이면 몇 살이 되는가). 반복이 아니면 0 */
  years: number;
}

/**
 * 다음에 돌아오는 날과 D-day.
 * - 양력: `dday` 그대로(올해 아니면 내년, 2월 29일은 `dday` 의 규칙대로).
 * - 음력·반복: 음력으로 센다(`nextLunar` — 윤달 없는 해는 평달, 30일 없는 달은 29일). 나이도 **음력 해**로
 *   센다 — 음력 12월생은 양력 해가 바뀐 1월에 생일이 오기도 해서 양력 해로 빼면 한 살 틀린다.
 * - 음력·반복 아님: 저장된 양력 날짜 그대로(한 번뿐인 날이라 음력으로 다시 셀 것이 없다).
 * 음력 표 범위(2050-11)를 넘어 못 세면 양력으로 센다 — 화면이 비거나 던지는 것보다 낫다.
 */
export function anniversaryWhen(a: AnniversaryDateFields, today: Date = new Date()): AnniversaryWhen {
  const base = new Date(a.date);
  if (a.lunar && a.recurring) {
    const next = nextLunar(a.lunar, today);
    const born = solarToLunar(base);
    if (next && born) return { ...ddayFrom(next.date, today), years: next.lunarYear - born.year };
  }
  const d = dday(base, { recurring: a.recurring, today });
  return { ...d, years: a.recurring ? d.nextDate.getFullYear() - base.getFullYear() : 0 };
}

/**
 * `from`~`to`(둘 다 그날 포함) 사이에 그 기념일이 걸리는 날들 — 달력에 얹을 때.
 * **원래 날짜 앞의 해에는 그리지 않는다** — 2027년에 할 결혼식을 2026년 달력에 "기념일" 로 칠하면 거짓말이다.
 * 반복 규칙은 `anniversaryWhen` 과 같다(양력은 `dday` 처럼 `new Date(해, 월, 일)`, 음력은 `lunarInYear`).
 */
export function anniversaryDatesBetween(a: AnniversaryDateFields, from: Date, to: Date): Date[] {
  const base = new Date(a.date);
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime();
  const lo = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const hi = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  const keep = (d: Date | null): d is Date => !!d && d.getTime() >= Math.max(lo, start) && d.getTime() <= hi;

  if (!a.recurring) return keep(new Date(start)) ? [new Date(start)] : [];

  const out: Date[] = [];
  // 음력 해 Y 의 날은 양력 Y 또는 Y+1 에 온다 — 그래서 음력은 한 해 앞에서부터 본다.
  for (let y = from.getFullYear() - (a.lunar ? 1 : 0); y <= to.getFullYear(); y++) {
    const d = a.lunar ? lunarInYear(y, a.lunar) : new Date(y, base.getMonth(), base.getDate());
    if (keep(d)) out.push(d);
  }
  return out;
}
