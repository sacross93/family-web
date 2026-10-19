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

import { createHash } from "node:crypto";
import type { CalendarEvent, GoogleEventLink, GoogleSyncState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { GcalDeps } from "./auth";
import { gcalConfig, type GcalOn } from "./config";
import { GcalError, deleteEvent, getEvent, insertEvent, listWindow, patchEvent, type GEvent } from "./client";
import { fromGoogle, readOnlyOf, seoulDate, seoulMidnight, toGoogle, type SiteFields } from "./map";
import { planSync, type Action, type PlanSite } from "./plan";
import type { GcalPreview, GcalStatus, SyncOutcome } from "./contract";

// 응답 모양과 409 문구는 prisma 없는 contract.ts 에 산다 — 화면("use client")도 같은 것을 읽어야 해서.
// 여기서 다시 내보내 라우트·시험의 import 는 그대로 둔다.
export type { GcalPreview, GcalStatus, SyncOutcome } from "./contract";
export { READONLY_MESSAGE } from "./contract";

/**
 * 포동이 한 턴이 동기화를 기다려 주는 최대 시간. 넘으면 동기화는 뒤에서 마저 돌고 이번 턴은 지금 DB 로 답한다.
 * 동기화 쪽 숫자라 여기 둔다(잠금·60초 제한과 같은 곳).
 */
export const AGENT_SYNC_WAIT_MS = 3_000;

const STATE_ID = "main";
/**
 * 동시에 두 번 돌지 않게(스펙 §5-1). 실행 상한(RUN_BUDGET_MS)보다 **넉넉히** 길어야 한다 — 목록 몇 쪽(쪽당 5초) +
 * 20초 실행 + 마지막 액션 하나가 다 들어가고도 남게. 쓰는 액션 하나는 이제 요청이 두세 개다(토큰 + 다시 묻기 GET + 쓰기,
 * 각각 5초 상한) — 길면 10~15초, 409 되찾기(insert + GET + 연결)까지 쳐도 20초 안이다. 그래도 목록 + 20초 + 20초 < 60초.
 * 짧으면 느린 실행 도중에 잠금이 풀려 다른 요청이 같은 일을 한다.
 */
const LOCK_MS = 60_000;
/** 화면을 열 때마다 부르므로 — 마지막 시도가 이보다 가까우면 건너뛴다(force 제외) */
const THROTTLE_MS = 60_000;
/**
 * 한 실행이 액션을 실행하는 시간 상한. 잠금(60초)보다 한참 짧게 — 넘기면 다른 요청이 잠금을 잡아 같은 구글 일정을
 * 두 번 가져온다. 이 값은 "새 액션을 시작하지 않는" 경계라, 마지막 액션(길면 10~20초 — 위 LOCK_MS)이 넘쳐도 잠금 안에서
 * 끝난다. 남은 것은 다음 실행이 다시 계획한다(모든 판단이 DB·구글 상태에서 다시 나오므로 잃는 것이 없다).
 */
const RUN_BUDGET_MS = 20_000;
const DAY = 86_400_000;
/** 창: 오늘(서울) 자정 기준 90일 전 ~ 365일 뒤 그날 끝(스펙 §5) */
const WINDOW_PAST_DAYS = 90;
const WINDOW_FUTURE_DAYS = 366;

const GENERIC_ERROR = "구글 캘린더와 맞추지 못했어요";
const OFF_ERROR = "구글 캘린더 동기화가 꺼져 있어요";

/**
 * 사이트 일정 id → 구글 일정 id. **결정적**이다 — 같은 사이트 일정은 언제나 같은 구글 id 로 만든다.
 *
 * 왜: 구글에는 만들어졌는데 응답을 못 받으면(5초 초과·연결 끊김) 연결이 안 남는다. id 를 구글에 맡기면 다음 동기화가
 * 그 구글 일정을 "연결 없는 구글 일정" 으로 사이트에 하나 더 만들고(createSite), 사이트 일정은 "못 보낸 것" 으로 구글에
 * 하나 더 만든다(pushNew) — 양쪽에 둘씩 생긴다. id 를 우리가 정해 두면 다시 보내도 구글이 409 로 막고, 목록에서도 짝을 안다.
 *
 * 구글 규칙: base32hex 글자(a–v, 0–9)만, 5~1024자. 16진수(0–9a–f)는 그 안에 들어간다. 앞의 "pd" 도 a–v 안이다.
 * 160비트면 가족 캘린더에서 겹칠 일이 없다. **이 식을 바꾸지 말 것** — 바꾸면 이미 보낸 일정과 짝을 못 찾는다(시험이 값을 박아 둔다).
 */
export function googleIdFor(eventId: string): string {
  return `pd${createHash("sha256").update(eventId).digest("hex").slice(0, 40)}`;
}

/**
 * 짝은 찾았는데 두 쪽 내용이 같은지 모를 때 연결에 적는 시각. 둘 다 "아주 옛날" 이면 다음 동기화가 양쪽 모두 바뀐 것으로
 * 보고 **나중에 고친 쪽**을 고른다(planSync 의 둘 다 바뀜 갈래) — 잃어버린 만들기 뒤에 사이트에서 또 고쳤든, 구글에서
 * 고쳤든 그 규칙대로 맞는다.
 */
const RECONCILE = new Date(0);

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

/** 쓰는 순간의 시각 — 일정의 updatedAt 과 연결의 siteSyncedAt 에 **같은 값**으로 넣는다. 시험은 deps.now 로 가짜 시계를 쓴다. */
function writeTime(deps?: GcalDeps): Date {
  return new Date(deps?.now?.() ?? Date.now());
}

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

/*
 * 구글 → 사이트로 쓸 때(아래 둘)는 **일정과 연결을 한 번에** 쓰고, 일정의 updatedAt 과 연결의 siteSyncedAt 을 같은 값으로
 * **직접** 적는다(@updatedAt 칸도 값을 주면 그 값이 들어간다).
 *
 * 왜: 둘을 따로 쓰다 두 번째가 실패하거나 그 사이 함수가 죽으면 updatedAt > siteSyncedAt 이 남는다. 다음 동기화는 그것을
 * "사이트에서 고쳤다" 로 보고 pushUpdate 로 구글에 되보내는데, 그 내용은 toGoogle(fromGoogle(g)) — 왕복에서 잃는 것이 있다
 * (제목 없음 → "(제목 없음)", 모르는 색 → 7번, 끝 없음 → 시작 + 1시간, 시간대 고정). **가족의 진짜 일정이 그렇게 덮어써진다.**
 * 그래서 "한 번 더 보낼 뿐 해가 없다" 가 아니다 — 어긋날 길을 아예 없앤다.
 *
 * 처음 맞추기의 잇기(link)도 같은 쪽이다 — 이을 때는 **구글 내용이 이긴다**(아래 linkTakingGoogle).
 *
 * 사이트 → 구글 쪽(pushNew·pushUpdate)은 일정을 쓰지 않는다. 연결 하나만 쓰고, siteSyncedAt 에는 **보내기 전에 읽은**
 * updatedAt 을 적는다 — 보내는 사이 사이트에서 또 고쳤으면 다음 동기화가 그것을 보낸다(나중 것을 잃지 않는다).
 *
 * **구글에 쓰기 전에는 그 일정을 다시 묻는다**(pushUpdate·deleteGoogleChecked). 연결된 단일 일정을 가족이 구글에서
 * "매주 반복" 으로 바꾸면 그 id 가 시리즈 **원본**이 된다 — 원본은 singleEvents 목록에 안 와서 우리 연결은 모르는 채 남고,
 * 그 id 로 PATCH 하면 시리즈 전체가 덮어써지고 DELETE 하면 시리즈가 통째로 사라진다. 다시 물어 반복·여러 날이면 쓰지 않는다.
 * 다시 묻기가 실패하면 쓰지 않는다(대기로 남긴다).
 */

/** 구글 일정을 사이트에 새로 만든다. 일정과 연결을 **한 문장**으로(중첩 쓰기) — 연결이 걸리면(유일키 등) 일정도 안 생긴다. */
async function createSiteFrom(g: GEvent, deps?: GcalDeps): Promise<void> {
  const { fields, readOnly } = fromGoogle(g);
  const stamp = writeTime(deps);
  await prisma.calendarEvent.create({
    data: {
      ...fields,
      source: "google",
      updatedAt: stamp,
      googleLink: {
        create: { googleEventId: g.id, googleUpdated: new Date(g.updated), siteSyncedAt: stamp, readOnly },
      },
    },
  });
}

/** 구글 내용을 사이트로 — 한 트랜잭션. 사이트에 못 보낸 변경이 있었어도 구글이 이겼으니 pendingPush 는 내린다. */
async function updateSiteFrom(linkId: string, eventId: string, g: GEvent, deps?: GcalDeps): Promise<void> {
  const { fields, readOnly } = fromGoogle(g);
  const stamp = writeTime(deps);
  await prisma.$transaction(async (tx) => {
    await tx.calendarEvent.update({ where: { id: eventId }, data: { ...fields, updatedAt: stamp } });
    await tx.googleEventLink.update({
      where: { id: linkId },
      data: { googleUpdated: new Date(g.updated), siteSyncedAt: stamp, readOnly, pendingPush: false },
    });
  });
}

/**
 * 처음 맞추기의 잇기 — 같은 날·같은 제목의 짝을 이으면서 **구글 내용을 사이트 일정에 쓴다**(한 트랜잭션).
 * 왜 구글 쪽인가: 사이트 내용을 그대로 두면 처음 사이트에서 고칠 때 사이트 내용 전체가 구글로 가서, 구글에 적힌 시각을 덮고
 * 메모·장소를 지운다(사이트에 없으면 null → ""). 가족이 실제로 쓰는 캘린더는 구글이라 그쪽을 남긴다. 구글에는 쓰지 않는다.
 */
async function linkTakingGoogle(eventId: string, g: GEvent, deps?: GcalDeps): Promise<void> {
  const { fields, readOnly } = fromGoogle(g);
  const stamp = writeTime(deps);
  await prisma.$transaction(async (tx) => {
    await tx.calendarEvent.update({ where: { id: eventId }, data: { ...fields, updatedAt: stamp } });
    await tx.googleEventLink.create({
      data: { eventId, googleEventId: g.id, googleUpdated: new Date(g.updated), siteSyncedAt: stamp, readOnly },
    });
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

/** 연결 한 줄 만들기 */
async function createLink(eventId: string, g: GEvent, siteSyncedAt: Date, googleUpdated: Date): Promise<void> {
  await prisma.googleEventLink.create({
    data: { eventId, googleEventId: g.id, googleUpdated, siteSyncedAt, readOnly: readOnlyOf(g) },
  });
}

/**
 * 다시 묻기의 404·410 을 "지워졌다" 로 믿어도 되는가. **같은 실행에서 이 캘린더를 읽은 적이 있을 때만**(동기화가 목록을
 * 끝까지 읽은 뒤, 방금 insert·409 를 받은 뒤). 구글은 공유가 풀리거나 캘린더가 지워져도 404 를 주고 getEvent 는 그 이유를
 * 버린다 — 증명 없이 404 를 "지워짐" 으로 치면 공유가 끊긴 날 사이트에서 고친 일정마다 사이트에서 지워진다.
 * 증명이 없으면(쓰기 훅) 404 는 **실패**다: 아무것도 지우지 않고 대기로 남긴다. 200 + cancelled 는 접근 자체가 증명이다.
 */
type Access = { accessProven: boolean };

/** 증명 없이 받은 404·410 — 실패로 던진다(부르는 쪽이 대기·묘비로 남긴다). 문구는 공유 안내(auth.ts 의 404 문구). */
function unprovenMissing(): GcalError {
  return new GcalError(404, "notFound");
}

/**
 * 구글 일정 하나를 지운다 — **다시 물어 평범한 하나짜리일 때만.** 반복(원본·회차)·여러 날이면 지우지 않는다(위 머리 주석).
 * 이미 없거나 취소됐으면 할 일이 없다. 다시 묻기가 실패하면 던진다(부르는 쪽은 아무것도 지우지 않은 채로 남는다).
 * 접근이 증명되지 않았는데 404 면 역시 던진다(위 Access).
 */
async function deleteIfPlain(
  cfg: GcalOn,
  googleEventId: string,
  deps: GcalDeps | undefined,
  { accessProven }: Access,
): Promise<"deleted" | "gone" | "readOnly"> {
  const cur = await getEvent(cfg, googleEventId, deps);
  if (!cur && !accessProven) throw unprovenMissing();
  if (!cur || cur.status === "cancelled") return "gone";
  if (readOnlyOf(cur)) return "readOnly";
  await deleteEvent(cfg, googleEventId, deps); // 404·410 = 이미 없음 = 성공
  return "deleted";
}

/**
 * 묘비 처리(동기화·지우기 훅이 같이 쓴다). 구글에서 지웠든, 이미 없었든, 반복·여러 날이 되어 **안 지웠든** 연결은 거둔다.
 * 안 지운 경우 사이트 일정은 이미 지워졌다 — 그 구글 일정은 연결이 없어졌으니 회차면 다음 동기화가 다시 가져온다
 * (사이트에서 반복 일정을 지우는 길은 없다). 원본이면 목록에 안 오므로 회차들이 그대로 보인다.
 */
async function settleTombstone(
  cfg: GcalOn,
  linkId: string,
  googleEventId: string,
  deps: GcalDeps | undefined,
  access: Access,
): Promise<void> {
  const done = await deleteIfPlain(cfg, googleEventId, deps, access);
  if (done === "readOnly") console.warn("[gcal] 반복·여러 날이 된 구글 일정이라 지우지 않고 연결만 거뒀어요");
  await prisma.googleEventLink.deleteMany({ where: { id: linkId } });
}

/**
 * 사이트 일정을 구글에 새로 만들고 잇는다. runSync 의 pushNew 와 만들기 훅이 같이 쓴다 — 둘이 겹칠 수 있다
 * (방금 만든 일정을 훅이 보내는 사이 다른 기기에서 화면을 열면 동기화도 그것을 "못 보낸 것" 으로 본다).
 *
 * 구글 id 를 googleIdFor 로 정해 보내므로 같은 사이트 일정의 구글 쌍둥이는 생기지 않는다:
 * - 409(그 id 가 이미 있음) = 지난번 만들기가 들어갔는데 응답을 못 받았거나, 다른 쪽이 방금 만들었다 → 그 일정을 읽어 잇는다.
 *   취소됨(또는 404·410)으로 오면 가족이 구글에서 지운 것이다 — **구글의 지우기가 이긴다**(스펙: cancelled 는 사이트 수정보다
 *   우선). 사이트 일정을 지운다. 같은 id 는 다시 쓸 수 없어서, 안 지우면 동기화마다 같은 실패를 되풀이한다.
 *   단 다시 묻기가 **성공했을 때만**이다 — getEvent 가 던지면(5xx·시간 초과·권한) 그 건만 실패로 두고 아무것도 안 지운다.
 * - 연결을 못 남겼는데 사이트 일정이 그대로면 구글 일정을 **거두지 않는다** — 다른 쪽이 이었다면 그게 바로 이 일정이고,
 *   아니면 다음 동기화가 목록에서 같은 id 를 보고 잇는다. 거두는 것은 그 사이 사이트 일정이 지워졌을 때뿐이다
 *   (그대로 두면 연결 없는 구글 일정이 되어 다음 동기화가 사이트로 되살린다).
 */
async function pushNewEvent(cfg: GcalOn, ev: CalendarEvent, deps?: GcalDeps): Promise<boolean> {
  if (await prisma.googleEventLink.findUnique({ where: { eventId: ev.id }, select: { id: true } })) return false;
  const id = googleIdFor(ev.id);

  let made: GEvent;
  let recovered = false;
  try {
    made = await insertEvent(cfg, { ...toGoogle(siteFields(ev)), id }, deps);
  } catch (e) {
    if (!(e instanceof GcalError) || e.status !== 409) throw e;
    const found = await getEvent(cfg, id, deps); // 던지면 그대로 실패 — 지우지 않는다
    if (!found || found.status === "cancelled") {
      // 방금 409 를 준 같은 캘린더라 접근은 확인됐다 — 여기서의 없음·취소됨은 정말 지운 것이다.
      await prisma.calendarEvent.deleteMany({ where: { id: ev.id } });
      return true;
    }
    made = found;
    recovered = true;
  }

  try {
    // 되찾은 것은 그 사이 어느 쪽이 고쳤는지 모른다 — 다음 동기화가 나중 것을 고르게(RECONCILE).
    if (recovered) await createLink(ev.id, made, RECONCILE, RECONCILE);
    else await createLink(ev.id, made, ev.updatedAt, new Date(made.updated));
  } catch (e) {
    const site = await prisma.calendarEvent
      .findUnique({ where: { id: ev.id }, select: { id: true } })
      .catch(() => ({ id: ev.id })); // 못 읽으면 "있다" 로 — 모르는 채로 진짜 캘린더의 일정을 지우지 않는다
    if (!site) {
      // 방금 이 캘린더에 만들었다(또는 409 를 받았다) — 접근은 증명됐다.
      await deleteIfPlain(cfg, made.id, deps, { accessProven: true }).catch((err) =>
        logFail("지워진 일정의 구글 일정 거두기", err),
      );
    } else if (
      await prisma.googleEventLink
        .findUnique({ where: { googleEventId: made.id }, select: { id: true } })
        .catch(() => null)
    ) {
      return false; // 다른 쪽이 먼저 이었다 — 바로 이 구글 일정으로. 할 일이 끝났다.
    }
    throw e;
  }
  return true;
}

/**
 * 사이트 내용을 구글로. siteSyncedAt 은 **보내기 전에 읽은** updatedAt — 보내는 사이에 누가 또 고쳤으면
 * 그 값이 더 크므로 다음 동기화가 다시 보낸다(나중 것을 잃지 않는다).
 *
 * 보내기 전에 다시 묻는다(던지면 그대로 실패 — 부르는 쪽이 pendingPush 로 남긴다):
 * - 반복(원본·회차)·여러 날이 됐으면 **보내지 않는다.** 연결을 readOnly 로 바꾸고 대기를 내린다 — 이제 사이트에서 고칠 수
 *   없는 일정이다(라우트가 409). googleUpdated 는 그대로 두어 다음 동기화가 구글 내용을 사이트로 가져오게 한다.
 * - 취소됐으면(200) 가족이 구글에서 지운 것이다 — **구글의 지우기가 이긴다**(처음 맞추기 409 와 같은 규칙). 사이트 일정과
 *   연결을 지운다. 404·410(없음)도 그렇게 치지만 **접근이 증명됐을 때만**(동기화 경로 — 위 Access). 쓰기 훅에서의 404 는
 *   공유가 풀린 것일 수 있어 실패로 던진다(일정·연결 그대로, pendingPush). 동기화 경로에서 안 지우면 창 밖의 보내기 대기
 *   연결은 동기화마다 404 실패를 되풀이한다(창 밖이라 다시 묻기도 안 온다).
 */
async function pushUpdate(
  cfg: GcalOn,
  link: { id: string; googleEventId: string },
  ev: CalendarEvent,
  deps: GcalDeps | undefined,
  { accessProven }: Access,
): Promise<"pushed" | "readOnly" | "gone"> {
  const cur = await getEvent(cfg, link.googleEventId, deps);
  if (!cur && !accessProven) throw unprovenMissing();
  if (!cur || cur.status === "cancelled") {
    await deleteSiteAndLink(link.id, ev.id);
    return "gone";
  }
  const shape = readOnlyOf(cur);
  if (shape) {
    await prisma.googleEventLink.update({ where: { id: link.id }, data: { readOnly: shape, pendingPush: false } });
    return "readOnly";
  }
  const res = await patchEvent(cfg, link.googleEventId, toGoogle(siteFields(ev)), deps);
  await prisma.googleEventLink.update({
    where: { id: link.id },
    data: { googleUpdated: new Date(res.updated), siteSyncedAt: ev.updatedAt, pendingPush: false, readOnly: readOnlyOf(res) },
  });
  return "pushed";
}

/** 못 보낸 변경 표시. readOnly 연결에는 세우지 않는다 — 반복 회차는 사이트에서 보내는 길이 없다. */
async function markPendingPush(linkId: string): Promise<void> {
  await prisma.googleEventLink
    .updateMany({ where: { id: linkId, readOnly: null }, data: { pendingPush: true } })
    .catch((e) => logFail("보내기 대기 표시", e));
}

/** planSync 의 액션 + 잃어버린 만들기 되찾기(아래 findLostInserts) */
type RunAction =
  | Action
  | { kind: "relink"; eventId: string; google: GEvent }
  /** readOnly 묘비 — planSync 는 지우지 않는다. 구글은 그대로 두고 연결만 거둔다(DB 만). */
  | { kind: "dropTombstone"; linkId: string };

interface RunCtx {
  cfg: GcalOn;
  deps?: GcalDeps;
  now: Date;
  window: { min: Date; max: Date };
  sites: Map<string, CalendarEvent>;
  links: Map<string, GoogleEventLink>;
}

/** 액션 하나를 실행한다. 무언가 바뀌었으면 true. 실패는 던진다(부르는 쪽이 그 건만 실패로 센다). */
async function execute(a: RunAction, ctx: RunCtx): Promise<boolean> {
  const { cfg, deps } = ctx;
  const siteOf = (id: string) => {
    const ev = ctx.sites.get(id);
    if (!ev) throw new Error("사이트 일정을 찾지 못했어요");
    return ev;
  };

  switch (a.kind) {
    case "createSite":
      await createSiteFrom(a.google, deps);
      return true;
    case "updateSite":
      await updateSiteFrom(a.linkId, a.eventId, a.google, deps);
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
      // 반복 시리즈 **원본**이 됐다(연결된 단일 일정을 구글에서 "반복" 으로 바꿨다). 회차들이 목록에서 따로 들어와 일정을
      // 이어서 보이므로 이 사본은 겹친다 — 사이트 사본과 연결만 지운다(DB 만, 구글은 그대로). 아래 일반 갈래로 가면
      // 원본 내용(첫 회차 날짜)으로 사이트를 고치거나, 사이트가 바뀌었으면 원본을 PATCH 해 시리즈 전체를 덮는다.
      if (g.recurrence?.length) {
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
    case "link":
      // 같은 날·같은 제목을 하나로 잇는다 — 내용은 구글 쪽으로(사이트 일정에 쓴다). 구글에는 쓰지 않는다.
      await linkTakingGoogle(siteOf(a.eventId).id, a.google, deps);
      return true;
    case "relink": {
      // 우리가 정한 id 로 구글에 있는데 연결이 없다 = 지난번 만들기의 응답을 못 받았다. 잇고, 내용은 다음 동기화가
      // 나중 것으로 맞춘다(RECONCILE).
      const site = siteOf(a.eventId);
      try {
        await createLink(site.id, a.google, RECONCILE, RECONCILE);
      } catch (e) {
        // pushNewEvent 와 같은 규칙: 그 사이 사이트 일정이 지워졌으면 그 pd… 일정(우리가 만든 것)만 거둔다 — 그대로 두면
        // 연결 없는 구글 일정이 되어 다음 동기화가 사이트로 되살린다. 못 읽으면 "있다" 로 치고 아무것도 안 지운다.
        const still = await prisma.calendarEvent
          .findUnique({ where: { id: site.id }, select: { id: true } })
          .catch(() => ({ id: site.id }));
        if (!still && a.google.id === googleIdFor(site.id)) {
          await deleteIfPlain(cfg, a.google.id, deps, { accessProven: true }).catch((err) =>
            logFail("지워진 일정의 구글 일정 거두기", err),
          );
        }
        throw e;
      }
      return true;
    }
    case "pushNew":
      return pushNewEvent(cfg, siteOf(a.eventId), deps);
    case "pushUpdate":
      // 이 실행이 목록을 끝까지 읽은 뒤다 — 캘린더 접근은 증명됐다.
      await pushUpdate(cfg, { id: a.linkId, googleEventId: a.googleEventId }, siteOf(a.eventId), deps, {
        accessProven: true,
      });
      return true;
    case "deleteGoogle":
      await settleTombstone(cfg, a.linkId, a.googleEventId, deps, { accessProven: true });
      return true;
    case "dropTombstone":
      await prisma.googleEventLink.deleteMany({ where: { id: a.linkId, pendingDelete: true } });
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

/**
 * 잃어버린 만들기: 연결 없는 사이트 일정의 googleIdFor 가 구글 목록에 연결 없이 있다. 응답을 못 받았을 뿐 구글에는
 * 들어간 것이다. 이것을 planSync 에 그대로 넘기면 구글 쪽은 createSite(사이트에 둘), 사이트 쪽은 pushNew 가 된다.
 * 그래서 계획 **전에** 짝을 지어 둘 다 계획에서 빼고 relink 로 잇는다. 취소된 것은 짝으로 치지 않는다.
 */
function findLostInserts(google: GEvent[], sites: CalendarEvent[], links: GoogleEventLink[]): Map<string, GEvent> {
  const linkedGoogle = new Set(links.map((l) => l.googleEventId));
  const linkedSite = new Set(links.flatMap((l) => (l.eventId ? [l.eventId] : [])));
  const byId = new Map(google.map((g) => [g.id, g]));
  const lost = new Map<string, GEvent>();
  for (const s of sites) {
    if (linkedSite.has(s.id)) continue;
    const g = byId.get(googleIdFor(s.id));
    if (g && g.status !== "cancelled" && !linkedGoogle.has(g.id)) lost.set(s.id, g);
  }
  return lost;
}

/** 한 실행의 액션 — runSync 와 미리보기가 **같은** 함수로 세운다(그래서 미리보기 숫자 = 실제 숫자). */
function planRun(
  data: Awaited<ReturnType<typeof gather>>,
  now: Date,
  initial: boolean,
  initialDoneAt: Date | null,
): RunAction[] {
  const sites = [...data.sites.values()];
  const links = [...data.links.values()];
  const lost = findLostInserts(data.google, sites, links);
  const lostGoogle = new Set([...lost.values()].map((g) => g.id));
  const relinks: RunAction[] = [...lost].map(([eventId, google]) => ({ kind: "relink", eventId, google }));
  // planSync 가 지우지 않는 묘비(readOnly 표시가 있거나 지금 구글 일정이 반복·여러 날) — 같은 조건으로 골라 연결만 거둔다.
  // 안 거두면 영영 남아 "보내기 대기" 에 잡히고, 그 회차는 연결된 것으로 보여 다시 들어오지도 않는다.
  const googleById = new Map(data.google.map((g) => [g.id, g]));
  const drops: RunAction[] = links
    .filter((l) => {
      if (!l.pendingDelete) return false;
      const current = googleById.get(l.googleEventId);
      return l.readOnly != null || (current !== undefined && readOnlyOf(current) !== null);
    })
    .map((l) => ({ kind: "dropTombstone", linkId: l.id }));
  return [
    ...relinks,
    ...drops,
    ...planSync({
      now,
      window: data.window,
      complete: true, // listWindow 는 끝까지 읽었거나 던졌다 — 여기까지 왔으면 끝까지 읽은 것
      google: data.google.filter((g) => !lostGoogle.has(g.id)),
      site: sites.filter((s) => !lost.has(s.id)).map(planSite),
      links,
      initialDoneAt,
      initial,
    }),
  ];
}

export async function runSync(opts: { force?: boolean; initial?: boolean; deps?: GcalDeps } = {}): Promise<SyncOutcome> {
  const cfg = gcalConfig();
  if (!cfg.enabled) return { ran: false, reason: "disabled" };
  const { deps } = opts;
  // 이 실행의 "지금" 은 하나 — 창·잠금·initialDoneAt 이 모두 이 값에서 나온다.
  const now = new Date(deps?.now?.() ?? Date.now());
  /** 우리가 잡은 잠금의 값. 풀 때 이 값일 때만 푼다 — 느린 실행이 남의 잠금을 풀지 않게. */
  let heldUntil: Date | null = null;

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

    // 잠금 전에 한 번 거른다 — 돌 일이 없는 요청(처음 맞추기 전·60초 안)이 잠금을 쓰지 않게.
    const early = gate(state, opts, now);
    if (early) return early;

    // 잠금은 조건부 updateMany 의 count 로 잡는다 — 두 요청이 같이 와도 한쪽만 1 을 받는다.
    const until = new Date(now.getTime() + LOCK_MS);
    const got = await prisma.googleSyncState.updateMany({
      where: { id: STATE_ID, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
      data: { lockedUntil: until },
    });
    if (got.count === 0) return { ran: false, reason: "locked" };
    heldUntil = until;

    // 잠금을 잡은 **뒤에** 다시 읽는다. 앞에서 읽은 값은 낡았을 수 있다 — 두 사람이 [처음 맞추기]를 거의 같이 누르면
    // 둘 다 initialDoneAt 이 빈 것을 보고, 앞사람이 끝내고 잠금을 푼 뒤 뒷사람이 처음 맞추기를 한 번 더 한다.
    const fresh = await prisma.googleSyncState.findUnique({ where: { id: STATE_ID } });
    if (!fresh || fresh.calendarId !== cfg.calendarId) return { ran: false, reason: "not_started" };
    const late = gate(fresh, opts, now);
    if (late) return late;

    return await syncLocked(cfg, now, Boolean(opts.initial) && !fresh.initialDoneAt, fresh.initialDoneAt, deps);
  } catch (e) {
    logFail("동기화", e);
    return { ran: true, changed: 0, error: safeMessage(e) };
  } finally {
    if (heldUntil) {
      // 아직 우리 잠금일 때만 푼다. 실행이 잠금보다 길어져 다른 요청이 새로 잡았다면 그 잠금은 그쪽 것이다.
      await prisma.googleSyncState
        .updateMany({ where: { id: STATE_ID, lockedUntil: heldUntil }, data: { lockedUntil: null } })
        .catch((e) => logFail("잠금 풀기", e));
    }
  }
}

/**
 * 돌지 않을 이유. 처음 맞추기는 initialDoneAt 이 비었을 때만 — 이미 마쳤으면 initial 이라도 평소 동기화로 돈다
 * (그 뒤로 연결 없이 남은 일정, 곧 처음 맞추기 전의 지난 일정을 이제 와서 구글로 보내지 않는다).
 */
function gate(
  state: GoogleSyncState,
  opts: { force?: boolean; initial?: boolean },
  now: Date,
): { ran: false; reason: "not_started" | "throttled" } | null {
  const initial = Boolean(opts.initial) && !state.initialDoneAt;
  if (!initial && !state.initialDoneAt) return { ran: false, reason: "not_started" };
  if (!opts.force && state.lastSyncAt && now.getTime() - state.lastSyncAt.getTime() < THROTTLE_MS) {
    return { ran: false, reason: "throttled" };
  }
  return null;
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
    const actions = planRun(data, now, initial, initialDoneAt);

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
): Promise<GcalPreview> {
  const cfg = gcalConfig();
  if (!cfg.enabled) return { error: OFF_ERROR };
  try {
    const now = new Date(deps?.now?.() ?? Date.now());
    const state = await prisma.googleSyncState.findUnique({ where: { id: STATE_ID } });
    // 캘린더가 바뀌었으면 실제 실행은 연결을 다 지우고 시작한다 — 미리보기도 연결 없이 센다.
    const calendarChanged = state?.calendarId != null && state.calendarId !== cfg.calendarId;
    const data = await gather(cfg, now, deps, { ignoreLinks: calendarChanged });
    const actions = planRun(data, now, true, null);
    const count = (...k: RunAction["kind"][]) => actions.filter((a) => k.includes(a.kind)).length;
    return { toPush: count("pushNew"), toLink: count("link", "relink"), toImport: count("createSite") };
  } catch (e) {
    logFail("미리보기", e);
    return { error: safeMessage(e) };
  }
}

// ─────────────────────────────────────────────
// 사이트에서 쓸 때 (/api/events, 스펙 §6)
// ─────────────────────────────────────────────

type ReadOnlyKind = "recurring" | "multiday";
const isReadOnly = (r: string | null | undefined): r is ReadOnlyKind => r === "recurring" || r === "multiday";

/** beforeSiteDelete → afterSiteDelete 로 넘기는 묘비 표 */
export interface DeleteTicket {
  linkId: string;
  googleEventId: string;
}

/** 사이트에서 고치지 못하는 일정인가 — DB 만 본다(꺼져 있어도 반복 회차는 반복 회차다). 라우트가 409 를 낸다. */
export async function readOnlyReason(eventId: string): Promise<ReadOnlyKind | null> {
  const link = await prisma.googleEventLink.findUnique({ where: { eventId }, select: { readOnly: true } });
  const r = link?.readOnly;
  return isReadOnly(r) ? r : null;
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
    // 쓰기 훅은 이 캘린더를 읽은 적이 없다 — 404 를 "지워짐" 으로 믿지 않는다(실패 → pendingPush).
    await pushUpdate(cfg, link, ev, deps, { accessProven: false });
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
export async function beforeSiteDelete(eventId: string): Promise<DeleteTicket | { readOnly: ReadOnlyKind } | null> {
  const link = await prisma.googleEventLink.findUnique({ where: { eventId }, select: { id: true, googleEventId: true } });
  if (!link) return null;
  // update 가 아니라 updateMany — 읽은 뒤 그 사이 동기화가 연결을 지웠으면 update 는 P2025 를 던져 DELETE 가 500 이 된다
  // (화면은 낙관적 삭제를 되돌린다: AGENTS.md DELETE 규칙). `readOnly: null` 조건은 라우트의 readOnly 확인과 여기 사이에
  // 동기화가 연결을 readOnly 로 바꾼 경우를 막는다 — 그러면 묘비를 세우지 않고 라우트가 409 를 낸다.
  const marked = await prisma.googleEventLink.updateMany({
    where: { id: link.id, readOnly: null },
    data: { pendingDelete: true, pendingPush: false },
  });
  if (marked.count === 0) {
    const now = await prisma.googleEventLink.findUnique({ where: { id: link.id }, select: { readOnly: true } });
    return now && isReadOnly(now.readOnly) ? { readOnly: now.readOnly } : null; // 없으면 세울 묘비도 없다
  }
  return { linkId: link.id, googleEventId: link.googleEventId };
}

/**
 * 지우기 뒤. 구글에서 지우고 연결을 없앤다. 실패하면 묘비로 남는다(다음 동기화가 지운다).
 * beforeSiteDelete 의 결과를 그대로 받는다 — readOnly 였으면 라우트가 이미 409 로 끝냈어야 하지만, 와도 아무것도 안 한다.
 */
export async function afterSiteDelete(
  link: DeleteTicket | { readOnly: ReadOnlyKind } | null,
  deps?: GcalDeps,
): Promise<void> {
  if (!link || "readOnly" in link) return;
  try {
    const cfg = await startedConfig();
    if (!cfg) return; // 묘비는 beforeSiteDelete 가 이미 세웠다
    // 다시 물어 평범한 일정일 때만 지운다 — 반복·여러 날이 됐으면 구글은 그대로 두고 연결만 거둔다(settleTombstone).
    // 404 면 묘비를 남긴다 — 다음 동기화가 목록을 끝까지 읽은 뒤(접근 증명) 처리한다.
    await settleTombstone(cfg, link.linkId, link.googleEventId, deps, { accessProven: false });
  } catch (e) {
    logFail("지운 일정 구글에서 지우기", e);
    // FK(SetNull)가 eventId 를 비웠겠지만 거기에 기대지 않는다 — 묘비 모양을 여기서 확실히.
    await prisma.googleEventLink
      .updateMany({ where: { id: link.linkId }, data: { eventId: null, pendingDelete: true } })
      .catch((err) => logFail("묘비 남기기", err));
  }
}
