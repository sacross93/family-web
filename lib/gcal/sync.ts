// 구글 캘린더 동기화 — 엔진(DB·잠금·실행). 판단은 plan.ts(순수 함수), 구글과 말하는 것은 client.ts(스펙 §5·§6).
//
// 지키는 것
// - **처음 맞추기 전에는 아무것도 하지 않는다.** initialDoneAt 이 비어 있으면 runSync(자동)도, 쓰기 훅 셋도
//   구글을 한 번도 부르지 않는다. 로컬 .env 에 진짜 키·진짜 캘린더가 들어 있어서, 이게 없으면 화면을 열기만 해도
//   시드의 견본 일정("치과 정기검진" 등)이 가족의 진짜 캘린더로 간다. 처음 맞추기는 관리자가 미리보기를 보고 누른다.
// - **목록을 끝까지 못 읽으면 계획을 세우지 않는다.** listWindow 가 던지면 lastError 만 적고 끝 — 반쯤 읽은 목록으로
//   "없음 = 지워짐" 을 판단하면 창 안의 사이트 일정이 한꺼번에 지워진다.
// - **"목록에 없음" 만으로 지우지 않는다.** recheck 는 같은 실행에서 목록을 끝까지 읽은 뒤에만 오고(planSync), 다시 물어서
//   404·410·취소됨일 때만 지운다. 다시 묻기가 **실패**하면(403 = 공유가 풀림도 404 처럼 보일 수 있다) 아무것도 안 지운다.
// - **runSync 는 던지지 않는다.** 포동이 라우트가 Promise.race 로 기다리고, 화면은 결과의 changed 만 본다.
// - **비밀(키·토큰)은 결과·lastError·로그에 싣지 않는다.** GcalError.message 는 상태·짧은 코드로만 만들어져 있다.
//   그 밖의 예외(프리즈마 등)는 문구를 버리고 정해 둔 한국어 문장만 남긴다 — 예외 문구에 무엇이 실렸는지 모른다.
// - 한 건 실패는 그 건만. 사이트 쓰기는 구글 실패와 상관없이 성공으로 둔다(쓰기 훅은 던지지 않는다).
//
// 다시 돌지 않게: 실행할 때마다 연결의 `siteSyncedAt` 은 사이트 일정의 (새) updatedAt 으로, `googleUpdated` 는 구글이
// 돌려준 `updated` 로 적는다. 둘 중 하나라도 어긋나면 planSync 가 "바뀌었다" 로 보고 동기화마다 같은 일을 또 한다.

