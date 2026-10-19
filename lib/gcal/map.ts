// 사이트 일정 ↔ 구글 일정 변환(순수 함수, 스펙 §4).
//
// **날짜 글자는 언제나 Asia/Seoul 로 만든다 — 프로세스 시간대(TZ)에 전혀 기대지 않는다.** 운영의 nodejs 서버는
// instrumentation.ts 가 TZ 를 Asia/Seoul(또는 SITE_TZ)로 맞추지만, 그건 그 런타임에서 register() 가 돈 뒤의 일이고
// edge·시험·스크립트, SITE_TZ 를 바꾼 배포에서는 다르다. 로컬 시각에 기대면 같은 종일 일정이 한쪽에서는 10/20,
// 다른 쪽에서는 10/19 로 간다(koreaNow 와 같은 이유).
// 그래서 이 파일에는 `new Date(y, m, d)`·getDate()·date-fns format 이 없다 — Intl 에 시간대를 박아 쓰고,
// 문자열에는 +09:00 을 붙인다. 시험(map.test.ts)이 TZ 를 UTC 와 Asia/Seoul 로 바꿔 가며 같은 결과인지 본다.
//
// 사이트의 종일 일정은 서버 로컬 자정으로 저장돼 있다(/api/events — UTC 서버면 KST 09:00). 어느 쪽이든
// seoulDate 로 읽으면 같은 날이다. 구글에서 들어오는 종일 일정은 KST 자정으로 만든다.

import type { GEvent, GEventBody } from "./client";

export interface SiteFields {
  title: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date | null;
  allDay: boolean;
  color: string;
}

/** 사이트에서 고치지 못하는 이유. 반복 회차는 회차 id 라 시리즈를 못 고치고, 여러 날은 사이트 양식이 하루짜리라 잘린다. */
export type ReadOnly = "recurring" | "multiday" | null;

const TZ = "Asia/Seoul";
const HOUR = 3_600_000;
const DAY = 86_400_000;

const SEOUL_YMD = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** "yyyy-MM-dd" — Asia/Seoul 기준 그 시각의 날짜 */
export function seoulDate(d: Date): string {
  return SEOUL_YMD.format(d);
}

