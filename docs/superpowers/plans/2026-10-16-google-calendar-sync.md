# 구글 캘린더 양방향 동기화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사이트 "캘린더" 일정(CalendarEvent)과 사용자의 구글 캘린더를 서비스 계정으로 양방향 동기화한다.

**Architecture:** 순수 함수(`map`·`planSync`)가 판단하고, 얇은 REST 클라이언트(fetch + jose 서명 JWT)가 구글과 말하고, `sync.ts` 가 DB·잠금·실행을 맡는다. 연결 정보는 새 표 두 개(`GoogleEventLink`·`GoogleSyncState`)에, `CalendarEvent` 열은 그대로. 처음 맞추기는 관리자가 미리보기를 보고 누른다.

**Tech Stack:** Next.js 16 App Router · Prisma 6 · jose(RS256) · fetch · vitest · Playwright 스크립트.

**Spec:** `docs/superpowers/specs/2026-10-16-google-calendar-sync-design.md` — 모든 작업자는 스펙과 이 계획을 함께 읽는다.

## Global Constraints

- `AGENTS.md` 필독(Next 16: route params 는 Promise, `cookies()` 비동기). 포동이 쪽(T2 의 에이전트 훅)은 `PODONGI.md` 도.
- 환경변수: `GOOGLE_SERVICE_ACCOUNT_JSON`(키 JSON 전체), `GOOGLE_CALENDAR_ID`. 없거나 해석 실패 → **동기화 꺼짐, 500 금지**.
- 범위(scope): `https://www.googleapis.com/auth/calendar.events` 하나. `googleapis` 패키지 쓰지 않는다(fetch + jose).
- **키·access token·private_key 를 로그·응답·화면·오류 문구에 절대 넣지 않는다.** 오류는 HTTP 상태와 구글 오류 코드(짧은 영숫자)만.
- 창: **오늘 기준 90일 전 ~ 365일 뒤.** 목록은 `singleEvents=true&showDeleted=true`, 250개씩.
- **목록을 한 페이지라도 못 읽으면 계획을 세우지 않는다**(부분 목록으로 지우기 금지).
- **처음 맞추기(`initialDoneAt`)는 관리자가 누른다.** 그 전에는 자동 동기화·쓰기 반영 모두 아무것도 하지 않는다.
- `readOnly`("recurring" | "multiday") 연결은 사이트에서 PATCH/DELETE 409: "구글에서 반복되는(또는 여러 날) 일정이라 구글 캘린더에서 고쳐 주세요."
- 꼬리표 `G` 는 **연결 존재**로 판단. `CalendarEvent.source` 는 출처(local|google)만.
- 날짜 글자(종일 일정)는 **Asia/Seoul** 기준으로 만든다(서버 TZ 에 기대지 않음).
- 구글 호출은 요청당 **5초 제한**. 사이트 쓰기는 구글 실패와 상관없이 성공한다(나중에 다시 보냄).
- DELETE 는 `deleteMany`. 색은 `palette()`. 문구 한국어 존댓말·간결.
- `ensure.sql` 은 `CREATE … IF NOT EXISTS` 만, FK 는 CREATE TABLE 안에, 이름은 Prisma 와 같게.
- 작업자: 자기 브랜치(`gcal-sync`)에 커밋. **dev 서버·db push·ui:flows·진짜 구글 호출 금지**(리드가 한다). 시험은 가짜 fetch 로.
- 끝낼 때: `npx tsc --noEmit` 0 · `npm run lint` 0 · `npx vitest run --exclude lib/agent/auth.test.ts --exclude lib/agent/chat-store.test.ts` 통과.

## Review Focus

