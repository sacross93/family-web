import { ko } from "date-fns/locale";
import {
  format,
  differenceInCalendarDays,
  isToday,
  isSameDay,
  startOfDay,
} from "date-fns";

export { isToday, isSameDay, startOfDay, differenceInCalendarDays };

/** 2026년 7월 21일 (화) */
export function kDate(d: Date | string) {
  return format(new Date(d), "yyyy년 M월 d일 (EEE)", { locale: ko });
}

/** 7월 21일 (화) */
export function kDateShort(d: Date | string) {
  return format(new Date(d), "M월 d일 (EEE)", { locale: ko });
}

/**
 * 올해면 `7월 21일 (화)`, 다른 해면 `2020년 9월 19일 (토)`.
 *
 * **해가 다른데 같아 보이면 안 되는 자리**가 있다. 포동이에게 "내일 우유 사기" 를 시켰더니
 * 날짜를 **2020년** 9월 19일로 적었는데(오늘이 몇 일인지 몰랐다), 되읽어 확인하는 장치는
 * `kDateShort` 로 "9월 19일 (토)" 를 보고 멀쩡하다고 판단했다 — 2026년 것과 글자가 같았다.
 * 여섯 해가 틀렸는데 사람도 기계도 못 알아챈 것이다.
 *
 * 그래서 **다를 때만** 해를 붙인다. 같은 해에는 글자가 하나도 늘지 않으므로
 * 목차 예산에도 영향이 없다.
 */
export function kDateShortYear(d: Date | string, today: Date = new Date()) {
  const date = new Date(d);
  return date.getFullYear() === today.getFullYear() ? kDateShort(date) : kDate(date);
}

/** 오후 3:00 */
export function kTime(d: Date | string) {
  return format(new Date(d), "a h:mm", { locale: ko });
}

/** 2026. 7. 21. */
export function kDot(d: Date | string) {
  return format(new Date(d), "yyyy. M. d.", { locale: ko });
}

/**
 * 목록에서 훑어 읽기 좋은 날짜: 가까우면 "오늘"·"내일"·"모레", 멀면 "9월 27일 (일)".
 * 가족이 목록에서 찾는 건 대개 "이번 주에 뭐 있지?" 라, 며칠 뒤인지가 날짜 자체보다 빠르다.
 * 지난 날짜는 상대말로 바꾸지 않는다 — "어제"보다 언제였는지가 궁금한 자리다.
 */
export function kDateRelative(d: Date | string, today: Date = new Date()): string {
  // differenceInCalendarDays 가 양쪽을 달력 날짜로 맞춰 준다 — 시각으로 빼면
  // 오늘 아침 일정이 "어제"가 된다.
  const days = differenceInCalendarDays(new Date(d), today);
  if (days === 0) return "오늘";
  if (days === 1) return "내일";
  if (days === 2) return "모레";
  return kDateShort(d);
}

/** 요일 한 글자: 일 월 화 ... */
export function kWeekday(d: Date | string) {
  return format(new Date(d), "EEEEE", { locale: ko });
}

/**
 * D-day 계산. 반복 기념일(recurring)이면 올해/내년 중 가장 가까운 다음 날짜 기준.
 * 반환: 남은 일수(오늘=0, 미래=양수, 과거=음수) + 표시용 라벨.
 */
export function dday(
  date: Date | string,
  opts: { recurring?: boolean } = {}
): { days: number; label: string; nextDate: Date } {
  const base = new Date(date);
  const today = startOfDay(new Date());
  let target = startOfDay(base);

  if (opts.recurring) {
    target = new Date(today.getFullYear(), base.getMonth(), base.getDate());
    if (differenceInCalendarDays(target, today) < 0) {
      target = new Date(today.getFullYear() + 1, base.getMonth(), base.getDate());
    }
  }

  const days = differenceInCalendarDays(target, today);
  let label: string;
  if (days === 0) label = "D-DAY";
  else if (days > 0) label = `D-${days}`;
  else label = `D+${Math.abs(days)}`;

  return { days, label, nextDate: target };
}

/** 나이 계산 (생일 기준, 만 나이) */
export function ageFrom(birthday: Date | string) {
  const b = new Date(birthday);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

/**
 * "HH:MM" 에 분(delta)을 더해 시간 이동. 하루 넘김(dayDelta)도 반환.
 * 예: shiftTime("22:00", 180) → { time: "01:00", dayDelta: 1 }
 */
export function shiftTime(
  hhmm: string,
  deltaMin: number
): { time: string; dayDelta: number } | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  let total = Number(m[1]) * 60 + Number(m[2]) + Math.round(deltaMin);
  let dayDelta = 0;
  while (total < 0) {
    total += 1440;
    dayDelta--;
  }
  while (total >= 1440) {
    total -= 1440;
    dayDelta++;
  }
  const h = Math.floor(total / 60);
  const mm = total % 60;
  return { time: `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`, dayDelta };
}

