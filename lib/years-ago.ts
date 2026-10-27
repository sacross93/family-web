// 홈 「N년 전 오늘」 — 지난해들의 오늘(같은 월·일)에 찍은 사진. 없으면 ±3일 「이맘때」.
//
// 순수 함수만 둔다. 날짜는 전부 **서버 로컬**(`instrumentation.ts` 가 Asia/Seoul 로 맞춘다)의 달력으로 읽는다 —
// `takenAt` 은 그 날의 서버 로컬 자정으로 저장되고(`lib/photo-date.ts`), 앨범의 `takenOn` 은 UTC 자정
// (= 서울 같은 날 오전 9시)이라 둘 다 로컬 `getMonth()`·`getDate()` 로 읽으면 가족이 고른 그 날이다.
// SQL 의 `EXTRACT` 로 하지 않는 이유가 이것이다: DB 에는 UTC 로 들어 있어 서울 자정이 **전날** 15시다.

/** 「이맘때」 — 오늘 앞뒤 며칠까지. */
export const NEARBY_DAYS = 3;

/** 너무 오래된 해까지 창을 만들지 않는다(EXIF 가 1900년 전을 거른다 — 그래도 상한을 둔다). */
const MAX_YEARS = 130;

export interface YearsAgoWindow {
  yearsAgo: number;
  /** 포함. 서버 로컬 자정. */
  start: Date;
  /** 제외. 서버 로컬 자정. */
  end: Date;
}

/**
 * k년 전 오늘을 가운데로 한 ±3일 창. 2월 29일의 k년 전이 평년이면 3월 1일이 가운데다
 * (`new Date` 가 넘겨 준다 — 창의 앞뒤도 같은 방식으로 넘어가 일관된다).
 */
export function yearsAgoWindow(today: Date, yearsAgo: number): YearsAgoWindow {
  const y = today.getFullYear() - yearsAgo;
  const m = today.getMonth();
  const d = today.getDate();
  return {
    yearsAgo,
    start: new Date(y, m, d - NEARBY_DAYS),
    end: new Date(y, m, d + NEARBY_DAYS + 1),
  };
}

/**
 * 1년 전부터 `oldestYear` 가 걸칠 수 있는 해까지의 창들(가까운 해부터).
 * 연말·연초에는 창이 해를 넘으므로 `oldestYear` 의 한 해 앞을 가운데로 한 창까지 만든다.
 */
export function yearsAgoWindows(today: Date, oldestYear: number): YearsAgoWindow[] {
  const out: YearsAgoWindow[] = [];
  for (let k = 1; k <= MAX_YEARS && today.getFullYear() - k >= oldestYear - 1; k++) {
    out.push(yearsAgoWindow(today, k));
  }
  return out;
}

/** 이 날짜가 몇 년 전 오늘(같은 월·일)인지, 아니면 몇 년 전 이맘때인지. 올해 것·아무 데도 안 걸리면 null. */
export function matchYearsAgo(date: Date, today: Date): { yearsAgo: number; exact: boolean } | null {
  const ty = today.getFullYear();
  const gap = ty - date.getFullYear();
  if (date.getMonth() === today.getMonth() && date.getDate() === today.getDate()) {
    return gap >= 1 ? { yearsAgo: gap, exact: true } : null;
  }
  // 창은 해를 넘을 수 있어(12월 30일 ±3일) 이웃한 해의 창도 본다. 창끼리는 1년씩 떨어져 겹치지 않는다.
  for (const k of [gap - 1, gap, gap + 1]) {
    if (k < 1) continue;
    const w = yearsAgoWindow(today, k);
    if (date >= w.start && date < w.end) return { yearsAgo: k, exact: false };
  }
  return null;
}

export interface YearsAgoPick<T> {
  yearsAgo: number;
  /** true = 같은 월·일(「오늘」), false = ±3일(「이맘때」). */
  exact: boolean;
  /** 그 해의 것들, 날짜 순. */
  items: T[];
}

/**
 * 고른다: 같은 월·일이 하나라도 있으면 그중 **가장 가까운 해**, 없으면 ±3일 중 가장 가까운 해.
 * 「오늘」 이 「이맘때」 보다 먼저다 — 5년 전 오늘이 1년 전 이맘때보다 이 카드의 이름에 맞다.
 */
export function pickYearsAgo<T>(items: T[], dateOf: (item: T) => Date | null, today: Date): YearsAgoPick<T> | null {
  let best: { yearsAgo: number; exact: boolean } | null = null;
  const hits: { item: T; date: Date; yearsAgo: number; exact: boolean }[] = [];
  for (const item of items) {
    const date = dateOf(item);
    if (!date) continue;
    const m = matchYearsAgo(date, today);
    if (!m) continue;
    hits.push({ item, date, ...m });
    if (
      !best ||
      (m.exact && !best.exact) ||
      (m.exact === best.exact && m.yearsAgo < best.yearsAgo)
    ) {
      best = m;
    }
  }
  if (!best) return null;
  const chosen = best;
  return {
    yearsAgo: chosen.yearsAgo,
    exact: chosen.exact,
    items: hits
      .filter((h) => h.yearsAgo === chosen.yearsAgo && h.exact === chosen.exact)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((h) => h.item),
  };
}

/** "7년 전 오늘" · "1년 전 이맘때" */
export function yearsAgoTitle(pick: { yearsAgo: number; exact: boolean }): string {
  return `${pick.yearsAgo}년 전 ${pick.exact ? "오늘" : "이맘때"}`;
}