1. **부분 목록**(2쪽째에서 5xx·시간 초과) → 사이트 일정이 하나도 지워지면 안 된다. → T1 `planSync` 시험(`complete:false` → 지우기 0) + T2 `runSync` 시험(목록 실패 → 계획 안 세움, `lastError` 기록).
2. **종일 일정 날짜 경계** — 서버 TZ 가 UTC 여도 10/20 종일 일정이 구글에 10/20 로 가고 돌아와도 10/20 이어야 한다. → T1 `map` 시험(`TZ=UTC` 와 `TZ=Asia/Seoul` 두 번 같은 결과).
3. **반복 회차를 사이트에서 고치기/지우기**(화면이든 포동이든) → 409, 구글에 아무 요청도 안 간다. → T2 라우트 시험 + T1 `planSync` 가 readOnly 연결에 push 액션을 만들지 않음.
4. **양쪽에서 같은 일정을 고침** → 나중 시각이 이긴다(같으면 구글 우선). → T1 `planSync` 시험.
5. **처음 맞추기 전 화면 열기** → 구글에 아무 쓰기도 없음(로컬 견본 일정 보호). → T2 `runSync` 시험(`initialDoneAt=null` → `not_started`, 클라이언트 호출 0).

---

## File Structure

| 파일 | 책임 | 작업 |
|---|---|---|
| `prisma/schema.prisma`, `prisma/ensure.sql` | `GoogleEventLink`·`GoogleSyncState`, `CalendarEvent.googleLink` 관계 | T1 |
| `lib/gcal/config.ts` (+test) | 환경변수 읽기·키 해석 → 켜짐/꺼짐 | T1 |
| `lib/gcal/auth.ts` (+test) | JWT 서명 → access token, 메모리 캐시 | T1 |
| `lib/gcal/client.ts` (+test) | list(완전/예외)·get·insert·patch·delete, 5초 제한, 오류 정리 | T1 |
| `lib/gcal/map.ts` (+test) | 사이트 ↔ 구글 변환, Asia/Seoul 날짜, 색, readOnly 판정, 같은 날·같은 제목 | T1 |
| `lib/gcal/plan.ts` (+test) | `planSync` 순수 판단 | T1 |
| `lib/gcal/sync.ts` (+test) | `runSync`·`previewInitial`·쓰기 훅·`readOnlyReason`·상태 | T2 |
| `app/api/google/sync/route.ts`, `status/route.ts`, `initial/route.ts` | 트리거·상태·처음 맞추기 | T2 |
| `app/api/events/route.ts`, `[id]/route.ts` | 쓰기 훅·409 | T2 |
| `app/api/agent/route.ts` | 턴 시작 시 동기화(3초 상한) | T2 |
| `components/google-sync-trigger.tsx` | 화면 연 뒤 동기화 → 바뀌면 refresh | T3 |
| `app/page.tsx`, `app/calendar/page.tsx`, `calendar-client.tsx` | 트리거 장착, `G`·readOnly 표시 | T3 |
| `app/admin/google-calendar-card.tsx`, `app/admin/admin-client.tsx` | 관리자 카드 | T3 |
| `app/todos/todos-client.tsx` | "구글 캘린더에도 저장" 숨김 | T3 |
| `scripts/gcal-check.ts`, `package.json` | 진짜 캘린더 왕복 확인(로컬 전용) | T4 |
| `AGENTS.md`, `DEPLOY.md`, `REQUIREMENTS.md`, `lib/google-calendar.ts` | 문서·옛 스텁 정리 | T4 |

순서: T1 → (리드 L1: db push + ensure 대조) → T2 → T3 → T4 → (리드 L2: 진짜 캘린더 확인·감사·배포).

---

### Task 1: 바탕 — 표 · 설정 · 인증 · 클라이언트 · 변환 · 계획

**Files:** Create `lib/gcal/{config,auth,client,map,plan}.ts` + 같은 이름 `.test.ts`. Modify `prisma/schema.prisma`, `prisma/ensure.sql`.

**Interfaces — Produces (뒤 작업이 이 이름 그대로 쓴다):**