/** 그 날 00:00 KST 의 절대 시각 (한국은 서머타임이 없어 +09:00 고정) */
export function seoulMidnight(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+09:00`);
}

/** 유효한 시각인지 — Intl.format 은 잘못된 Date 에 던진다 */
function valid(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

/** 다음 날 글자 — 자정에 하루를 더해 다시 서울 날짜로 읽는다(달·해 넘김을 Date 가 맡는다). 글자가 이상하면 null. */
function nextSeoulDate(ymd: string): string | null {
  const midnight = seoulMidnight(ymd);
  return valid(midnight) ? seoulDate(new Date(midnight.getTime() + DAY)) : null;
}

// 사이트 팔레트 ↔ 구글 colorId (스펙 §4). 구글 기본(색 없음)은 캘린더 색 — 파란 계열이라 sky 로 받는다.
const TO_GOOGLE_COLOR: Record<string, string> = { lavender: "1", mint: "2", rose: "4", butter: "5", peach: "6", sky: "7" };
const FROM_GOOGLE_COLOR: Record<string, string> = Object.fromEntries(
  Object.entries(TO_GOOGLE_COLOR).map(([k, v]) => [v, k]),
);
const DEFAULT_COLOR = "sky";
const UNTITLED = "(제목 없음)";

export function toGoogle(f: SiteFields): GEventBody {
  const body: GEventBody = {
    summary: f.title,
    // null 대신 빈 글자 — PATCH 에서 빼 버리면 구글에 옛 메모가 남는다.
    description: f.description ?? "",
    location: f.location ?? "",
  };
  const colorId = TO_GOOGLE_COLOR[f.color];
  if (colorId) body.colorId = colorId;

  if (f.allDay) {
    // 사이트 종일 일정은 하루짜리. 구글의 끝 날짜는 **다음 날**(그 날을 포함하지 않는 끝)이다.
    const ymd = seoulDate(f.start);
    body.start = { date: ymd };
    body.end = { date: nextSeoulDate(ymd)! }; // seoulDate 가 만든 글자라 언제나 유효하다
  } else {
    // 구글은 끝이 필수. 없거나 시작보다 앞이면(구글이 거절한다) 시작 + 1시간 — 단 그날 자정(24:00)을 넘기지 않는다.
    // 23:30 일정에 00:30 끝을 달면 구글에서 이틀짜리가 되어, 돌아올 때 readOnly(multiday)로 잠긴다(사이트에서 만든 일정인데도).
    const nextMidnight = seoulMidnight(nextSeoulDate(seoulDate(f.start))!).getTime();
    const end =
      f.end && f.end.getTime() > f.start.getTime()
        ? f.end
        : new Date(Math.min(f.start.getTime() + HOUR, nextMidnight));
    body.start = { dateTime: f.start.toISOString(), timeZone: TZ };
    body.end = { dateTime: end.toISOString(), timeZone: TZ };
  }
  return body;
}

/** 구글 일정 모양만 보고 사이트에서 고칠 수 있는지 — 시작이 없어도(취소됨) 던지지 않는다. */
export function readOnlyOf(g: GEvent): ReadOnly {
  // 회차(recurringEventId)도, 시리즈 원본(recurrence)도 반복이다. 원본 id 로 PATCH·DELETE 하면 시리즈 **전체**가 바뀐다.
  if (g.recurringEventId || g.recurrence?.length) return "recurring";
  const s = g.start;
  const e = g.end;
  if (s?.date) {
    // 끝 날짜가 시작 다음 날보다 뒤면 이틀 이상 ("yyyy-MM-dd" 는 글자 비교가 곧 날짜 비교)
    const next = nextSeoulDate(s.date);
    return e?.date && next && e.date > next ? "multiday" : null;
  }
  if (s?.dateTime && e?.dateTime) {
    const start = new Date(s.dateTime);
    const end = new Date(e.dateTime);
    // 자정에 딱 끝나는 것(23:00~24:00)은 하루짜리 — 끝에서 1ms 빼고 날짜를 본다.
    if (valid(start) && end.getTime() > start.getTime() && seoulDate(new Date(end.getTime() - 1)) !== seoulDate(start)) {
      return "multiday";
    }
  }
  return null;
}

export function fromGoogle(g: GEvent): { fields: SiteFields; readOnly: ReadOnly } {
  const common = {
    title: g.summary?.trim() ? g.summary : UNTITLED,
    description: g.description || null,
    location: g.location || null,
    color: (g.colorId && FROM_GOOGLE_COLOR[g.colorId]) || DEFAULT_COLOR,
  };
  const readOnly = readOnlyOf(g);

  if (g.start?.date) {
    // 여러 날이어도 사이트에는 시작일 하루로 보인다(끝은 두지 않는다 — 양식이 하루짜리).
    const start = seoulMidnight(g.start.date);
    if (valid(start)) return { fields: { ...common, start, end: null, allDay: true }, readOnly };
  } else if (g.start?.dateTime) {
    const start = new Date(g.start.dateTime);
    const end = g.end?.dateTime ? new Date(g.end.dateTime) : null;
    if (valid(start)) {
      return { fields: { ...common, start, end: end && valid(end) ? end : null, allDay: false }, readOnly };
    }
  }
  // 취소된 일정은 시작 없이 온다 — 부르는 쪽(planSync)이 cancelled 를 먼저 거른다.
  throw new Error("구글 일정의 시작 시각을 읽지 못했어요");
}

/** 처음 합치기의 짝 찾기 — 같은 날(Asia/Seoul)·같은 제목(앞뒤 공백만 무시, 대소문자는 그대로). */
export function sameDaySameTitle(site: { start: Date; title: string }, g: GEvent): boolean {
  const title = site.title.trim();
  if (!title || !valid(site.start)) return false;
  let gDay: string | null = g.start?.date ?? null;
  if (!gDay && g.start?.dateTime) {
    const t = new Date(g.start.dateTime);
    gDay = valid(t) ? seoulDate(t) : null;
  }
  return gDay !== null && seoulDate(site.start) === gDay && title === (g.summary ?? "").trim();
}
