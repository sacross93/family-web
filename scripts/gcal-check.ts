// 진짜 구글 캘린더로 동기화 왕복을 한 번 밟는다.  npm run gcal:check
//
// **가족의 진짜 캘린더를 건드린다.** 시험용 캘린더를 따로 두지 않기로 했다(사용자 결정 2026-10-16, 스펙 §2·§9).
// 그래서 이 파일의 절반은 안전장치다. 순서대로:
// 1. 로컬 DB 에서만 돈다 — DATABASE_URL 의 호스트가 localhost·127.0.0.1 이 아니면 멈춘다.
// 2. 구글 설정(환경변수 두 개)이 꺼져 있으면 멈춘다.
// 3. **연결 없는 로컬 일정**이 하나라도 있으면 멈춘다. 그대로 처음 맞추기를 하면 시드의 견본 일정("치과 정기검진" 등)이
//    진짜 캘린더로 간다.
// 4. 못 보낸 변경(묘비·보내기 대기·연결된 채 사이트에서 고친 것)이 있으면 멈춘다 — 동기화가 그것을 진짜 일정에 그대로 쓴다.
// 5. 처음 맞추기 전이면 미리보기를 먼저 보고 **보낼 것 0개**일 때만 처음 맞추기를 한다.
// 여기까지는 아무것도 바꾸지 않는다. 멈추면 그대로 끝난다(정리도 돌지 않는다 — 정리할 것이 없다).
//
// 그다음부터는 만드는 일정이 전부 제목에 `[포동시험]`, 날짜는 약 300일 뒤(알림이 울릴 일이 없게)다.
// 끝나면(실패해도, Ctrl+C 를 눌러도) `finally` 에서:
// - **로컬 동기화 상태를 처음으로 되돌린다** — GoogleSyncState 를 맨 먼저 지운다. 이것 하나로 엔진은 "처음 맞추기 전" 이 되어
//   이 뒤로 로컬에서 화면을 열거나 포동이에게 묻거나 ui:flows 를 돌려도 진짜 캘린더에 아무것도 쓰지 않는다.
// - 구글에서 `[포동시험]` 을 전부 지운다(목록에서 찾은 것 + 이번에 만든 id).
// - 로컬의 `[포동시험]`·구글에서 가져온 일정(source="google")·연결을 지운다. 가져온 일정을 남기면 연결 없는 로컬 일정이 되어
//   다음 처음 맞추기가 구글로 되돌려 보낸다(쌍둥이). 모두 **로컬 DB 만** — 구글의 진짜 일정에는 손대지 않는다.
// - 구글 목록을 다시 읽어 `[포동시험]` 이 **하나도 없는지** 본다. 남았거나 확인을 못 하면 크게 실패한다(종료 코드 1).
//
// 출력은 단계별 ✓/✗ 와 숫자뿐 — 진짜 일정의 제목·메모, 키·토큰, DB 주소, 캘린더 ID 는 찍지 않는다.
// 엔진 함수를 직접 부른다(서버 불필요). 사이트 쪽 순서는 /api/events 라우트가 부르는 순서 그대로다.
// 지운 시험 일정은 구글 휴지통에 "취소됨" 으로 한동안 남고 목록(showDeleted)에도 그렇게 온다 — 셀 때 뺀다(새는 것이 아니다).

// 이 import 가 `.env` 를 읽는다 — lib/prisma 가 import 될 때 PrismaClient 생성자가 dotenv 로 process.env 에 올린다
// (agent-smoke·agent-prompt 가 기대는 길과 같다). 그래서 DATABASE_URL·GOOGLE_* 는 main() 안에서(import 뒤에) 읽는다.
import { prisma } from "../lib/prisma";
import { gcalConfig, type GcalOn } from "../lib/gcal/config";
import { GcalError, deleteEvent, getEvent, insertEvent, listWindow, patchEvent, type GEvent } from "../lib/gcal/client";
import { seoulDate, seoulMidnight } from "../lib/gcal/map";
import {
  afterSiteCreate,
  afterSiteDelete,
  afterSiteUpdate,
  beforeSiteDelete,
  gcalStatus,
  googleIdFor,
  previewInitial,
  runSync,
  syncWindow,
} from "../lib/gcal/sync";