```ts
// lib/gcal/config.ts
export type GcalConfig =
  | { enabled: true; calendarId: string; clientEmail: string; privateKey: string }
  | { enabled: false; reason: "missing" | "bad_key" };
export function gcalConfig(env?: NodeJS.ProcessEnv): GcalConfig;   // 매번 읽는다(캐시 없음 — 시험·운영 모두 단순)

// lib/gcal/auth.ts
export interface GcalDeps { fetch?: typeof fetch; now?: () => number }
export async function getAccessToken(cfg: Extract<GcalConfig,{enabled:true}>, deps?: GcalDeps): Promise<string>;
export function _resetTokenCache(): void;   // 시험용

// lib/gcal/client.ts
export interface GTime { date?: string; dateTime?: string; timeZone?: string }
export interface GEvent {
  id: string; status: "confirmed" | "tentative" | "cancelled"; updated: string;
  summary?: string; description?: string; location?: string; colorId?: string;
  start?: GTime; end?: GTime; recurringEventId?: string;
}
export type GEventBody = Pick<GEvent, "summary" | "description" | "location" | "colorId" | "start" | "end">;
export class GcalError extends Error { status: number; code: string | null }   // message 는 한국어 짧은 문구, 비밀 없음
export async function listWindow(cfg, min: Date, max: Date, deps?): Promise<GEvent[]>; // 모든 페이지를 읽거나 GcalError 를 던진다
export async function getEvent(cfg, id: string, deps?): Promise<GEvent | null>;        // 404/410 → null
export async function insertEvent(cfg, body: GEventBody, deps?): Promise<GEvent>;
export async function patchEvent(cfg, id: string, body: GEventBody, deps?): Promise<GEvent>;
export async function deleteEvent(cfg, id: string, deps?): Promise<void>;              // 404/410 → 성공

// lib/gcal/map.ts
export interface SiteFields { title: string; description: string | null; location: string | null;
  start: Date; end: Date | null; allDay: boolean; color: string }
export type ReadOnly = "recurring" | "multiday" | null;
export function seoulDate(d: Date): string;           // "yyyy-MM-dd" in Asia/Seoul
export function seoulMidnight(ymd: string): Date;     // 그 날 00:00 KST 의 절대 시각
export function toGoogle(f: SiteFields): GEventBody;
export function fromGoogle(g: GEvent): { fields: SiteFields; readOnly: ReadOnly };
export function sameDaySameTitle(site: { start: Date; title: string }, g: GEvent): boolean;

// lib/gcal/plan.ts
export interface PlanSite { id: string; createdAt: Date; updatedAt: Date; source: string; start: Date; title: string }
export interface PlanLink { id: string; eventId: string | null; googleEventId: string; googleUpdated: Date;
  siteSyncedAt: Date; readOnly: string | null; pendingPush: boolean; pendingDelete: boolean }
export interface PlanInput { now: Date; window: { min: Date; max: Date }; complete: boolean; google: GEvent[];
  site: PlanSite[]; links: PlanLink[]; initialDoneAt: Date | null; initial: boolean }
export type Action =
  | { kind: "createSite"; google: GEvent }
  | { kind: "updateSite"; linkId: string; eventId: string; google: GEvent }
  | { kind: "deleteSite"; linkId: string; eventId: string }
  | { kind: "recheck"; linkId: string; eventId: string; googleEventId: string }
  | { kind: "link"; eventId: string; google: GEvent }
  | { kind: "pushNew"; eventId: string }
  | { kind: "pushUpdate"; linkId: string; eventId: string; googleEventId: string }
  | { kind: "deleteGoogle"; linkId: string; googleEventId: string };
export function planSync(input: PlanInput): Action[];
```

- [ ] **Step 1: 스키마**(스펙 §3 그대로, `initialDoneAt DateTime?`) + `CalendarEvent` 에 `googleLink GoogleEventLink?` 관계 필드. `npx prisma format && npx prisma validate && npx prisma generate`. `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` 에서 두 표의 DDL 을 복사해 `ensure.sql` 끝에 `CREATE TABLE IF NOT EXISTS`·`CREATE (UNIQUE) INDEX IF NOT EXISTS` 로, FK(`GoogleEventLink_eventId_fkey … ON DELETE SET NULL ON UPDATE CASCADE`)는 CREATE TABLE 안에. 머리 주석(왜·날짜). `grep -nE "^\s*(DROP|ALTER|DELETE|TRUNCATE|UPDATE|INSERT)\b" prisma/ensure.sql` → 없음.

