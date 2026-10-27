// 달력에 얹는 기념일·계획 — **읽기 전용**(아기 페이지 표시와 같은 방식). CalendarEvent 로 저장하지 않는다:
// 그러면 기념일·계획을 고칠 때마다 일정도 맞춰 고쳐야 하고, 구글 캘린더 동기화(lib/gcal/)가 그 일정을
// 진짜 캘린더로 보낸다(기념일은 보내지 않기로 했다 — AGENTS.md "하지 않는 것"). 그리는 순간 여기서 센다.
//
// 기념일 날짜는 **서버에서** 센다(app/calendar/page.tsx 가 부른다). 음력을 세려면 음력 표
// (korean-lunar-calendar)가 필요한데, 이걸 달력 화면 묶음에 싣지 않으려고. 화면은 날짜 글자만 받는다.
// 계획은 시작~끝 두 글자만 넘기고 칸마다 걸리는지는 화면이 본다(달을 아무리 넘겨도 맞는다).
import { toDateInput } from "@/lib/date";
import { anniversaryDatesBetween, type AnniversaryDateFields } from "@/lib/anniversary-dates";
import { lunarLabel } from "@/lib/lunar";

export interface AnniversaryOverlay {
  id: string;
  title: string;
  emoji: string;
  /** 음력 기념일이면 "음력 3월 15일" — 칸의 날짜는 양력이라 왜 해마다 다른지 여기서 보인다 */
  lunar: string | null;
  /** 이 기념일이 걸리는 날들 "yyyy-MM-dd", 날짜순 */
  dates: string[];
}

export interface PlanOverlay {
  id: string;
  title: string;
  emoji: string;
  /** "yyyy-MM-dd" — 끝이 없거나 시작보다 앞이면 시작과 같다 */
  start: string;
  end: string;
}

export interface CalendarOccasions {
  anniversaries: AnniversaryOverlay[];
  plans: PlanOverlay[];
}

export const NO_OCCASIONS: CalendarOccasions = { anniversaries: [], plans: [] };

/**
 * 기념일을 미리 세어 두는 범위: **작년 1월 1일 ~ 내후년 12월 31일**(오늘 기준 네 해).
 * 달력은 화면에서 달을 넘기므로 넘겨 볼 만한 만큼을 미리 센다. 이 밖으로 넘기면 기념일만 안 보인다
 * (일정·계획은 그대로 보인다) — 반복 기념일 서른 개면 백이십 날짜, 이 이상은 싣는 값만 늘어난다.
 */
export function occasionWindow(today: Date = new Date()): { from: Date; to: Date } {
  return {
    from: new Date(today.getFullYear() - 1, 0, 1),
    to: new Date(today.getFullYear() + 2, 11, 31),
  };
}

export function buildOccasions(
  anniversaries: (AnniversaryDateFields & { id: string; title: string; emoji: string })[],
  plans: { id: string; title: string; emoji: string; startDate: Date | null; endDate: Date | null }[],
  today: Date = new Date()
): CalendarOccasions {
  const { from, to } = occasionWindow(today);
  return {
    anniversaries: anniversaries
      .map((a) => ({
        id: a.id,
        title: a.title,
        emoji: a.emoji,
        lunar: a.lunar ? lunarLabel(a.lunar) : null,
        dates: anniversaryDatesBetween(a, from, to).map(toDateInput),
      }))
      .filter((a) => a.dates.length > 0),
    plans: plans.flatMap((p) => {
      // 날짜를 아직 안 정한 계획은 달력에 놓을 자리가 없다.
      if (!p.startDate) return [];
      const start = toDateInput(p.startDate);
      const end = p.endDate ? toDateInput(p.endDate) : start;
      return [{ id: p.id, title: p.title, emoji: p.emoji, start, end: end < start ? start : end }];
    }),
  };
}
