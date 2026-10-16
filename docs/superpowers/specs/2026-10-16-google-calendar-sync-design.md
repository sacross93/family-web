# 사이트 캘린더 ↔ 구글 캘린더 양방향 동기화 설계

2026-10-16. 앞선 밑작업(REQUIREMENTS.md "구글 로그인 + 캘린더", `lib/google-calendar.ts` 스텁)은 **가족마다 구글로 로그인하는**
구조를 가정했지만 사이트는 아이디·비밀번호 로그인이다. 이 문서가 그 계획을 대신한다.

## 1. 목적과 정한 것

사이트 "캘린더"의 일정과 부부가 쓰는 구글 캘린더를 **양방향으로** 이어, 어느 쪽에 적어도 양쪽에 보이게 한다.

**사용자가 정한 것**
- 양방향.
- 대상 캘린더: 사용자의 기본 캘린더 `wlsdud1512@gmail.com`(개인 일정도 사이트에 보이는 것을 알고 골랐다).
- 반복 일정: 사이트에 날짜마다 **보이기만**, 고치기·지우기는 구글에서.
- 처음 연결: 사이트의 **오늘 이후** 일정만 구글로 보내고, 양쪽에 따로 적힌 **같은 날·같은 제목**은 하나로 잇는다. 지난 일정은 사이트에만.

**정해 둔 것(고칠 수 있음)**
- **서비스 계정**으로 붙는다(아래 §2). 사이트에 구글 로그인 화면은 없다.
- 오가는 것은 **사이트의 "일정"(CalendarEvent)만.** 아기 페이지의 주기 추정·병원 표시, 할 일, 기념일은 보내지 않는다.
  할 일 화면의 "구글 캘린더에도 저장" 선택지는 한 번도 동작한 적이 없어 **이번에 숨긴다**(나중에 할 일까지 넓힐 때 되살린다).
- 양쪽에서 같은 일정을 고치면 **나중에 고친 쪽**이 이긴다. 지우면 양쪽에서 지워진다.
- 구글에 못 보냈어도 사이트 저장은 성공으로 두고, 다음 동기화 때 다시 보낸다.

## 2. 붙는 방법 — 서비스 계정

- Google Cloud 프로젝트 `podong-511806` 의 서비스 계정 `id-146@podong-511806.iam.gserviceaccount.com` 에
  사용자가 캘린더를 **"일정 변경"** 권한으로 공유했다. 사이트는 그 계정의 키로 접근한다.
- 환경변수(Vercel Production, Sensitive): `GOOGLE_SERVICE_ACCOUNT_JSON`(키 파일 내용 전체), `GOOGLE_CALENDAR_ID`.
  둘 중 하나라도 없으면 **동기화는 꺼진 상태** — 사이트는 지금처럼 동작한다.
- 토큰: 키의 `private_key` 로 JWT(RS256, `jose` — 이미 의존성)를 서명해 `https://oauth2.googleapis.com/token`
  (`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`, scope `https://www.googleapis.com/auth/calendar.events`)에서
  1시간짜리 access token 을 받는다. 프로세스 메모리에 만료 1분 전까지 둔다. `googleapis` 패키지는 쓰지 않는다(fetch 로 충분).
- 키·토큰은 로그·응답·화면에 절대 내보내지 않는다. 오류 문구는 HTTP 상태와 구글 오류 코드(짧은 영숫자)만.
- 로컬 `.env` 에도 같은 키·같은 캘린더 ID 가 들어 있다(**사용자 결정 2026-10-16: 따로 시험용 캘린더를 만들지 않고 진짜 캘린더로 시험하고 지운다**).
  그래서 로컬 시험에는 두 가지 안전장치가 붙는다(§9): ① 시험 전 로컬 DB 의 **연결 안 된 견본 일정을 비운다** — 안 비우면 처음 합치기가
  시드의 가짜 일정("치과 정기검진" 등)을 진짜 캘린더로 보낸다. ② 시험 일정은 제목에 `[포동시험]` 을 달고 **약 300일 뒤** 날짜에 만들며
  끝에 반드시 지운다(알림이 울릴 일 없게).