- [ ] **Step 2: 시험 먼저** — 각 `.test.ts` 를 쓰고 `npx vitest run lib/gcal` 로 실패 확인. 반드시 들어갈 경우:
  - config: 둘 다 없음 → `missing`; JSON 아님/`private_key` 없음/PEM 아님 → `bad_key`; 정상 → enabled + `\n` 이 실제 개행인 키(Vercel 은 개행 그대로, 일부 도구는 `\\n` 글자 — 둘 다 받는다).
  - auth: 테스트 안에서 `generateKeyPair("RS256")` 로 만든 키로 서명된 assertion 의 클레임(iss=clientEmail, aud=`https://oauth2.googleapis.com/token`, scope, exp-iat=3600)을 `jwtVerify` 로 확인; 가짜 fetch 가 토큰을 주면 두 번째 호출은 fetch 를 안 부른다(캐시); 만료 1분 전이면 다시 받는다; 토큰 응답 실패 → `GcalError`(message 에 키·assertion 없음).
  - client: 2쪽 페이지를 끝까지 이어 붙인다; 2쪽째 500 → 던진다(부분 결과 반환 금지); 5초 넘으면 던진다(가짜 fetch 가 AbortSignal 을 존중); get 404 → null; delete 410 → 성공; 오류 메시지에 `Bearer`·토큰 문자열 없음.
  - map: 시간 일정 왕복(KST 10:00~11:00 → dateTime + timeZone Asia/Seoul → 돌아와 같은 절대 시각); 끝 없는 사이트 일정 → 구글 끝 = 시작+1시간; 종일 10/20 → `{date:"2026-10-20"}`/`{date:"2026-10-21"}` → 돌아와 10/20 KST 자정 — **`process.env.TZ="UTC"` 와 `"Asia/Seoul"` 에서 각각** 같은 결과(시험 안에서 TZ 를 바꾼 뒤 `new Date` 계산이 영향받지 않는지); 여러 날 종일(10/20~10/23) → readOnly multiday, start 10/20; `recurringEventId` → readOnly recurring; 색 왕복(rose↔"4" 등 스펙 표), 모르는 colorId → 사이트 기본 `"sky"`; `sameDaySameTitle` 은 공백 앞뒤 무시·대소문자 그대로·KST 날짜 비교.
  - plan: 스펙 §5 의 모든 갈래 — 연결 없는 구글 → createSite(취소된 건 제외); 구글만 바뀜 → updateSite; 사이트만 바뀜(readOnly 아님) → pushUpdate; 둘 다 바뀜 → 나중 시각 승(같으면 구글); `cancelled` → deleteSite; **창 안 연결이 목록에 없음 + complete → recheck(지우지 않음)**; **complete=false → deleteSite·recheck 0개**; readOnly 연결은 pushUpdate 를 절대 만들지 않음; pendingPush → pushUpdate; pendingDelete(eventId null) → deleteGoogle; initial=true → 오늘 이후·연결 없는 사이트 일정 중 같은 날·같은 제목이 있으면 link, 없으면 pushNew, 지난 일정은 아무것도; initial=false → `createdAt >= initialDoneAt` 이고 `source="local"`·연결 없는 사이트 일정만 pushNew; 창 밖 연결은 손대지 않음; 같은 구글 일정이 둘 이상의 사이트 일정과 매칭되지 않음(한 번 쓰이면 끝).

- [ ] **Step 3: 구현** — 위 인터페이스대로. 구현 메모:
  - token URL `https://oauth2.googleapis.com/token`, body `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=…`. 캐시는 모듈 변수 `{ token, exp }`.
  - Calendar base `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events`. list 쿼리 `singleEvents=true&showDeleted=true&maxResults=250&timeMin&timeMax&pageToken`. patch 는 PATCH, insert 는 POST, delete 는 DELETE.
  - 오류: `GcalError(status, code)` — code 는 구글 `error.errors[0].reason` 또는 `error.status` 를 `/^[A-Za-z0-9_]{1,40}$/` 로 거른 것. message 예: "구글 캘린더 요청이 실패했어요 (403 · forbidden)". 403/404 면 "캘린더를 열 수 없어요 — 서비스 계정에 '일정 변경'으로 공유됐는지 확인해 주세요".
  - `seoulDate` 는 `Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"})`. `seoulMidnight(ymd)` = `new Date(\`${ymd}T00:00:00+09:00\`)`.
  - 각 파일 머리에 왜를 한국어로(이 저장소 말투).

- [ ] **Step 4:** `npx vitest run lib/gcal` 통과, 게이트 3종 통과, 커밋.

---

