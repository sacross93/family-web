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

/** 시간 문자열("14:30")을 특정 날짜에 합쳐 Date 로 */
export function withTime(date: Date, time?: string | null): Date {
  const d = new Date(date);
  if (time && /^\d{1,2}:\d{2}$/.test(time)) {
    const [h, m] = time.split(":").map(Number);
    d.setHours(h, m, 0, 0);
  }
  return d;
}