const MARK = "[포동시험]";
/** 이번 실행의 꼬리 — 지난 실행이 (강제로 꺼져) 남긴 쌍둥이가 있어도 이번 것만 집게 */
const TAG = `${MARK} ${Date.now().toString(36).slice(-5)}`;
const NOTE = "포동 사이트의 구글 캘린더 동기화 확인용 일정이에요. 곧 저절로 지워져요 — 남아 있으면 지워 주세요.";
const DAY = 86_400_000;
/** 약 300일 뒤 — 알림이 울릴 일이 없고, 동기화 창(365일 뒤까지)에는 들어간다 */
const AHEAD_DAYS = 300;
/** 잠금(sync.ts LOCK_MS 60초)을 넉넉히 넘게 기다린다 — 열어 둔 사이트 탭이 동기화 중일 수 있다 */
const LOCK_WAIT_TRIES = 25;
const LOCK_WAIT_MS = 3_000;

// ─────────────────────────────────────────────
// 작은 도우미
// ─────────────────────────────────────────────

let failed = 0;
function check(label: string, ok: boolean, detail = ""): boolean {
  if (!ok) failed += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

/** 이 단계가 안 되면 뒤 단계는 볼 것이 없다 — 정리(finally)로 바로 간다. (asserts: 넘긴 조건으로 타입도 좁혀진다) */
class Halt extends Error {}
function need(label: string, ok: boolean, detail = ""): asserts ok {
  if (!check(label, ok, detail)) throw new Halt(label);
}
function fail(label: string, detail: string): never {
  check(label, false, detail);
  throw new Halt(label);
}

/** 시작 전 멈춤 — 아무것도 바꾸지 않았다 */
function refuse(...lines: string[]): void {
  failed += 1;
  console.log(`  ✗ ${lines[0]}`);
  for (const l of lines.slice(1)) console.log(`    ${l}`);
  console.log("\n멈췄어요 — 구글에도 로컬에도 아무것도 바꾸지 않았어요.");
}

/**
 * 밖에 찍어도 되는 문구만. GcalError 는 상태·짧은 코드로만 만들어져 있고(auth.ts), 그 밖의 예외는 이름과
 * 프리즈마 코드만 — 프리즈마 오류 문구에는 값(진짜 일정 제목 등)이 실릴 수 있다.
 */
function safe(e: unknown): string {
  if (e instanceof GcalError) return e.message;
  const code = (e as { code?: unknown } | null)?.code;
  const tag = typeof code === "string" && /^[A-Za-z0-9_]{1,20}$/.test(code) ? ` · ${code}` : "";
  return `${e instanceof Error ? e.name : typeof e}${tag}`;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 살아 있는 시험 일정인가. 지운 것은 목록(showDeleted)에 "cancelled" 로 남는다 — 그것까지 세면 정리가 영영 안 끝난다. */
const liveTest = (g: GEvent) => g.status !== "cancelled" && (g.summary ?? "").includes(MARK);
/** 구글에서 지워졌는가 — 막 지운 일정을 다시 물으면 404 대신 200 + "cancelled" 가 올 때가 많다(sync.ts 도 둘 다 지움으로 본다) */
const goneFromGoogle = (g: GEvent | null) => g === null || g.status === "cancelled";

/** 서울 기준 오늘에서 n일 뒤의 날짜 글자 (한국은 서머타임이 없어 하루 = 24시간) */
function dayAhead(n: number): string {
  return seoulDate(new Date(seoulMidnight(seoulDate(new Date())).getTime() + n * DAY));
}

/** DATABASE_URL 이 이 컴퓨터의 DB 인가. 주소는 찍지 않는다(비밀번호가 들어 있을 수 있다). */
function isLocalDb(url: string): boolean {
  try {
    const u = new URL(url);
    // `?host=` 는 소켓 경로(/tmp …)만 받는다 — 서버 이름이 오면 주소의 호스트 대신 그쪽으로 붙는다.
    const hostParam = u.searchParams.get("host");
    if (hostParam && !hostParam.startsWith("/")) return false;
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// Ctrl+C — 바로 끄지 않고 정리까지 마친다
// ─────────────────────────────────────────────

let interrupted = false;
/** 쓰기를 시작할 때만 건다 — 그 전(멈춤 장치)에는 Ctrl+C 가 평소처럼 바로 끈다(바꾼 것이 없다). */
function catchInterrupt(): void {
  process.on("SIGINT", () => {
    if (interrupted) return;
    interrupted = true;
    console.log("\n  … 멈출게요 — 만든 시험 일정을 지우고 끝냅니다. 잠시 기다려 주세요(강제로 끄면 [포동시험] 이 남을 수 있어요).");
  });
}
function halt(): void {
  if (interrupted) fail("멈춤", "Ctrl+C");
}

// ─────────────────────────────────────────────
// 동기화 한 번
// ─────────────────────────────────────────────

/**
 * runSync 한 번(force — 60초 제한을 건너뛴다). 다른 곳(열어 둔 사이트 탭)이 잠금을 잡았으면 풀릴 때까지 기다렸다 다시.
 * 오류가 있으면 ✗ 로 세지만 멈추지는 않는다 — 시험과 상관없는 진짜 일정 한 건이 실패했을 수도 있고, 시험 일정이
 * 맞춰졌는지는 바로 뒤의 확인이 따로 본다. 처음 맞추기(`initial`)만은 오류면 멈춘다(initialDoneAt 이 안 적혀 쓰기 훅이 멈춰 있다).
 */
async function sync(label: string, initial = false): Promise<void> {
  for (let i = 0; ; i++) {
    const out = await runSync({ force: true, initial });
    if (out.ran) {
      if (initial) need(label, out.error === null, out.error ?? `바뀐 것 ${out.changed}개`);
      else check(label, out.error === null, out.error ?? `바뀐 것 ${out.changed}개`);
      return;
    }
    if (out.reason === "not_started") fail(label, "처음 맞추기 전이에요 — 쓰기 반영이 멈춰 있어요");
    if (out.reason === "disabled") fail(label, "구글 캘린더 동기화가 꺼져 있어요");
    if (out.reason !== "locked") fail(label, `돌지 않았어요 (${out.reason})`);
    if (i >= LOCK_WAIT_TRIES) fail(label, "잠금이 풀리지 않았어요 — 사이트를 연 브라우저 탭을 닫고 다시 돌려 주세요");
    if (i === 0) console.log("  · 다른 곳에서 동기화 중 — 잠금이 풀리길 기다려요");
    halt();
    await sleep(LOCK_WAIT_MS);
  }
}

/** 구글 목록이 방금 쓴 것을 조금 늦게 보여 줄 때가 있다 — 동기화 + 확인을 몇 번까지 다시 해 본다. */
async function eventually<T>(label: string, probe: () => Promise<T | null>): Promise<T | null> {
  for (let i = 0; i < 4; i++) {
    if (i > 0) await sleep(2_000);
    halt();
    await sync(label);
    const v = await probe();
    if (v !== null) return v;
  }
  return null;
}

// ─────────────────────────────────────────────
// 멈춤 장치 — 아무것도 바꾸지 않는다
// ─────────────────────────────────────────────

/**
 * 동기화가 돌자마자 진짜 캘린더에 쓸 것 — 묘비(구글에서 지우기)·보내기 대기·연결된 채 사이트에서 고친 것(구글로 덮어씀).
 * 반복 회차·여러 날(readOnly)은 사이트에서 보내는 길이 없어 세지 않는다.
 * 이 스크립트의 정리 뒤(또는 db:seed 뒤) 새로 돌리면 연결이 아예 없어 늘 0 이다. 0 이 아니면 지난 실행이 강제로 꺼졌거나 로컬에서 처음 맞추기를 한 것이다.
 */
async function pendingWrites(): Promise<{ deletes: number; pushes: number }> {
  const links = await prisma.googleEventLink.findMany({
    select: { pendingDelete: true, pendingPush: true, readOnly: true, siteSyncedAt: true, event: { select: { updatedAt: true } } },
  });
  const deletes = links.filter((l) => l.pendingDelete).length;
  const pushes = links.filter(
    (l) => !l.pendingDelete && !l.readOnly && (l.pendingPush || (l.event !== null && l.event.updatedAt > l.siteSyncedAt)),
  ).length;
  return { deletes, pushes };
}

/** 통과하면 처음 맞추기가 필요한지 돌려준다. 멈췄으면 null. */
async function preflight(): Promise<{ cfg: GcalOn; needInitial: boolean } | null> {
  // ① 로컬 DB
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    refuse("DATABASE_URL 이 없어요 — .env 가 읽히지 않았어요");
    return null;
  }
  if (!isLocalDb(dbUrl)) {
    refuse("로컬 DB(localhost·127.0.0.1)에서만 돌아요 — DATABASE_URL 이 다른 곳을 가리켜요");
    return null;
  }
  check("로컬 DB", true);

  // ② 구글 설정
  const cfg = gcalConfig();
  if (!cfg.enabled) {
    refuse(
      cfg.reason === "missing"
        ? "구글 캘린더 동기화가 꺼져 있어요 — GOOGLE_SERVICE_ACCOUNT_JSON·GOOGLE_CALENDAR_ID 가 없어요"
        : "구글 캘린더 동기화가 꺼져 있어요 — 서비스 계정 키 형식을 읽지 못했어요",
    );
    return null;
  }
  check("구글 설정 켜짐", true);

  // ③ 연결 없는 로컬 일정 — 처음 맞추기(또는 평소 동기화)가 진짜 캘린더로 보낼 수 있는 것
  const [unlinked, unlinkedGoogle] = await Promise.all([
    prisma.calendarEvent.count({ where: { googleLink: { is: null } } }),
    prisma.calendarEvent.count({ where: { googleLink: { is: null }, source: "google" } }),
  ]);
  if (unlinked > 0) {
    refuse(
      `연결 없는 로컬 일정이 ${unlinked}개 있어요(그중 구글에서 왔던 것 ${unlinkedGoogle}개).`,
      "로컬 견본 일정을 먼저 비워 주세요(그대로 두면 진짜 캘린더로 갑니다).",
      "로컬 DB 의 CalendarEvent 중 구글 연결(GoogleEventLink)이 없는 것을 지우면 돼요 — 로컬 DB 인지 꼭 확인하고.",
    );
    return null;
  }
  check("연결 없는 로컬 일정 0개", true);

  // ④ 못 보낸 변경
  const pending = await pendingWrites();
  if (pending.deletes + pending.pushes > 0) {
    refuse(
      `진짜 캘린더에 보낼 변경이 남아 있어요 — 지우기 ${pending.deletes}개 · 고치기 ${pending.pushes}개.`,
      "이 스크립트가 동기화를 돌리면 그대로 진짜 일정에 쓰여요. 지난 실행이 강제로 꺼진 것이라면",
      "로컬 DB 의 GoogleEventLink·GoogleSyncState 와 연결 없는 일정을 비우고 다시 돌려 주세요(로컬만).",
    );
    return null;
  }
  check("못 보낸 변경 0개", true);

  // ⑤ 처음 맞추기 전이면 미리보기 — 보낼 것이 0개여야 한다
  const status = await gcalStatus(); // 캘린더가 바뀌었으면 initialDoneAt 을 비운 것으로 본다
  if (status.initialDoneAt) {
    console.log("  · 처음 맞추기는 이미 되어 있어요 — 건너뜁니다");
    return { cfg, needInitial: false };
  }
  const p = await previewInitial();
  if ("error" in p) {
    refuse(`처음 맞추기 미리보기를 못 했어요 — ${p.error}`);
    return null;
  }
  console.log(`  · 처음 맞추기 미리보기: 보낼 ${p.toPush} · 이을 ${p.toLink} · 가져올 ${p.toImport}`);
  if (p.toPush !== 0) {
    refuse(`처음 맞추기가 구글로 보낼 일정이 ${p.toPush}개예요 — 0개일 때만 돌아요(로컬 일정이 진짜 캘린더로 가요).`);
    return null;
  }
  check("처음 맞추기가 보낼 것 0개", true);
  return { cfg, needInitial: true };
}

// ─────────────────────────────────────────────
// 왕복
// ─────────────────────────────────────────────

/** `made` 에는 이번에 구글에 만든(만들려 한) id 를 **부르기 전에** 넣는다 — 응답을 못 받아도 정리가 지운다. */
async function steps(cfg: GcalOn, made: Set<string>): Promise<void> {
  const d300 = dayAhead(AHEAD_DAYS);
  const d301 = dayAhead(AHEAD_DAYS + 1);
  const d302 = dayAhead(AHEAD_DAYS + 2);

  // ── 1. 사이트에서 만들기 → 구글에 생김 ──
  console.log("\n1. 사이트에서 만들기");
  const start = new Date(`${d300}T10:00:00+09:00`);
  const site = await prisma.calendarEvent.create({
    data: {
      title: `${TAG} 사이트`,
      description: NOTE,
      start,
      end: new Date(`${d300}T11:00:00+09:00`),
      allDay: false,
      color: "mint",
    },
  });
  const siteGoogleId = googleIdFor(site.id);
  made.add(siteGoogleId);
  await afterSiteCreate(site.id); // 라우트(POST /api/events)와 같은 순서 — 실패는 훅이 삼킨다, 그래서 아래에서 직접 본다
  const link1 = await prisma.googleEventLink.findUnique({ where: { eventId: site.id } });
  need("연결이 생김", link1 !== null);
  check("구글 id 가 사이트 id 에서 나옴(googleIdFor)", link1.googleEventId === siteGoogleId);
  const g1 = await getEvent(cfg, siteGoogleId);
  need("구글에 있음", g1 !== null && g1.status !== "cancelled");
  const g1Start = g1.start?.dateTime;
  check(
    "구글의 제목·시각이 같음",
    g1.summary === site.title && g1Start !== undefined && new Date(g1Start).getTime() === start.getTime(),
  );
  halt();

  // ── 2. 사이트에서 고치기 → 구글 제목 ──
  console.log("\n2. 사이트에서 고치기");
  const title2 = `${TAG} 사이트 고침`;
  await prisma.calendarEvent.update({ where: { id: site.id }, data: { title: title2 } });
  await afterSiteUpdate(site.id);
  const g2 = await getEvent(cfg, siteGoogleId);
  check("구글 제목이 바뀜", g2?.summary === title2);
  const link2 = await prisma.googleEventLink.findUnique({ where: { eventId: site.id } });
  check("보내기 대기 없음", link2 !== null && !link2.pendingPush);
  halt();

  // ── 3. 구글에서 만들기(종일) → 사이트에 생김 ──
  console.log("\n3. 구글에서 만들기(종일)");
  const title3 = `${TAG} 구글`;
  // 끝 날짜는 다음 날(구글 규칙). 하루짜리로 둔다 — 이틀이면 readOnly(multiday)로 들어온다.
  const gIns = await insertEvent(cfg, { summary: title3, description: NOTE, start: { date: d301 }, end: { date: d302 } });
  made.add(gIns.id);
  const local3 = await eventually("동기화", async () => {
    const l = await prisma.googleEventLink.findUnique({ where: { googleEventId: gIns.id }, include: { event: true } });
    return l?.event ?? null;
  });
  need("사이트에 생김(연결과 함께)", local3 !== null);
  check("종일 · 날짜가 맞음", local3.allDay && seoulDate(local3.start) === d301);
  check("제목이 같고 출처는 구글", local3.title === title3 && local3.source === "google");
  const localId = local3.id;
  halt();

  // ── 4. 구글에서 고치기 → 사이트 반영, 구글에서 지우기 → 사이트에서 사라짐 ──
  console.log("\n4. 구글에서 고치기 · 지우기");
  const title4 = `${TAG} 구글 고침`;
  await patchEvent(cfg, gIns.id, { summary: title4 });
  const local4 = await eventually("동기화", async () => {
    const ev = await prisma.calendarEvent.findUnique({ where: { id: localId } });
    return ev?.title === title4 ? ev : null;
  });
  check("구글에서 고친 제목이 사이트에 옴", local4 !== null);
  check("종일 · 날짜 그대로", local4?.allDay === true && seoulDate(local4.start) === d301);
  halt();

  await deleteEvent(cfg, gIns.id);
  const gone4 = await eventually("동기화", async () => {
    const [ev, link] = await Promise.all([
      prisma.calendarEvent.findUnique({ where: { id: localId }, select: { id: true } }),
      prisma.googleEventLink.findUnique({ where: { googleEventId: gIns.id }, select: { id: true } }),
    ]);
    return ev === null && link === null ? true : null;
  });
  check("구글에서 지운 것이 사이트에서도 사라짐(연결도)", gone4 === true);
  halt();

  // ── 5. 사이트에서 지우기 → 구글에서 사라짐, 같은 삭제 한 번 더 ──
  console.log("\n5. 사이트에서 지우기");
  // 라우트(DELETE /api/events/[id])와 같은 순서: 묘비 → deleteMany → 구글에서 지우기
  const tomb = await beforeSiteDelete(site.id);
  check("지우기 전에 묘비를 세움", tomb?.googleEventId === siteGoogleId);
  await prisma.calendarEvent.deleteMany({ where: { id: site.id } });
  await afterSiteDelete(tomb);
  check("구글에서도 지워짐", goneFromGoogle(await getEvent(cfg, siteGoogleId)));
  check("연결(묘비)도 없어짐", (await prisma.googleEventLink.count({ where: { googleEventId: siteGoogleId } })) === 0);

  let again = false;
  try {
    const tomb2 = await beforeSiteDelete(site.id);
    const del2 = await prisma.calendarEvent.deleteMany({ where: { id: site.id } });
    await afterSiteDelete(tomb2);
    await deleteEvent(cfg, siteGoogleId); // 구글 쪽 두 번째 지우기도 — 404·410 은 성공
    again = tomb2 === null && del2.count === 0;
  } catch (e) {
    console.log(`    (${safe(e)})`);
  }
  check("같은 삭제를 한 번 더 — 오류 없음", again);

  // 지운 두 일정은 구글 목록에 "취소됨" 으로 남아 있다 — 다시 맞춰도 사이트에 되살아나면 안 된다.
  await sync("동기화");
  check("다시 맞춰도 되살아나지 않음", (await prisma.calendarEvent.count({ where: { title: { contains: TAG } } })) === 0);
}

// ─────────────────────────────────────────────
// 정리 — 실패해도 돈다
// ─────────────────────────────────────────────

/** 다 깨끗하면 true. 구글에 [포동시험] 이 남았거나 확인하지 못했으면 크게 알린다. */
async function cleanup(cfg: GcalOn, made: Set<string>): Promise<boolean> {
  console.log("\n정리 — 구글의 [포동시험] 지우기 · 로컬 동기화 상태를 처음으로");
  let ok = true;
  const report = (label: string, good: boolean, detail = "") => {
    if (!good) ok = false;
    console.log(`  ${good ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  };

  // ① 상태부터 — 이것 하나로 로컬은 "처음 맞추기 전" 이 된다. 뒤 단계가 실패해도 이 뒤로 엔진은 진짜 캘린더에 쓰지 않는다.
  try {
    const s = await prisma.googleSyncState.deleteMany({});
    report("로컬 동기화 상태 지움(처음 맞추기 전으로)", true, `${s.count}줄`);
  } catch (e) {
    report("로컬 동기화 상태 지움(처음 맞추기 전으로)", false, safe(e));
  }

  // ② 구글 — 목록에서 찾은 살아 있는 [포동시험] + 이번에 만든 id(목록이 실패해도). 지우기는 두 번 해도 같다(404·410 = 성공).
  const win = syncWindow(new Date());
  const ids = new Set(made);
  let found = 0;
  let listErr: string | null = null;
  try {
    for (const g of await listWindow(cfg, win.min, win.max)) {
      if (liveTest(g)) {
        ids.add(g.id);
        found += 1;
      }
    }
  } catch (e) {
    listErr = safe(e);
  }
  let delFail = 0;
  for (const id of ids) {
    try {
      await deleteEvent(cfg, id);
    } catch {
      delFail += 1;
    }
  }
  report(
    "구글에서 [포동시험] 지움",
    listErr === null && delFail === 0,
    listErr ?? `남아 있던 것 ${found}개${delFail ? ` · 못 지운 것 ${delFail}개` : ""}`,
  );

  // ③ 로컬 — 시험 일정·구글에서 가져온 일정·연결을 한 번에(로컬 DB 만)
  try {
    const [tests, imported, links] = await prisma.$transaction([
      prisma.calendarEvent.deleteMany({ where: { title: { contains: MARK } } }),
      prisma.calendarEvent.deleteMany({ where: { source: "google" } }),
      prisma.googleEventLink.deleteMany({}),
    ]);
    report("로컬 시험 일정 · 가져온 일정 · 연결 지움", true, `시험 ${tests.count} · 가져온 ${imported.count} · 연결 ${links.count}`);
  } catch (e) {
    report("로컬 시험 일정 · 가져온 일정 · 연결 지움", false, safe(e));
  }

  // ④ 마지막 확인 — 구글에 살아 있는 [포동시험] 0개. 남았으면 한 번 더 지우고 다시 본다.
  let left = -1; // -1 = 확인하지 못함
  for (let i = 0; i < 4 && left !== 0; i++) {
    if (i > 0) await sleep(2_000);
    try {
      const live = (await listWindow(cfg, win.min, win.max)).filter(liveTest);
      // 이번에 만든 id 는 목록과 상관없이 하나씩 다시 묻는다(창 밖으로 옮겨졌어도 잡게)
      for (const id of made) {
        if (live.some((g) => g.id === id)) continue;
        const g = await getEvent(cfg, id);
        if (g && g.status !== "cancelled") live.push(g);
      }
      left = live.length;
      for (const g of live) await deleteEvent(cfg, g.id).catch(() => undefined);
    } catch {
      left = -1;
    }
  }
  report("구글에 [포동시험] 0개", left === 0, left === -1 ? "확인하지 못했어요" : `${left}개`);

  // ⑤ 로컬 확인 — 처음 맞추기 전·연결 0·가져온 일정 0·시험 일정 0. (열린 탭의 동기화가 상태 줄을 새로 만들었어도
  //   initialDoneAt 이 비어 있으면 처음 맞추기 전이다.)
  try {
    const [started, links, imported, tests] = await Promise.all([
      prisma.googleSyncState.count({ where: { initialDoneAt: { not: null } } }),
      prisma.googleEventLink.count(),
      prisma.calendarEvent.count({ where: { source: "google" } }),
      prisma.calendarEvent.count({ where: { title: { contains: MARK } } }),
    ]);
    report(
      "로컬은 처음 맞추기 전",
      started + links + imported + tests === 0,
      `처음 맞추기 ${started} · 연결 ${links} · 가져온 ${imported} · 시험 ${tests}`,
    );
  } catch (e) {
    report("로컬은 처음 맞추기 전", false, safe(e));
  }

  if (left !== 0) {
    console.log("\n  ✗✗✗ 구글 캘린더에 [포동시험] 일정이 남아 있을 수 있어요" + (left > 0 ? ` (${left}개)` : " (확인하지 못했어요)") + ".");
    console.log("      진짜 캘린더예요 — 구글 캘린더에서 \"[포동시험]\" 을 검색해 직접 지워 주세요.");
    console.log("      (npm run gcal:check 를 다시 돌려 멈춤 장치를 통과하면 끝에서 지웁니다.)");
  }
  return ok;
}

// ─────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`구글 캘린더 왕복 확인 — **진짜 캘린더**에 ${MARK} 일정을 만들고 끝에 지웁니다\n`);
  console.log("멈춤 장치");
  const ready = await preflight();
  if (!ready) return;
  const { cfg, needInitial } = ready;

  // 여기서부터 쓴다 — 무슨 일이 있어도 정리한다.
  catchInterrupt();
  const made = new Set<string>();
  let clean = false;
  try {
    if (needInitial) {
      console.log("\n0. 처음 맞추기");
      await sync("처음 맞추기(구글 일정 가져오기)", true);
      const st = await prisma.googleSyncState.findUnique({ where: { id: "main" }, select: { initialDoneAt: true } });
      need("처음 맞추기를 마친 것으로 적힘", Boolean(st?.initialDoneAt));
      halt();
    }
    await steps(cfg, made);
  } catch (e) {
    if (!(e instanceof Halt)) check("예상하지 못한 오류", false, safe(e));
  } finally {
    clean = await cleanup(cfg, made);
  }

  console.log(
    failed === 0 && clean
      ? "\n✓ 전부 통과 — 구글에 [포동시험] 0개, 로컬은 처음 맞추기 전으로 돌아갔어요."
      : `\n✗ 실패 ${failed}개${clean ? "" : " · 정리가 다 되지 않았어요(위 ✗ 확인)"}.`,
  );
  if (!clean) process.exitCode = 1;
}

main()
  .catch((e) => {
    // 여기까지 오는 것은 멈춤 장치 도중의 예외(DB 연결 등)뿐이다 — 쓰기 전이라 정리할 것이 없다.
    console.log(`  ✗ ${safe(e)}`);
    failed += 1;
  })
  .finally(async () => {
    if (failed > 0) process.exitCode = 1;
    await prisma.$disconnect();
  });