### Lead L1 (리드): 로컬 db push(`--accept-data-loss` 불필요 — 새 표만) · 운영 흉내 DB 에서 `ensure.sql` 두 번 + `migrate diff` 새 표 0줄.

---

### Task 2: 엔진 · 라우트 · 쓰기 훅 · 포동이 훅

**Files:** Create `lib/gcal/sync.ts`(+test), `app/api/google/sync/route.ts`, `app/api/google/status/route.ts`, `app/api/google/initial/route.ts`. Modify `app/api/events/route.ts`, `app/api/events/[id]/route.ts`, `app/api/agent/route.ts`.

**Interfaces:**
- Consumes: T1 전부.
- Produces:
```ts
// lib/gcal/sync.ts
export type SyncOutcome =
  | { ran: false; reason: "disabled" | "not_started" | "throttled" | "locked" }
  | { ran: true; changed: number; error: string | null };
export async function runSync(opts?: { force?: boolean; initial?: boolean; deps?: GcalDeps }): Promise<SyncOutcome>;
export interface GcalStatus { config: "on" | "missing" | "bad_key"; calendarId: string | null; initialDoneAt: string | null;
  lastSyncAt: string | null; lastError: string | null; linked: number; pending: number }
export async function gcalStatus(): Promise<GcalStatus>;
export async function previewInitial(deps?: GcalDeps): Promise<{ toPush: number; toLink: number; toImport: number } | { error: string }>;
export async function readOnlyReason(eventId: string): Promise<"recurring" | "multiday" | null>;
export async function afterSiteCreate(eventId: string, deps?: GcalDeps): Promise<void>;   // 실패 삼킴
export async function afterSiteUpdate(eventId: string, deps?: GcalDeps): Promise<void>;   // 실패 → pendingPush
export async function beforeSiteDelete(eventId: string): Promise<{ linkId: string; googleEventId: string } | null>;
export async function afterSiteDelete(link: { linkId: string; googleEventId: string } | null, deps?: GcalDeps): Promise<void>; // 실패 → 묘비
```

- [ ] **Step 1: 시험 먼저**(`lib/gcal/sync.test.ts`, prisma 는 `resources.test.ts` 처럼 가짜, 구글은 가짜 fetch):
  - 꺼짐 → `{ran:false,reason:"disabled"}`, fetch 0회.
  - `initialDoneAt=null` 이고 `initial` 아님 → `not_started`, fetch 0회. 쓰기 훅 3종도 fetch 0회.
  - 60초 안 재실행 → `throttled`(force 면 실행). 잠금 중 → `locked`.
  - 목록 2쪽째 실패 → 사이트 일정 삭제 0, `lastError` 기록, 잠금 해제.
  - initial: 미리보기 숫자 = 실제 실행의 push/link/import 수. 실행 후 `initialDoneAt` 기록.
  - recheck: get → null → 사이트 삭제; get → 살아 있음 → 사이트 갱신.
  - 실행 중 한 건 실패(patch 500) → 그 연결 `pendingPush=true`, 나머지는 진행, `changed` 는 성공한 수.
  - 쓰기 훅: create → insert + 연결(siteSyncedAt=event.updatedAt, googleUpdated=응답 updated); update 실패 → pendingPush; delete 실패 → 묘비(eventId null, pendingDelete).
  - 결과·로그에 토큰/키 없음.
- [ ] **Step 2: 구현** — 잠금은 `GoogleSyncState` 단일 행 `updateMany({ where:{ id:"main", OR:[{lockedUntil:null},{lockedUntil:{lt:now}}] }, data:{ lockedUntil: now+30s } })` 의 count 로 잡는다(경쟁 안전). 행이 없으면 먼저 upsert. `finally` 에서 lockedUntil=null. 대상 캘린더 바뀜(state.calendarId ≠ cfg.calendarId) → 연결 전부 삭제 + initialDoneAt=null + calendarId 갱신 → `not_started`.
  - 사이트 쓰기는 `prisma.calendarEvent` 직접(라우트를 다시 부르지 않는다 — 훅이 돌면 안 되므로). `source:"google"` 로 만든다.
