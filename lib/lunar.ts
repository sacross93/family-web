// 음력 ↔ 양력. 한국천문연구원(KASI) 표를 담은 `korean-lunar-calendar`(0.4.0, MIT)를 감싼다.
//
// **순수 모듈이다** — prisma·react 를 부르지 않는다. 기념일 화면(클라이언트)과 홈·포동이·달력(서버)이
// 같이 쓴다. 이 라이브러리를 `lib/date.ts` 에 넣지 않은 이유: date.ts 는 계획·아기·달력 화면 묶음에도
// 들어가서, 거기서 부르면 음력 표(min 17.7KB · gzip 5.2KB)가 음력을 안 쓰는 화면에도 실린다.
//
// 한국 음력과 중국 음력은 같은 날이 아닐 때가 있다(기준 자오선이 다르다). 그래서 중국식 라이브러리가 아니라
// KASI 기준을 골랐다. 범위는 음력 1000-01-01 ~ 2050-11-18 — 넘으면 변환이 null 이다(던지지 않는다).
import KoreanLunarCalendar from "korean-lunar-calendar";

/** 음력 날짜에서 해를 뺀 것 — 해마다 돌아오는 날을 셀 때 필요한 전부(`AnniversaryLunar` 표의 모양). */
export interface LunarDate {
  month: number;
  day: number;
  /** 윤달 */
  leap: boolean;
}

export interface LunarYmd extends LunarDate {
  year: number;
}

/** 라이브러리가 아는 해. 폼이 이 밖을 받지 않는다. */
export const LUNAR_MIN_YEAR = 1000;
export const LUNAR_MAX_YEAR = 2050;

function solarDate(c: KoreanLunarCalendar): Date {
  const s = c.getSolarCalendar();
  // 로컬 자정 — 기념일 날짜는 어디서나 로컬 자정으로 다룬다(`fromDateInput`·`dday` 와 같다).
  return new Date(s.year, s.month - 1, s.day);
}

/**
 * 그 음력 날짜가 **실제로 있을 때만** 양력(로컬 자정). 그 해에 그 윤달이 없거나, 그 달이 29일까지인데
 * 30일을 물었거나, 범위 밖이면 null. 원래 날짜(생일 그 자체)를 적을 때 쓴다 — 거기서는 없는 날을
 * 다른 날로 바꿔 주면 안 된다.
 */
export function lunarToSolar(year: number, l: LunarDate): Date | null {
  const c = new KoreanLunarCalendar();
  return c.setLunarDate(year, l.month, l.day, l.leap) ? solarDate(c) : null;
}

/** 양력 → 음력. Date 의 **로컬** 연·월·일을 읽는다. 범위 밖이면 null. */
export function solarToLunar(d: Date): LunarYmd | null {
  const c = new KoreanLunarCalendar();
  if (!c.setSolarDate(d.getFullYear(), d.getMonth() + 1, d.getDate())) return null;
  const l = c.getLunarCalendar();
  return { year: l.year, month: l.month, day: l.day, leap: !!l.intercalation };
}

/** 그 해에 그 달의 윤달이 있나. 라이브러리가 윤달 번호를 내놓지 않아(비공개) 1일로 물어본다. */
export function hasLeapMonth(year: number, month: number): boolean {
  return new KoreanLunarCalendar().setLunarDate(year, month, 1, true);
}

/**
 * 그 해(음력 해)에 돌아오는 "이 음력 날" 의 양력. 해마다 돌아오는 날을 셀 때 쓴다.
 * 원래 날짜가 그 해에 없을 수 있어서 둘을 정했다(2026-10-27):
 *
 * - **윤달이 그 해에 없으면 평달로.** 윤달은 몇 해에 한 번만 오므로 그대로 두면 윤달 생일이
 *   대부분의 해에 사라진다. 평달 같은 날에 지내는 것이 집에서 흔히 하는 방식이다.
 * - **30일이 없는 달(29일까지)이면 그 달 마지막 날로.** 다음 달 1일로 넘기지 않는다 —
 *   넘기면 "3월 그믐" 이 4월이 된다. 음력 한 달은 29일 아니면 30일이라 29일이 언제나 마지막 날이다.
 *
 * 범위 밖이면 null.
 */
export function lunarInYear(year: number, l: LunarDate): Date | null {
  const c = new KoreanLunarCalendar();
  const leap = l.leap && hasLeapMonth(year, l.month);
  for (const day of l.day === 30 ? [30, 29] : [l.day]) {
    if (c.setLunarDate(year, l.month, day, leap)) return solarDate(c);
  }
  return null;
}

/**
 * `from`(그날 포함) 이후 처음 돌아오는 그 음력 날. 몇 번째 음력 해인지도 같이 준다(음력 생일의 나이).
 *
 * **음력 해 셋(작년·올해·내년)을 다 보고 가장 이른 것을 고른다.** "올해 음력으로 바꿔 보고 지났으면
 * 내년" 은 틀린다 — 음력 12월은 양력 이듬해 1~2월에 온다. 2027-01-10 에 음력 12월 20일을 물으면
 * 답은 음력 **2026**년 12월 20일(2027-01-27)인데, 2027년 것부터 보면 거의 한 해 뒤를 답한다.
 * 범위를 넘으면(2050-11 이후) null.
 */
export function nextLunar(l: LunarDate, from: Date): { date: Date; lunarYear: number } | null {
  const t = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const y = from.getFullYear();
  let best: { date: Date; lunarYear: number } | null = null;
  for (const lunarYear of [y - 1, y, y + 1]) {
    const date = lunarInYear(lunarYear, l);
    if (date && date.getTime() >= t && (!best || date.getTime() < best.date.getTime())) {
      best = { date, lunarYear };
    }
  }
  return best;
}

/** "음력 3월 15일" · "음력 윤6월 1일" */
export function lunarLabel(l: LunarDate): string {
  return `음력 ${l.leap ? "윤" : ""}${l.month}월 ${l.day}일`;
}

/**
 * API 본문의 `lunar` 를 읽는다. `null` 은 "양력" 이다(그대로 null). 모양이 틀리면 `invalid`.
 * 범위만 본다(월 1~12, 일 1~30) — 그 해에 정말 있는 날인지는 날짜와 맞춰 보는 쪽(`matchesLunar`)이 본다.
 */
export function parseLunar(v: unknown): { ok: true; value: LunarDate | null } | { ok: false } {
  if (v === null) return { ok: true, value: null };
  if (typeof v !== "object" || Array.isArray(v)) return { ok: false };
  const o = v as Record<string, unknown>;
  const { month, day } = o;
  const leap = o.leap ?? false;
  if (!Number.isInteger(month) || (month as number) < 1 || (month as number) > 12) return { ok: false };
  if (!Number.isInteger(day) || (day as number) < 1 || (day as number) > 30) return { ok: false };
  if (typeof leap !== "boolean") return { ok: false };
  return { ok: true, value: { month: month as number, day: day as number, leap } };
}

/**
 * 저장할 양력 날짜(`date`)가 정말 그 음력 날짜인가. 표에는 해가 없어서 해는 `date` 에서 되짚는다 —
 * 둘이 어긋나면 나이·고치기 폼의 해가 엉뚱해진다. 그래서 누가 부르든(화면·포동이·직접 요청) 라우트가 이걸로 막는다.
 */
export function matchesLunar(date: Date, l: LunarDate): boolean {
  const got = solarToLunar(date);
  return !!got && got.month === l.month && got.day === l.day && got.leap === l.leap;
}