- 실측(2026-10-16, 읽기만): 창 안 일정 55개 — 반복 회차 24·종일 36·여러 날 2, 캘린더 시간대 Asia/Seoul, 서비스 계정 권한 `owner`
  (공유 때 "변경 및 공유 관리"를 고른 것 — "일정 변경"이면 충분하다).

## 3. 데이터

`CalendarEvent` 표의 열은 **바꾸지 않는다**(운영 스키마는 `ensure.sql` CREATE 만 가능). 이미 있는 `source`("local" | "google")는
구글에서 들어온 일정 표시에 쓴다. 연결 정보는 새 표 둘에 둔다.

```prisma
/// 사이트 일정 ↔ 구글 일정 한 쌍. eventId 가 null 이면 "사이트에서 지웠는데 구글에서 아직 못 지운" 묘비.
model GoogleEventLink {
  id              String    @id @default(cuid())
  eventId         String?   @unique
  event           CalendarEvent? @relation(fields: [eventId], references: [id], onDelete: SetNull)
  googleEventId   String    @unique
  googleUpdated   DateTime  // 마지막으로 맞춘 때 구글 쪽 `updated`
  siteSyncedAt    DateTime  // 마지막으로 맞춘 때 사이트 쪽 `updatedAt`
  readOnly        String?   // "recurring" | "multiday" — 사이트에서 고치지 못하는 이유
  pendingPush     Boolean   @default(false) // 사이트 변경을 아직 못 보냄
  pendingDelete   Boolean   @default(false) // 사이트에서 지움 → 구글 삭제 대기(eventId null)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

/// 동기화 상태 싱글턴 id="main"
model GoogleSyncState {
  id          String    @id @default("main")
  calendarId  String?   // 마지막으로 맞춘 캘린더(바뀌면 연결을 처음부터 다시)
  initialDoneAt DateTime? // §5 처음 합치기를 마친 때. 이후에 만들어진 연결 없는 사이트 일정은 구글로 보낸다
  lastSyncAt  DateTime?
  lastError   String?   // 짧은 문구(비밀 없음)
  lockedUntil DateTime? // 동시에 두 번 돌지 않게
  updatedAt   DateTime  @updatedAt
}
```
`CalendarEvent` 에는 관계 필드(`googleLink GoogleEventLink?`)만 더한다(DB 열 아님). `ensure.sql` 에 두 표를 Prisma DDL 과 똑같이,
FK 는 CREATE TABLE 안에. 2026-10-16 아기 페이지 때와 같은 방식으로 운영 흉내 DB 에서 `migrate diff` 0줄을 확인한다.

## 4. 변환 규칙 (`lib/gcal/map.ts`, 순수 함수)

- **시간 일정**: 사이트 `start/end`(절대 시각) ↔ 구글 `start.dateTime/end.dateTime` + `timeZone: "Asia/Seoul"`.
  사이트 일정에 끝이 없으면 구글에는 시작 + 1시간으로 보낸다(구글은 끝이 필수). 돌아올 때 그 값은 사이트에 끝으로 들어온다.
- **종일 일정**: 사이트 `allDay` + `start`(그날 자정) ↔ 구글 `start.date`/`end.date`(끝은 **다음 날**, 구글 규칙).
  날짜 글자는 **Asia/Seoul 기준**으로 만든다(서버 시간대에 기대지 않음 — `koreaNow` 와 같은 이유).
- **여러 날 일정**(구글에서 이틀 이상 걸친 것): 사이트에는 시작일에 보이고 `readOnly="multiday"`(사이트 일정 양식이 하루짜리라
  고치면 잘린다).
- **반복 일정**: 목록을 `singleEvents=true` 로 받아 회차마다 사이트 일정 하나. `recurringEventId` 가 있으면 `readOnly="recurring"`.
- 제목·메모(description)·장소(location)는 그대로. 색: 사이트 팔레트 ↔ 구글 `colorId`
  (lavender↔1, mint↔2, rose↔4, butter↔5, peach↔6, sky↔7). 구글에서 색이 없거나 다른 번호면 사이트 기본색.