- [ ] **Step 3: 라우트**
  - `POST /api/google/sync` — 로그인 사용자(proxy 가 지킴). body `{force?}` 의 force 는 관리자만. `runSync` 결과를 그대로(200). 예외는 잡아서 `{ran:true,changed:0,error:"…"}`.
  - `GET /api/google/status` — 관리자만(403 "관리자만 볼 수 있어요."). `gcalStatus()` + `initialDoneAt` 이 비었고 켜져 있으면 `previewInitial()` 도 함께.
  - `POST /api/google/initial` — 관리자만. `runSync({ initial:true, force:true })`.
  - `/api/events` POST: 저장 후 `await afterSiteCreate(id)` (5초 상한은 client 가 지킨다).
  - `/api/events/[id]` PATCH·DELETE: 먼저 `readOnlyReason(id)` → 있으면 409(전역 문구). PATCH 저장 후 `afterSiteUpdate`. DELETE: `const link = await beforeSiteDelete(id)` → `deleteMany` → `afterSiteDelete(link)` → 200(두 번 불러도 200).
  - `app/api/agent/route.ts`: 대화 처리 앞에 `await Promise.race([runSync().catch(()=>null), new Promise(r=>setTimeout(r,3000))])` — 주석: 왜(포동이가 "내일 일정" 을 물을 때 구글에서 막 넣은 것도 보이게), 왜 3초 상한(대답을 붙잡지 않게). PODONGI.md 에 한 줄.
- [ ] **Step 4:** 라우트 시험(`app/api/events` 의 409 경로를 가짜 prisma 로 — 기존 라우트 시험 패턴이 없으면 `lib/gcal/sync.test.ts` 에서 `readOnlyReason` 과 훅 순서만 시험하고 리포트에 적는다). 게이트 3종, 커밋.

---

### Task 3: 화면

**Files:** Create `components/google-sync-trigger.tsx`, `app/admin/google-calendar-card.tsx`. Modify `app/page.tsx`, `app/calendar/page.tsx`, `app/calendar/calendar-client.tsx`, `app/admin/admin-client.tsx`, `app/admin/page.tsx`, `app/todos/todos-client.tsx`.

**Interfaces:** Consumes T2 의 `/api/google/sync`·`/api/google/status`·`/api/google/initial`·`GcalStatus`(type import 만), `CalendarEvent & { googleLink: { readOnly: string | null } | null }`.

- [ ] **Step 1: 트리거** — `"use client"`, 마운트 뒤 한 번 `POST /api/google/sync`(실패 조용히), `changed > 0` 이면 `router.refresh()`. 아무것도 그리지 않는다. 홈·캘린더 페이지에 넣는다. 같은 탭에서 2분 안에는 다시 부르지 않는다(sessionStorage, try/catch).
- [ ] **Step 2: 캘린더** — `page.tsx` 가 `include: { googleLink: { select: { readOnly: true } } }`. 클라이언트: 연결 있으면 제목 옆 작은 `Tag`(`G`, `aria-label="구글 캘린더와 연결됨"`, 색은 palette); readOnly 면 `…` 메뉴·고치기 버튼 대신 한 줄 "구글 캘린더에서 고쳐 주세요"(폰 목록·하루 모달·데스크톱 목록 모두). 409 응답이 오면 서버 문구를 토스트로.
- [ ] **Step 3: 관리자 카드** — `CollapsibleCard` "구글 캘린더". 상태(켜짐/키 없음/키 형식 오류, 캘린더 ID, 마지막 동기화, 마지막 오류, 연결 수, 보내기 대기 수). `initialDoneAt` 이 비었으면 미리보기 "구글로 보낼 일정 N개 · 하나로 이을 일정 M개 · 사이트로 가져올 일정 K개" + **[처음 맞추기]**(확인 창 `useConfirm`: "구글 캘린더에 N개를 만들어요. 계속할까요?"). 끝났으면 **[지금 맞추기]**. 꺼져 있으면 "Vercel 에 `GOOGLE_SERVICE_ACCOUNT_JSON`·`GOOGLE_CALENDAR_ID` 를 넣으면 켜져요." 상태는 서버(`app/admin/page.tsx`)에서 `gcalStatus().catch(()=>null)` 로 받고(미리보기는 카드가 열릴 때 `/api/google/status` 로), 390px 넘침 없음.
- [ ] **Step 4: 할 일** — "구글 캘린더에도 저장" 체크와 관련 토스트를 숨긴다(코드에서 그 UI 조각 제거, 서버 쪽 `syncToGoogle` 처리는 그대로 두되 주석: 이 선택지는 숨겼다).
- [ ] **Step 5:** 게이트 3종, 커밋. 리드가 390px 캡처.