/** 하루 넘김 라벨: +1이면 "+1일", -1이면 "전날" */
export function dayDeltaLabel(d: number): string {
  if (d === 0) return "";
  if (d > 0) return `+${d}일`;
  return d === -1 ? "전날" : `${d}일`;
}

/** 현지시간 → 한국시간 (offset = 현지-한국, 분) */
export function toKorea(hhmm: string, offsetMin: number) {
  return shiftTime(hhmm, -offsetMin);
}
/** 한국시간 → 현지시간 */
export function toLocal(hhmm: string, offsetMin: number) {
  return shiftTime(hhmm, offsetMin);
}

/** 시차 설명: "한국보다 1시간 느림" / "한국과 시차 없음" */
export function tzOffsetLabel(offsetMin: number): string {
  if (!offsetMin) return "한국과 시차 없음";
  const h = Math.abs(offsetMin) / 60;
  const hs = Number.isInteger(h) ? String(h) : h.toFixed(1);
  return offsetMin > 0 ? `한국보다 ${hs}시간 빠름` : `한국보다 ${hs}시간 느림`;
}

/** 시간 문자열("14:30")을 특정 날짜에 합쳐 Date 로 */
export function withTime(date: Date, time?: string | null): Date {
  const d = new Date(date);
  if (time && /^\d{1,2}:\d{2}$/.test(time)) {
    const [h, m] = time.split(":").map(Number);
    d.setHours(h, m, 0, 0);
  }
  return d;
}

// ─────────────────────────────────────────────
// 임신 · 아기 (/baby)
// ─────────────────────────────────────────────

/** 임신 기간(일). 예정일 = 마지막 생리일 + 280일 */
export const PREGNANCY_DAYS = 280;

/** 마지막 생리일 → 출산 예정일 (로컬 자정) */
export function dueDateFromLmp(lmp: Date | string): Date {
  const d = startOfDay(new Date(lmp));
  d.setDate(d.getDate() + PREGNANCY_DAYS);
  return d;
}

export interface PregnancyProgress {
  /** 시작일(예정일-280)부터 오늘까지 경과일. 0 이상 */
  elapsedDays: number;
  weeks: number;
  days: number;
  /** 14주 미만 1 · 28주 미만 2 · 그 외 3 */
  trimester: 1 | 2 | 3;
  /** 0~1 */
  progress: number;
  /** 예정일까지 남은 일수 (오늘=0, 지났으면 음수) */
  dueDays: number;
  /** "D-245" | "D-DAY" | "D+3" */
  dueLabel: string;
  overdue: boolean;
}

/** 출산 예정일 기준 임신 진행 상황 */
export function pregnancyProgress(
  dueDate: Date | string,
  today: Date = new Date()
): PregnancyProgress {
  const due = startOfDay(new Date(dueDate));
  const t = startOfDay(today);
  const start = new Date(due);
  start.setDate(start.getDate() - PREGNANCY_DAYS);

  const elapsedDays = Math.max(0, differenceInCalendarDays(t, start));
  const weeks = Math.floor(elapsedDays / 7);
  const days = elapsedDays % 7;
  const trimester: 1 | 2 | 3 = weeks < 14 ? 1 : weeks < 28 ? 2 : 3;
  const progress = Math.min(1, elapsedDays / PREGNANCY_DAYS);

  const dueDays = differenceInCalendarDays(due, t);
  const dueLabel =
    dueDays === 0 ? "D-DAY" : dueDays > 0 ? `D-${dueDays}` : `D+${Math.abs(dueDays)}`;

  return { elapsedDays, weeks, days, trimester, progress, dueDays, dueLabel, overdue: dueDays < 0 };
}

/** "5주 3일" */
export function weekLabel(p: PregnancyProgress): string {
  return `${p.weeks}주 ${p.days}일`;
}

/** 태어난 지 N일 (출생 당일 = 0) */
export function daysSinceBirth(birthDate: Date | string, today: Date = new Date()): number {
  return Math.max(0, differenceInCalendarDays(startOfDay(today), startOfDay(new Date(birthDate))));
}

/** Date → "yyyy-MM-dd" (로컬 기준, <input type="date"> 용) */
export function toDateInput(d: Date | string): string {
  return format(new Date(d), "yyyy-MM-dd");
}

/** "yyyy-MM-dd" → 로컬 자정 Date */
export function fromDateInput(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * API 요청의 날짜 값을 Date 로. "yyyy-MM-dd"(10자 이하)는 서버 로컬 자정,
 * 그 외 문자열은 ISO 로 파싱. 문자열이 아니거나 비었거나 잘못되면 null.
 * (기념일·할일 API 와 같은 규칙 — 클라이언트는 날짜를 "yyyy-MM-dd" 로 보낸다)
 */
export function parseDateInput(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  const d = s.length <= 10 ? new Date(`${s}T00:00:00`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