- 구글에서 `status: "cancelled"` 인 회차·일정은 지운 것으로 본다.

## 5. 동기화 (`lib/gcal/sync.ts`)

**창(window)**: 오늘 기준 **90일 전 ~ 365일 뒤**. 이 창 안만 구글에서 읽고, "구글에서 지워졌다"도 이 창 안에서만 판단한다.
창 밖으로 밀려난 연결은 건드리지 않는다.

**한 번의 동기화**
1. 잠금: `GoogleSyncState.lockedUntil` 이 지나지 않았으면 건너뛴다(30초 잠금). 마지막 동기화가 **60초 안**이면 건너뛴다(강제 제외).
2. 대상 캘린더가 바뀌었으면(`calendarId` 다름) 연결을 모두 지우고 처음 합치기부터.
3. 구글 창 목록을 전부 읽는다(`events.list`, `singleEvents=true`, `showDeleted=true`, 250개씩 페이지).
4. **처음 합치기**(`initialDoneAt` 이 비었을 때 한 번): 연결 없는 사이트 일정 중 **오늘 이후**를
   같은 날(Asia/Seoul)·같은 제목(앞뒤 공백 무시)인 구글 일정과 **이어 붙인다**. 남은 오늘 이후 사이트 일정은 구글에 만든다.
5. 계획을 세운다(순수 함수 `planSync` — 시험의 중심):
   - 구글에 있고 연결 없음 → 사이트에 만든다(`source="google"`).
   - 연결 있음:
     - 구글이 바뀜(`updated > link.googleUpdated`) & 사이트 안 바뀜(`event.updatedAt <= link.siteSyncedAt`) → 구글 내용을 사이트로.
     - 사이트가 바뀜 & 구글 안 바뀜 → 사이트 내용을 구글로(보통은 이미 §6 에서 보냈다 — 실패했던 것을 다시).
     - 둘 다 바뀜 → **나중 시각**이 이긴다.
     - 구글에서 지워짐(`cancelled` 또는 창 안인데 목록에 없음) → 사이트에서 지운다.
   - 묘비(`pendingDelete`) → 구글에서 지운다(404/410 이면 이미 없는 것 — 성공).
   - `pendingPush` → 구글로 보낸다.
6. 실행하고 연결의 `googleUpdated`·`siteSyncedAt` 을 갱신한다. 한 건 실패는 그 건만 `pending…` 으로 남기고 계속한다.
7. `lastSyncAt`, `lastError`(없으면 null)를 적고 잠금을 푼다. 결과 `{ changed: number }`.

**언제 돈다**
- 사이트를 열 때: **홈·캘린더 화면**이 그려진 뒤 브라우저가 `POST /api/google/sync` 를 부른다(화면을 기다리게 하지 않는다).
  `changed > 0` 이면 `router.refresh()`.
- AI 포동이 한 턴이 시작될 때(같은 함수, 60초 제한 그대로). 실패해도 대화는 계속.
- 관리자 카드의 **[지금 맞추기]**(60초 제한 무시).
- 하루 한 번 자동(cron)은 **하지 않는다** — `proxy.ts` 가 로그인 없는 요청을 막아 예외 경로가 필요해지는데, 열 때마다 맞추므로
  가족이 보는 순간에는 늘 최신이다.

## 6. 사이트에서 쓸 때 (`/api/events`)

- **만들기**: DB 저장 → (동기화가 켜져 있으면) 구글에 만들고 연결을 만든다. 구글에 못 만들면 연결이 없는 채로 남는데,
  §5 계획에 갈래 하나를 더 둔다: **연결 없고 `source="local"` 이며 `createdAt >= initialDoneAt` 인 사이트 일정 → 구글에 만든다.**
  (처음 합치기 전의 지난 일정은 이 조건에 안 걸려 사이트에만 남는다.)
- **고치기**: `readOnly` 연결이면 **409** "구글에서 반복되는(또는 여러 날) 일정이라 구글 캘린더에서 고쳐 주세요." 아니면 저장 →
  구글 갱신, 실패하면 `pendingPush=true`.
