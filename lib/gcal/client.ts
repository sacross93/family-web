// 구글 캘린더 REST — 쓰는 다섯 가지만, fetch 로 얇게. (`googleapis` 패키지는 쓰지 않는다: 스펙 §2)
//
// **목록은 끝까지 읽거나 던진다.** 반쯤 읽은 목록을 돌려주면 동기화가 "목록에 없음 = 구글에서 지움" 으로 보고
// 창 안의 사이트 일정을 한꺼번에 지운다(스펙 §5-3). 그래서 한 쪽이라도 실패·시간 초과·형식 오류면 결과 없이 던진다.
//
// 요청 하나마다 5초 제한(auth.ts 의 timedFetch). 오류는 GcalError — 상태와 짧은 코드만, 구글 본문의 문구는 싣지 않는다.

import { GcalError, _resetTokenCache, getAccessToken, parseJson, safeCode, timedFetch, type GcalDeps } from "./auth";
import type { GcalOn } from "./config";

export { GcalError };

export interface GTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GEvent {
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
  updated: string;
  summary?: string;
  description?: string;
  location?: string;
  colorId?: string;
  start?: GTime;
  end?: GTime;
  recurringEventId?: string;
  /**
   * 반복 시리즈 **원본**에만 있다(RRULE 등). singleEvents=true 목록에는 원본이 안 오고 회차만 오지만, id 로 하나를 다시
   * 물으면(getEvent) 원본이 온다 — 연결된 단일 일정을 가족이 구글에서 "매주 반복" 으로 바꾸면 그 id 가 원본이 된다.
   */
  recurrence?: string[];
}

export type GEventBody = Pick<GEvent, "summary" | "description" | "location" | "colorId" | "start" | "end">;

const PAGE_SIZE = 250;
/** 250 × 40 = 1만 개. 가족 캘린더 창(1년 남짓)에서 넘을 일이 없다 — 넘으면 끝을 못 본 것이니 던진다. */
const MAX_PAGES = 40;

function eventsUrl(cfg: GcalOn, id?: string): string {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cfg.calendarId)}/events`;
  return id === undefined ? base : `${base}/${encodeURIComponent(id)}`;
}

/** 구글 오류 본문에서 코드만: `error.errors[0].reason` 또는 `error.status`. 문구(message)는 읽지 않는다. */
function errorCode(body: unknown): string | null {
  const err = (body as { error?: { errors?: { reason?: unknown }[]; status?: unknown } } | undefined)?.error;
  if (!err || typeof err !== "object") return null;
  return safeCode(err.errors?.[0]?.reason) ?? safeCode(err.status);
}

interface Sent {
  status: number;
  ok: boolean;
  body: unknown;
}

async function send(cfg: GcalOn, method: string, url: string, deps: GcalDeps | undefined, payload?: unknown): Promise<Sent> {
  const token = await getAccessToken(cfg, deps);
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (payload !== undefined) headers["content-type"] = "application/json";
  const res = await timedFetch(deps, url, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  // 토큰이 만료 전에 죽었으면(키 교체 등) 다음 요청은 새로 받게 한다. 이번 요청은 실패로 둔다.
  if (res.status === 401) _resetTokenCache();
  return { status: res.status, ok: res.ok, body: parseJson(res.text) };
}

function fail(res: Sent): never {
  throw new GcalError(res.status, errorCode(res.body));
}

/** 일정 하나의 모양을 확인한다 — id 가 글자가 아니면 형식 오류(계획이 id 로 짝을 찾는다). */
function asEvent(v: unknown, status: number): GEvent {
  if (!v || typeof v !== "object" || typeof (v as { id?: unknown }).id !== "string") {
    throw new GcalError(status, "bad_response");
  }
  return v as GEvent;
}

/** 창 안 일정 전부(반복은 회차로 펼치고, 지운 것도 "cancelled" 로). 모든 쪽을 읽거나 GcalError 를 던진다. */
export async function listWindow(cfg: GcalOn, min: Date, max: Date, deps?: GcalDeps): Promise<GEvent[]> {
  const out: GEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({
      singleEvents: "true",
      showDeleted: "true",
      maxResults: String(PAGE_SIZE),
      timeMin: min.toISOString(),
      timeMax: max.toISOString(),
    });
    if (pageToken) q.set("pageToken", pageToken);

    const res = await send(cfg, "GET", `${eventsUrl(cfg)}?${q}`, deps);
    if (!res.ok) fail(res);
    const body = res.body as { items?: unknown; nextPageToken?: unknown } | undefined;
    if (!body || typeof body !== "object") throw new GcalError(res.status, "bad_response");
    // 일정이 없는 쪽은 items 가 아예 빠져서 온다
    const items = body.items ?? [];
    if (!Array.isArray(items)) throw new GcalError(res.status, "bad_response");
    for (const item of items) out.push(asEvent(item, res.status));

    if (body.nextPageToken === undefined) return out;
    if (typeof body.nextPageToken !== "string" || !body.nextPageToken) throw new GcalError(res.status, "bad_response");
    pageToken = body.nextPageToken;
  }
  throw new GcalError(0, "too_many_pages", "구글 캘린더 일정이 너무 많아 끝까지 읽지 못했어요");
}

/** 하나만 다시 묻기. 404·410(지워짐) → null */
export async function getEvent(cfg: GcalOn, id: string, deps?: GcalDeps): Promise<GEvent | null> {
  const res = await send(cfg, "GET", eventsUrl(cfg, id), deps);
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) fail(res);
  return asEvent(res.body, res.status);
}

/**
 * id 를 주면 그 id 로 만든다(구글 규칙: base32hex 글자 a–v·0–9, 5~1024자). 같은 id 가 이미 있으면(지운 것 포함) 409.
 * 동기화는 사이트 일정 id 에서 이 값을 뽑아 넘긴다 — 응답을 못 받은 만들기를 다시 해도 둘이 생기지 않게(sync.ts).
 */
export async function insertEvent(cfg: GcalOn, body: GEventBody & { id?: string }, deps?: GcalDeps): Promise<GEvent> {
  const res = await send(cfg, "POST", eventsUrl(cfg), deps, body);
  if (!res.ok) fail(res);
  return asEvent(res.body, res.status);
}

/**
 * PATCH 는 안쪽 객체를 **합친다** — 시간 일정을 종일로 바꾸며 `start:{date}` 만 보내면 옛 dateTime 이
 * 남아 구글이 거절한다. 그래서 쓰지 않는 쪽을 null 로 명시해 지운다.
 */
function wireTime(t: GTime | undefined): Record<string, string | null> | undefined {
  if (!t) return undefined;
  if (t.date) return { ...t, date: t.date, dateTime: null, timeZone: null };
  if (t.dateTime) return { ...t, date: null };
  return { ...t };
}

export async function patchEvent(cfg: GcalOn, id: string, body: GEventBody, deps?: GcalDeps): Promise<GEvent> {
  const wire = { ...body, start: wireTime(body.start), end: wireTime(body.end) };
  const res = await send(cfg, "PATCH", eventsUrl(cfg, id), deps, wire);
  if (!res.ok) fail(res);
  return asEvent(res.body, res.status);
}

/** 404·410 → 이미 없는 것 — 성공. (두 번 지워도 같은 결과: AGENTS.md DELETE 규칙) */
export async function deleteEvent(cfg: GcalOn, id: string, deps?: GcalDeps): Promise<void> {
  const res = await send(cfg, "DELETE", eventsUrl(cfg, id), deps);
  if (res.ok || res.status === 404 || res.status === 410) return;
  fail(res);
}
