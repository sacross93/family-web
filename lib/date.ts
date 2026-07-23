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

/** 오후 3:00 */
export function kTime(d: Date | string) {
  return format(new Date(d), "a h:mm", { locale: ko });
}

/** 2026. 7. 21. */
export function kDot(d: Date | string) {
  return format(new Date(d), "yyyy. M. d.", { locale: ko });
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