---

### Task 4: 진짜 캘린더 확인 스크립트 · 문서

**Files:** Create `scripts/gcal-check.ts`. Modify `package.json`(`"gcal:check": "tsx scripts/gcal-check.ts"`), `AGENTS.md`, `DEPLOY.md`, `REQUIREMENTS.md`, `lib/google-calendar.ts`(스텁 머리 주석을 새 위치로 안내 — 할 일 동기화용으로 남김).

- [ ] **Step 1: 스크립트** — 스펙 §9. 안전장치: `DATABASE_URL` 이 localhost 가 아니면 멈춤; 시작 시 **연결 없는 로컬 일정이 있으면 멈추고** "로컬 견본 일정을 먼저 비워 주세요(그대로 두면 진짜 캘린더로 갑니다)" 안내(숫자만); `initialDoneAt` 이 비었으면 `runSync({initial:true,force:true})`(이때 보낼 것 0개여야 함을 확인). 단계(엔진 함수를 직접 부른다 — 서버 불필요):
  1. 사이트 쪽: `prisma.calendarEvent.create`(`[포동시험] 사이트`, 오늘+300일 10:00) → `afterSiteCreate` → `getEvent` 로 구글에 있음 확인.
  2. 제목 고치기 → `afterSiteUpdate` → 구글 제목 확인.
  3. 구글 쪽: `insertEvent`(`[포동시험] 구글`, 오늘+301일 종일) → `runSync({force:true})` → 로컬에 생김·종일·날짜 맞음 확인.
  4. 구글에서 patch(제목) → sync → 로컬 반영. 구글에서 delete → sync → 로컬 사라짐.
  5. 사이트 쪽 삭제: `beforeSiteDelete` → deleteMany → `afterSiteDelete` → 구글 `getEvent` null. 같은 삭제 한 번 더 → 오류 없음.
  6. **`finally`**: 구글 창에서 제목에 `[포동시험]` 이 든 것 전부 delete, 로컬도 전부 deleteMany → 마지막으로 `listWindow` 를 다시 읽어 `[포동시험]` 이 **0개인지** 확인하고 아니면 크게 실패.
  - 출력은 단계별 ✓/✗ 과 숫자만(일정 내용·키 출력 금지).
- [ ] **Step 2: 문서** — AGENTS.md "구글 캘린더" 절(서비스 계정·환경변수 두 개·처음 맞추기는 사람이·창·readOnly 409·부분 목록 금지·꼬리표는 연결로·하지 않는 것: cron·할 일·아기 표시), DEPLOY.md(Vercel 두 값, 캘린더 공유 "일정 변경", 키 줄바꿈 주의, 처음 맞추기 절차), REQUIREMENTS.md 의 옛 절을 스펙으로 안내.
- [ ] **Step 3:** 게이트 3종(스크립트는 실행하지 말 것 — 리드가 진짜 캘린더로 돌린다), 커밋.

---

### Lead L2 (리드): 진짜 캘린더 확인 · 감사 · 배포

- [ ] 로컬 견본 일정 비우기(로컬 DB 의 연결 없는 CalendarEvent deleteMany — 로컬만) → dev 서버 재시작 → `npm run gcal:check` 전부 ✓, 마지막 `[포동시험]` 0개.
- [ ] 화면: 관리자 카드(미리보기 숫자·처음 맞추기·지금 맞추기), 캘린더(G·반복 회차 readOnly 문구·409), 할 일 체크 숨김 — 390px 캡처. `ui:audit`, `ui:flows`(구글 단계 없음 — 캘린더 흐름이 여전히 통과하는지).
- [ ] 전체 리뷰(opus) → 수정 한 번 → main 합치기·배포 → 사용자에게 운영 관리자 카드에서 **[처음 맞추기]** 안내(미리보기 숫자 먼저 확인).