- **지우기**: `readOnly` 면 409(같은 문구). 아니면 `deleteMany`(AGENTS.md 규칙) → 연결이 있으면 구글 삭제, 실패하면 묘비로 남긴다.
  두 번 불러도 200.
- 구글 호출은 요청 안에서 기다리되 **5초 제한**. 넘으면 실패로 보고 다음 동기화에 맡긴다.
- AI 포동이도 `/api/events` 를 부르므로 같은 길을 탄다.

## 7. 화면

- **캘린더**: 구글에서 온 일정·연결된 일정에 작은 꼬리표 `G`(접근성 이름 "구글 캘린더와 연결됨"). `readOnly` 일정은 고치기·지우기 대신
  "구글 캘린더에서 고쳐 주세요" 한 줄(하루 모달·목록 모두). 폰 390px·hover 금지 규칙 그대로.
- **관리자 → "구글 캘린더" 카드**: 켜짐/꺼짐(환경변수), 대상 캘린더 ID, 마지막 동기화 시각, 마지막 오류(있으면), 연결된 일정 수,
  보내기 대기 수, **[지금 맞추기]**. 꺼져 있으면 "Vercel 에 `GOOGLE_SERVICE_ACCOUNT_JSON`·`GOOGLE_CALENDAR_ID` 를 넣으면 켜져요."
- 할 일 화면의 "구글 캘린더에도 저장" 선택지 숨김(§1).

## 8. 오류·한계

- 서비스 계정에 공유가 안 됐거나 권한이 "보기"면 구글이 403/404 → `lastError` "캘린더를 열 수 없어요 — 서비스 계정에 '일정 변경'으로
  공유됐는지 확인해 주세요" 를 카드에 보인다. 사이트는 계속 동작.
- 구글 할당량(무료 하루 100만 건)은 가족 규모에서 걱정 없음.
- 처음 합치기의 "같은 날·같은 제목" 은 띄어쓰기·이모지가 다르면 못 알아본다 → 그때는 두 개가 된다(사이트에서 하나 지우면 된다).
- 창 밖(90일 전보다 오래된) 구글 일정은 사이트에 안 들어온다.

## 9. 시험

- **vitest**: `map`(시간·종일·여러 날·반복·색·Asia/Seoul 날짜 경계: 서버 TZ 를 UTC 로 바꿔도 같은 결과), `planSync`(표의 모든 갈래,
  둘 다 바뀐 경우 시각 비교, 창 밖 연결 보존, 묘비, 처음 합치기 매칭), JWT 만들기(가짜 키로 서명·클레임), 오류 문구에 비밀 없음.
- **로컬 실제 확인**(테스트 캘린더로만): 사이트에서 만들기·고치기·지우기 → 구글에 반영 / 구글에서 만들기·고치기·지우기·반복 →
  사이트에 반영 / 두 번 지우기 200 / 같은 날·같은 제목 합치기. `ui:flows` 에 구글 단계를 넣지 않는다(키가 없는 환경에서도 돌아야 한다)
  — 대신 별도 스크립트 `npm run gcal:check` 가 왕복을 밟는다: **localhost 전용**, 시작 전에 로컬의 연결 안 된 일정이 남아 있으면
  멈추고 안내한다(견본 일정이 진짜 캘린더로 가는 것을 막는다), 만드는 것은 전부 `[포동시험]` 제목·약 300일 뒤 날짜, 끝나면(실패해도
  `finally` 로) 구글·로컬 양쪽에서 지우고 **구글 목록에 `[포동시험]` 이 하나도 없는지** 마지막에 다시 확인한다.
- `ui:audit`(390px), lint 0, tsc 0.

## 10. 문서

AGENTS.md 에 "구글 캘린더" 절(서비스 계정·환경변수·readOnly·창·하지 않는 것), DEPLOY.md 에 Vercel 환경변수 두 개와 공유 절차,
REQUIREMENTS.md 의 옛 "구글 로그인 + 캘린더" 절은 이 문서를 가리키게 고친다.