import type { CalendarEvent, GoogleEventLink, GoogleSyncState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { GcalDeps } from "./auth";
import { gcalConfig, type GcalOn } from "./config";
import { GcalError, deleteEvent, getEvent, insertEvent, listWindow, patchEvent, type GEvent } from "./client";
import { fromGoogle, readOnlyOf, seoulDate, seoulMidnight, toGoogle, type SiteFields } from "./map";
import { planSync, type Action, type PlanSite } from "./plan";

export type SyncOutcome =
  | { ran: false; reason: "disabled" | "not_started" | "throttled" | "locked" }
  | { ran: true; changed: number; error: string | null };

export interface GcalStatus {
  config: "on" | "missing" | "bad_key";
  calendarId: string | null;
  initialDoneAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  linked: number;
  pending: number;
}

/** 반복 회차·여러 날 일정을 사이트에서 고치거나 지우려 할 때의 409 문구(화면·포동이 모두 이 길을 탄다) */
export const READONLY_MESSAGE = "구글에서 반복되는(또는 여러 날) 일정이라 구글 캘린더에서 고쳐 주세요.";

/**
 * 포동이 한 턴이 동기화를 기다려 주는 최대 시간. 넘으면 동기화는 뒤에서 마저 돌고 이번 턴은 지금 DB 로 답한다.
 * 동기화 쪽 숫자라 여기 둔다(잠금·60초 제한과 같은 곳).
 */
export const AGENT_SYNC_WAIT_MS = 3_000;

const STATE_ID = "main";
/** 동시에 두 번 돌지 않게(스펙 §5-1) */
const LOCK_MS = 30_000;
/** 화면을 열 때마다 부르므로 — 마지막 시도가 이보다 가까우면 건너뛴다(force 제외) */
const THROTTLE_MS = 60_000;
/**
 * 한 실행이 액션을 실행하는 시간 상한. 잠금(30초)보다 짧아야 한다 — 넘기면 다른 요청이 잠금을 잡아 같은 구글 일정을
 * 두 번 가져온다. 액션 하나가 길어야 5초(구글 요청 상한)라 20초에서 멈추면 잠금 안에서 끝난다. 남은 것은 다음 실행이
 * 다시 계획한다(모든 판단이 DB·구글 상태에서 다시 나오므로 잃는 것이 없다).
 */
const RUN_BUDGET_MS = 20_000;
const DAY = 86_400_000;
/** 창: 오늘(서울) 자정 기준 90일 전 ~ 365일 뒤 그날 끝(스펙 §5) */
const WINDOW_PAST_DAYS = 90;
const WINDOW_FUTURE_DAYS = 366;

const GENERIC_ERROR = "구글 캘린더와 맞추지 못했어요";
const OFF_ERROR = "구글 캘린더 동기화가 꺼져 있어요";

// ─────────────────────────────────────────────
// 작은 도우미
// ─────────────────────────────────────────────

/** 밖으로 내보내도 되는 문구만. GcalError 는 비밀 없이 만들어져 있고, 그 밖의 것은 버린다. */
function safeMessage(e: unknown): string {
  return e instanceof GcalError ? e.message : GENERIC_ERROR;
}

/**
 * 서버 로그 한 줄. 예외 객체를 통째로 찍지 않는다 — stack·cause·meta 에 무엇이 실렸는지 모른다.
 * 남기는 것은 정해 둔 문구와 예외 **이름**·프리즈마 코드(P2002 같은 짧은 영숫자)뿐.
 */
function logFail(where: string, e: unknown): void {
  const code = (e as { code?: unknown } | null)?.code;
  const tag = e instanceof GcalError ? "" : ` (${e instanceof Error ? e.name : typeof e}${typeof code === "string" && /^[A-Za-z0-9_]{1,20}$/.test(code) ? ` · ${code}` : ""})`;
  console.error(`[gcal] ${where}: ${safeMessage(e)}${tag}`);
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function syncWindow(now: Date): { min: Date; max: Date } {
  const today = seoulMidnight(seoulDate(now)).getTime();
  return { min: new Date(today - WINDOW_PAST_DAYS * DAY), max: new Date(today + WINDOW_FUTURE_DAYS * DAY) };
}

function siteFields(ev: CalendarEvent): SiteFields {
  return {
    title: ev.title,
    description: ev.description,
    location: ev.location,
    start: ev.start,
    end: ev.end,
    allDay: ev.allDay,
    color: ev.color,
  };
}

function planSite(ev: CalendarEvent): PlanSite {
  return { id: ev.id, createdAt: ev.createdAt, updatedAt: ev.updatedAt, source: ev.source, start: ev.start, title: ev.title };
}

/** 상태 행 — 없으면 만든다(처음 켠 날). 두 요청이 동시에 만들면 한쪽이 유일키에 걸린다 → 이미 생긴 행을 읽는다. */
async function loadState(): Promise<GoogleSyncState> {
  try {
    return await prisma.googleSyncState.upsert({ where: { id: STATE_ID }, create: { id: STATE_ID }, update: {} });
  } catch (e) {
    const row = await prisma.googleSyncState.findUnique({ where: { id: STATE_ID } });
    if (!row) throw e;
    return row;
  }
}

/** 쓰기 훅이 구글을 불러도 되는가 — 켜져 있고, 처음 맞추기를 마쳤고, 그때와 같은 캘린더일 때만 */
async function startedConfig(): Promise<GcalOn | null> {
  const cfg = gcalConfig();
  if (!cfg.enabled) return null;
  const state = await prisma.googleSyncState.findUnique({ where: { id: STATE_ID } });
  if (!state?.initialDoneAt || state.calendarId !== cfg.calendarId) return null;
  return cfg;
}

// ─────────────────────────────────────────────
// 한 건씩 실행 — runSync 와 쓰기 훅이 같은 함수를 쓴다
// ─────────────────────────────────────────────

/** 구글 일정을 사이트에 새로 만든다. 일정과 연결을 **한 문장**으로(중첩 쓰기) — 연결이 유일키에 걸리면 일정도 안 생긴다. */
async function createSiteFrom(g: GEvent): Promise<void> {
  const { fields, readOnly } = fromGoogle(g);
  const ev = await prisma.calendarEvent.create({
    data: {
      ...fields,
      source: "google",
      // siteSyncedAt 은 일정이 생긴 뒤에야 안다 — 일단 옛 시각으로 두고 아래에서 바로 고친다.
      // 고치기가 실패해도 다음 동기화가 "사이트가 바뀜" 으로 보고 같은 내용을 한 번 더 보낼 뿐이다(해가 없다).
      googleLink: {
        create: { googleEventId: g.id, googleUpdated: new Date(g.updated), siteSyncedAt: new Date(0), readOnly },
      },
    },
  });
  await prisma.googleEventLink.update({ where: { eventId: ev.id }, data: { siteSyncedAt: ev.updatedAt } });
}

/** 구글 내용을 사이트로. 사이트에 못 보낸 변경이 있었어도 구글이 이겼으니 pendingPush 는 내린다. */
async function updateSiteFrom(linkId: string, eventId: string, g: GEvent): Promise<void> {
  const { fields, readOnly } = fromGoogle(g);
  const ev = await prisma.calendarEvent.update({ where: { id: eventId }, data: fields });
  await prisma.googleEventLink.update({
    where: { id: linkId },
    data: { googleUpdated: new Date(g.updated), siteSyncedAt: ev.updatedAt, readOnly, pendingPush: false },
  });
}

/**
 * 사이트 일정과 연결을 함께 지운다. 일정만 지우면 FK(SetNull)가 연결을 eventId 없는 고아로 남기고,
 * planSync 는 그런 연결을 일부러 건드리지 않아(로컬 DB 를 비웠을 때 진짜 캘린더를 지키려고) 영영 남는다.
 */
async function deleteSiteAndLink(linkId: string, eventId: string): Promise<void> {
  await prisma.$transaction([
    prisma.calendarEvent.deleteMany({ where: { id: eventId } }),
    prisma.googleEventLink.deleteMany({ where: { id: linkId } }),
  ]);
}

/**
 * 사이트 일정을 구글에 새로 만들고 잇는다. runSync 의 pushNew 와 만들기 훅이 같이 쓴다 — 둘이 겹칠 수 있다
 * (방금 만든 일정을 훅이 보내는 사이 다른 기기에서 화면을 열면 동기화도 그것을 "못 보낸 것" 으로 본다).
 * 연결의 eventId 가 유일키라 한쪽만 이긴다. 진 쪽은 방금 만든 구글 일정을 **거둔다** — 그대로 두면 구글에만 있는
 * 쌍둥이가 되어 다음 동기화가 사이트로 또 가져온다.
 */
async function pushNewEvent(cfg: GcalOn, ev: CalendarEvent, deps?: GcalDeps): Promise<boolean> {
  if (await prisma.googleEventLink.findUnique({ where: { eventId: ev.id }, select: { id: true } })) return false;
  const made = await insertEvent(cfg, toGoogle(siteFields(ev)), deps);
  try {
    await prisma.googleEventLink.create({
      data: {
        eventId: ev.id,
        googleEventId: made.id,
        googleUpdated: new Date(made.updated),
        siteSyncedAt: ev.updatedAt,
        readOnly: readOnlyOf(made),
      },
    });
  } catch (e) {
    await deleteEvent(cfg, made.id, deps).catch((err) => logFail("겹쳐 만든 구글 일정 거두기", err));
    throw e;
  }
  return true;
}

/**
 * 사이트 내용을 구글로. siteSyncedAt 은 **보내기 전에 읽은** updatedAt — 보내는 사이에 누가 또 고쳤으면
 * 그 값이 더 크므로 다음 동기화가 다시 보낸다(나중 것을 잃지 않는다).
 */
async function pushUpdate(cfg: GcalOn, link: { id: string; googleEventId: string }, ev: CalendarEvent, deps?: GcalDeps) {
  const res = await patchEvent(cfg, link.googleEventId, toGoogle(siteFields(ev)), deps);
  await prisma.googleEventLink.update({
    where: { id: link.id },
    data: { googleUpdated: new Date(res.updated), siteSyncedAt: ev.updatedAt, pendingPush: false, readOnly: readOnlyOf(res) },
  });
}

/** 못 보낸 변경 표시. readOnly 연결에는 세우지 않는다 — 반복 회차는 사이트에서 보내는 길이 없다. */
async function markPendingPush(linkId: string): Promise<void> {
  await prisma.googleEventLink
    .updateMany({ where: { id: linkId, readOnly: null }, data: { pendingPush: true } })
    .catch((e) => logFail("보내기 대기 표시", e));
}

interface RunCtx {
  cfg: GcalOn;
  deps?: GcalDeps;
  now: Date;
  window: { min: Date; max: Date };
  sites: Map<string, CalendarEvent>;
  links: Map<string, GoogleEventLink>;
}

/** 액션 하나를 실행한다. 무언가 바뀌었으면 true. 실패는 던진다(부르는 쪽이 그 건만 실패로 센다). */
async function execute(a: Action, ctx: RunCtx): Promise<boolean> {
  const { cfg, deps } = ctx;
  const siteOf = (id: string) => {
    const ev = ctx.sites.get(id);
    if (!ev) throw new Error("사이트 일정을 찾지 못했어요");
    return ev;
  };

  switch (a.kind) {
    case "createSite":
      await createSiteFrom(a.google);
      return true;
    case "updateSite":
      await updateSiteFrom(a.linkId, a.eventId, a.google);
      return true;
    case "deleteSite":
      await deleteSiteAndLink(a.linkId, a.eventId);
      return true;
    case "recheck": {
      // 던지면(403·5xx·시간 초과) 그대로 실패 — 지우지 않는다. 404·410 만 null 이다.
      const g = await getEvent(cfg, a.googleEventId, deps);
      if (!g || g.status === "cancelled") {
        await deleteSiteAndLink(a.linkId, a.eventId);
        return true;
      }
      // 살아 있다(창 밖으로 옮겨졌다). 어느 쪽이 이길지는 planSync 에 이 연결 하나만 넣어 다시 묻는다 —
      // 판단 갈래를 여기에 한 벌 더 두지 않으려고. complete:false 라 지우기·다시 묻기는 나오지 않는다.
      const link = ctx.links.get(a.linkId);
      const site = ctx.sites.get(a.eventId);
      if (!link || !site) return false;
      const [next] = planSync({
        now: ctx.now,
        window: ctx.window,
        complete: false,
        google: [g],
        site: [planSite(site)],
        links: [link],
        initialDoneAt: null,
        initial: false,
      });
      return next ? execute(next, ctx) : false;
    }
    case "link": {
      // 같은 날·같은 제목을 하나로 **잇기만** 한다. 내용은 옮기지 않는다 — 구글에 쓰지 않고(지난 일정은 보내지 않는다는
      // 약속과 같은 쪽), 사이트에 적힌 것도 지우지 않는다. 다음에 어느 쪽이든 고치면 그때부터 그쪽 내용이 간다.
      const site = siteOf(a.eventId);
      await prisma.googleEventLink.create({
        data: {
          eventId: site.id,
          googleEventId: a.google.id,
          googleUpdated: new Date(a.google.updated),
          siteSyncedAt: site.updatedAt,
          readOnly: readOnlyOf(a.google),
        },
      });
      return true;
    }
    case "pushNew":
      return pushNewEvent(cfg, siteOf(a.eventId), deps);
    case "pushUpdate":
      await pushUpdate(cfg, { id: a.linkId, googleEventId: a.googleEventId }, siteOf(a.eventId), deps);
      return true;
    case "deleteGoogle":
      await deleteEvent(cfg, a.googleEventId, deps); // 404·410 = 이미 없음 = 성공
      await prisma.googleEventLink.deleteMany({ where: { id: a.linkId } });
      return true;
  }
}

// ─────────────────────────────────────────────
// 한 번의 동기화
// ─────────────────────────────────────────────

/** 계획에 넣을 재료. 구글 목록을 **먼저** 읽고(던지면 여기서 끝) 사이트 쪽은 그다음 — 가장 최근 것으로 판단하게. */
async function gather(cfg: GcalOn, now: Date, deps: GcalDeps | undefined, opts: { ignoreLinks: boolean }) {
  const window = syncWindow(now);
  const google = await listWindow(cfg, window.min, window.max, deps);
  // 가족 캘린더 규모라 전부 읽는다 — planSync 는 연결된 것 전부와 연결 없는 것 전부를 받아야 짝을 놓치지 않는다.
  const [events, links] = await Promise.all([
    prisma.calendarEvent.findMany(),
    opts.ignoreLinks ? Promise.resolve([] as GoogleEventLink[]) : prisma.googleEventLink.findMany(),
  ]);
  return {
    window,
    google,
    sites: new Map(events.map((e) => [e.id, e])),
    links: new Map(links.map((l) => [l.id, l])),
  };
}

export async function runSync(opts: { force?: boolean; initial?: boolean; deps?: GcalDeps } = {}): Promise<SyncOutcome> {
  const cfg = gcalConfig();
  if (!cfg.enabled) return { ran: false, reason: "disabled" };
  const { deps } = opts;
  // 이 실행의 "지금" 은 하나 — 창·잠금·initialDoneAt 이 모두 이 값에서 나온다.
  const now = new Date(deps?.now?.() ?? Date.now());
  let locked = false;

  try {
    let state = await loadState();

    if (state.calendarId !== cfg.calendarId) {
      // 대상 캘린더가 바뀌었다(스펙 §5-2): 옛 캘린더의 연결은 새 캘린더에서 뜻이 없다. 전부 지우고 처음 맞추기부터.
      // 사이트 일정은 그대로 둔다. calendarId 가 비어 있던 것(처음 켠 날)은 지울 연결이 없으니 적기만 한다.
      if (state.calendarId !== null) await prisma.googleEventLink.deleteMany({});
      state = await prisma.googleSyncState.update({
        where: { id: STATE_ID },
        data: { calendarId: cfg.calendarId, initialDoneAt: null },
      });
    }

    // 처음 맞추기는 initialDoneAt 이 비었을 때만. 이미 마쳤으면 initial 이라도 평소 동기화로 돈다 —
    // 그 뒤로 연결 없이 남은 일정(처음 맞추기 전의 지난 일정)을 이제 와서 구글로 보내지 않는다.
    const initial = Boolean(opts.initial) && !state.initialDoneAt;
    if (!initial && !state.initialDoneAt) return { ran: false, reason: "not_started" };
    if (!opts.force && state.lastSyncAt && now.getTime() - state.lastSyncAt.getTime() < THROTTLE_MS) {
      return { ran: false, reason: "throttled" };
    }

    // 잠금은 조건부 updateMany 의 count 로 잡는다 — 두 요청이 같이 와도 한쪽만 1 을 받는다.
    const got = await prisma.googleSyncState.updateMany({
      where: { id: STATE_ID, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
      data: { lockedUntil: new Date(now.getTime() + LOCK_MS) },
    });
    if (got.count === 0) return { ran: false, reason: "locked" };
    locked = true;

    return await syncLocked(cfg, now, initial, state.initialDoneAt, deps);
  } catch (e) {
    logFail("동기화", e);
    return { ran: true, changed: 0, error: safeMessage(e) };
  } finally {
    if (locked) {
      await prisma.googleSyncState
        .updateMany({ where: { id: STATE_ID }, data: { lockedUntil: null } })
        .catch((e) => logFail("잠금 풀기", e));
    }
  }
}

async function syncLocked(
  cfg: GcalOn,
  now: Date,
  initial: boolean,
  initialDoneAt: Date | null,
  deps: GcalDeps | undefined,
): Promise<SyncOutcome> {
  let changed = 0;
  let failed = 0;
  let firstFailure: string | null = null;
  let cut = false;
  let error: string | null = null;

  try {
    const data = await gather(cfg, now, deps, { ignoreLinks: false });
    const ctx: RunCtx = { cfg, deps, now, window: data.window, sites: data.sites, links: data.links };
    const actions = planSync({
      now,
      window: data.window,
      complete: true, // listWindow 는 끝까지 읽었거나 던졌다 — 여기까지 왔으면 끝까지 읽은 것
      google: data.google,
      site: [...data.sites.values()].map(planSite),
      links: [...data.links.values()],
      initialDoneAt,
      initial,
    });

    const startedAt = Date.now();
    for (const a of actions) {
      if (Date.now() - startedAt > RUN_BUDGET_MS) {
        cut = true;
        break;
      }
      try {
        if (await execute(a, ctx)) changed++;
      } catch (e) {
        failed++;
        firstFailure ??= safeMessage(e);
        logFail(a.kind, e);
        if (a.kind === "pushUpdate") await markPendingPush(a.linkId);
      }
    }

    if (failed > 0) error = `일정 ${failed}개를 맞추지 못했어요 (${firstFailure})`;
    else if (cut) error = "일정이 많아 이번에 다 맞추지 못했어요 — 다음에 이어서 맞춰요";
    // 처음 맞추기가 다 끝나지 않았으면 initialDoneAt 을 적지 않는다. 적으면 못 보낸 일정은 createdAt 이 그보다 앞이라
    // 평소 동기화의 "못 보낸 것 보내기" 에 영영 안 걸린다. 이미 이은 것은 남으니 다시 누르면 남은 것만 한다.
    if (initial && error) error = `${error} — [처음 맞추기]를 한 번 더 눌러 주세요`;
  } catch (e) {
    // 목록을 끝까지 못 읽었다(또는 DB 를 못 읽었다) — 계획을 세우지 않았다. 지운 것도 쓴 것도 없다.
    logFail("목록 읽기", e);
    error = safeMessage(e);
  }

  // lastSyncAt 은 "마지막 시도". 실패도 적는다 — 구글이 아픈 동안 화면을 열 때마다 두드리지 않게(관리자 force 는 통과).
  await prisma.googleSyncState.update({
    where: { id: STATE_ID },
    data: {
      lastSyncAt: now,
      lastError: error,
      // 실행 **시작** 시각 — 실행 도중에 사이트에서 만든 일정은 createdAt 이 이보다 뒤라 다음 동기화가 보낸다.
      ...(initial && error === null ? { initialDoneAt: now, calendarId: cfg.calendarId } : {}),
    },
  });
  return { ran: true, changed, error };
}

// ─────────────────────────────────────────────
// 관리자 카드
// ─────────────────────────────────────────────

export async function gcalStatus(): Promise<GcalStatus> {
  const cfg = gcalConfig();
  const [state, linked, pending] = await Promise.all([
    prisma.googleSyncState.findUnique({ where: { id: STATE_ID } }),
    prisma.googleEventLink.count({ where: { eventId: { not: null } } }),
    prisma.googleEventLink.count({ where: { OR: [{ pendingPush: true }, { pendingDelete: true }] } }),
  ]);
  // 캘린더가 바뀌었는데 아직 한 번도 안 돌았으면 옛 캘린더의 initialDoneAt 이 남아 있다 — 처음 맞추기 전으로 보인다.
  const sameCalendar = cfg.enabled && state?.calendarId === cfg.calendarId;
  return {
    config: cfg.enabled ? "on" : cfg.reason,
    calendarId: cfg.enabled ? cfg.calendarId : null,
    initialDoneAt: sameCalendar ? iso(state?.initialDoneAt) : null,
    lastSyncAt: iso(state?.lastSyncAt),
    lastError: state?.lastError ?? null,
    linked,
    pending,
  };
}

/**
 * 처음 맞추기의 미리보기 — "구글로 보낼 N · 이을 M · 가져올 K". **아무것도 쓰지 않는다**(상태 행도).
 * 실제 실행(runSync initial)과 같은 재료·같은 planSync 로 세므로 숫자가 같다(시험이 잡는다).
 */
export async function previewInitial(
  deps?: GcalDeps,
): Promise<{ toPush: number; toLink: number; toImport: number } | { error: string }> {
  const cfg = gcalConfig();
  if (!cfg.enabled) return { error: OFF_ERROR };
  try {
    const now = new Date(deps?.now?.() ?? Date.now());
    const state = await prisma.googleSyncState.findUnique({ where: { id: STATE_ID } });
    // 캘린더가 바뀌었으면 실제 실행은 연결을 다 지우고 시작한다 — 미리보기도 연결 없이 센다.
    const calendarChanged = state?.calendarId != null && state.calendarId !== cfg.calendarId;
    const data = await gather(cfg, now, deps, { ignoreLinks: calendarChanged });
    const actions = planSync({
      now,
      window: data.window,
      complete: true,
      google: data.google,
      site: [...data.sites.values()].map(planSite),
      links: [...data.links.values()],
      initialDoneAt: null,
      initial: true,
    });
    const count = (k: Action["kind"]) => actions.filter((a) => a.kind === k).length;
    return { toPush: count("pushNew"), toLink: count("link"), toImport: count("createSite") };
  } catch (e) {
    logFail("미리보기", e);
    return { error: safeMessage(e) };
  }
}

// ─────────────────────────────────────────────
// 사이트에서 쓸 때 (/api/events, 스펙 §6)
// ─────────────────────────────────────────────

/** 사이트에서 고치지 못하는 일정인가 — DB 만 본다(꺼져 있어도 반복 회차는 반복 회차다). 라우트가 409 를 낸다. */
export async function readOnlyReason(eventId: string): Promise<"recurring" | "multiday" | null> {
  const link = await prisma.googleEventLink.findUnique({ where: { eventId }, select: { readOnly: true } });
  const r = link?.readOnly;
  return r === "recurring" || r === "multiday" ? r : null;
}

/** 만들기 뒤. 실패는 삼킨다 — 연결 없이 남은 일정은 createdAt ≥ initialDoneAt 이라 다음 동기화가 보낸다. */
export async function afterSiteCreate(eventId: string, deps?: GcalDeps): Promise<void> {
  try {
    const cfg = await startedConfig();
    if (!cfg) return;
    const ev = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
    if (!ev) return;
    await pushNewEvent(cfg, ev, deps);
  } catch (e) {
    logFail("만든 일정 보내기", e);
  }
}

/** 고치기 뒤. 실패하면 pendingPush — 다음 동기화가 다시 보낸다. */
export async function afterSiteUpdate(eventId: string, deps?: GcalDeps): Promise<void> {
  let linkId: string | null = null;
  try {
    const cfg = await startedConfig();
    if (!cfg) return;
    const link = await prisma.googleEventLink.findUnique({ where: { eventId } });
    // 연결이 없으면 할 일이 없다(못 보낸 새 일정이면 동기화의 pushNew 가 맡는다). readOnly 는 라우트가 이미 409 로 막았다.
    if (!link || link.readOnly || link.pendingDelete) return;
    linkId = link.id;
    const ev = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
    if (!ev) return;
    await pushUpdate(cfg, link, ev, deps);
  } catch (e) {
    logFail("고친 일정 보내기", e);
    if (linkId) await markPendingPush(linkId);
  }
}

/**
 * 지우기 **전에** 부른다. 연결이 있으면 그 자리에서 묘비(pendingDelete)를 세운다 — DB 만, 구글은 안 부른다.
 * 왜 앞에서: 사이트 일정이 지워지는 순간 FK 가 연결의 eventId 를 비우고, 묘비 표시 없는 빈 연결은 planSync 가 일부러
 * 무시한다(로컬 DB 를 비웠을 때 진짜 캘린더를 지키려고). 그러니 지운 뒤에 함수가 죽으면(시간 초과·배포) 구글 일정이
 * 영영 남는다. 앞에서 세워 두면 어디서 끊겨도 다음 동기화가 지운다.
 */
export async function beforeSiteDelete(eventId: string): Promise<{ linkId: string; googleEventId: string } | null> {
  const link = await prisma.googleEventLink.findUnique({ where: { eventId }, select: { id: true, googleEventId: true } });
  if (!link) return null;
  // update 가 아니라 updateMany — 읽은 뒤 그 사이 동기화가 연결을 지웠으면 update 는 P2025 를 던져 DELETE 가 500 이 된다
  // (화면은 낙관적 삭제를 되돌린다: AGENTS.md DELETE 규칙). 이미 없으면 세울 묘비도 없다.
  const marked = await prisma.googleEventLink.updateMany({
    where: { id: link.id },
    data: { pendingDelete: true, pendingPush: false },
  });
  if (marked.count === 0) return null;
  return { linkId: link.id, googleEventId: link.googleEventId };
}

/** 지우기 뒤. 구글에서 지우고 연결을 없앤다. 실패하면 묘비로 남는다(다음 동기화가 지운다). */
export async function afterSiteDelete(
  link: { linkId: string; googleEventId: string } | null,
  deps?: GcalDeps,
): Promise<void> {
  if (!link) return;
  try {
    const cfg = await startedConfig();
    if (!cfg) return; // 묘비는 beforeSiteDelete 가 이미 세웠다
    await deleteEvent(cfg, link.googleEventId, deps); // 404·410 = 이미 없음 = 성공
    await prisma.googleEventLink.deleteMany({ where: { id: link.linkId } });
  } catch (e) {
    logFail("지운 일정 구글에서 지우기", e);
    // FK(SetNull)가 eventId 를 비웠겠지만 거기에 기대지 않는다 — 묘비 모양을 여기서 확실히.
    await prisma.googleEventLink
      .updateMany({ where: { id: link.linkId }, data: { eventId: null, pendingDelete: true } })
      .catch((err) => logFail("묘비 남기기", err));
  }
}
