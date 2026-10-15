# 아기 페이지 — 준비부터 출산까지 (`/baby`) 설계

2026-10-16. 앞선 스펙: `2026-09-08-baby-page-design.md`(임신 일기). 이 문서가 그것을 대신한다.

## 1. 목적

부부가 **임신 준비 → 임신 → 출생**을 한 페이지에서 이어서 챙긴다.
지금 페이지는 "아기(태명·예정일)"가 있어야만 무엇이든 적을 수 있어서, 준비 기간에는 쓸 수 없고
임신이 중간에 끝나면 전부 지우는 것 말고는 길이 없었다(2026-10-15 에 실제로 그랬다).

### 사용자가 정한 것 (2026-10-15 브레인스토밍)
- 준비 단계에서 챙길 것: **함께 쓰는 일기 · 주기 기록 · 준비 체크리스트 · 병원·검사 기록** (넷 다).
- 주기 기록: **생리 시작일 · 끝난 날 · 배란 테스트기 결과**(음성/희미/양성). 기초체온·관계일은 안 한다.
- 계산: **다음 생리 예정일 + 배란 예정일 + 가임기**까지. 전부 **"추정"** 이라고 붙인다.
- 임신을 확인하면 **한 흐름으로 이어진다** — 일기·병원 기록은 한 줄로 이어지고, 주기 기록은 접히고,
  위에는 주차·예정일. **체크리스트는 단계마다 따로.**
- 임신 단계에서 **"준비 단계로" 돌아갈 수 있다.** 그때 **그 임신 기간의 기록을 남길지 지울지 고른다.**
  준비 때 기록과 주기 기록은 그대로.
- 포동이(AI)는 주기 기록을 **읽고 적기까지** 한다(가족의 ChatGPT 로 나간다는 것을 알고 고름).
- 홈 카드는 **남긴다**(켜고 끄는 스위치, 기본 꺼짐). **사이트 달력에도 표시**한다.

### 정해 둔 것 (사용자에게 보여 주고 고칠 수 있게 둔 것)
- 출생 단계는 지금과 같다(출생일 → "태어난 지 N일"). 출생 이후 기능은 범위 밖.
- 주소는 그대로 `/baby`(NAV href·NavItem 덮어쓰기·꾸미기 surfaceKey 가 다 여기 묶여 있다).
  기본 설명만 "준비부터 출산까지 함께 쓰는 기록" 으로 바꾼다. 이름 "아기" 는 그대로.
- **원칙의 예외 한 곳**: 2026-09 스펙의 "의료 시기·제도 문구를 UI 에 넣지 않는다" 는 그대로 두되,
  **주기 계산에서 나온 날짜(다음 예정일·배란 예정일·가임기)만** 예외로 보여 준다. 날짜와 "추정" 표시뿐이고
  **권하는 문장(“이때 ~하세요”)은 쓰지 않는다.** AGENTS.md 에도 적는다.
- 준비 체크리스트에는 **기본 항목을 넣지 않는다**(무엇을 넣어도 의료 조언이 된다). 임신 체크리스트의
  기본 항목은 지금 것 그대로.

### 범위 밖
출생 이후 성장 기록, 기초체온·관계일, 주기 그래프, 알림, 테스트기 결과로 배란일 보정.

## 2. 데이터 모델

### 2.1 모양 — 기록은 페이지의 것, 임신은 그 아래 0..n
- 일기·체크리스트·참고 사이트·주기 기록은 **페이지에 속한다** → 임신이 없어도(준비 단계) 존재한다.
- 임신을 확인하면 `Pregnancy` 한 행이 생긴다. **진행 중인 임신**은 `endedAt` 이 비어 있는 것(최대 1개).
- 진행 중인 임신이 있을 때 쓴 일기는 그 임신에 **도장**(`pregnancyId`)이 찍힌다. 서버가 만들 때 찍는다
  (클라이언트가 보내는 값을 믿지 않는다). 고칠 때는 도장이 바뀌지 않는다.
- 체크리스트도 같은 도장을 쓴다: `pregnancyId` 가 비면 **준비 체크리스트**, 차 있으면 **그 임신의 체크리스트**.
  화면은 지금 단계의 것만 보여 준다(준비 → null, 임신 → 진행 중인 임신의 것).
- 단계는 **저장하지 않고 계산한다**: 진행 중인 임신 없음 = `prep`, 있고 출생일 없음 = `pregnant`, 출생일 있음 = `born`.
- "준비 단계로" + **지우기** = 그 `Pregnancy` 행을 지운다 → 도장 찍힌 일기·체크리스트가 cascade 로 같이 사라진다
  (날짜로 추리지 않으므로 확인한 날·끝난 날 앞뒤가 섞이지 않는다).
  **남기기** = `endedAt` 을 찍는다 → 일기는 타임라인에 그대로, 그 임신의 체크리스트는 화면에서 빠진다(DB 에는 남음).

검토하고 버린 모양: ① 기록 하나에 `stage` 열 — 준비 단계 일기에도 부모가 필요해 "그 임신의 기록" 을 날짜로만
가를 수 있다(확인한 날 앞뒤가 섞인다). ② 지금 페이지는 두고 준비 페이지를 따로 — "한 흐름" 이 깨진다.

### 2.2 새 표만 쓴다 (운영 DB 를 손으로 고치지 않는다)
운영 스키마는 빌드 때 `prisma/ensure.sql` 로만 바뀌고, 그 파일은 **`CREATE … IF NOT EXISTS` 만** 허용한다
(`scripts/ensure-tables.mjs` 가 ALTER/DROP 을 보면 실행을 건너뛴다). 기존 `Baby`·`BabyEntry` 의 열을 바꾸려면
사람이 Neon 콘솔에서 SQL 을 쳐야 한다. 그래서 **새 표를 만들고 옛 네 표(`Baby`·`BabyEntry`·`BabyChecklistItem`·
`BabyLink`)는 스키마에서 뺀다.** 운영의 옛 표는 쓰이지 않은 채 남는다(2026-10-15 리셋으로 비어 있다 — 나중에
사람이 지워도 된다. DEPLOY.md 에 적는다). 로컬은 `db push --accept-data-loss` 가 옛 표를 지운다.

```prisma
/// 임신 한 번. endedAt 이 비어 있으면 진행 중(최대 1개 — API 가 지킨다).
model Pregnancy {
  id         String    @id @default(cuid())
  nickname   String    @default("우리 아기") // 태명. 아직 없으면 기본값
  emoji      String    @default("🌱")
  color      String    @default("rose")
  dueDate    DateTime
  birthDate  DateTime?
  endedAt    DateTime? // "준비 단계로 · 남기기" 를 고른 때
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  entries   JourneyEntry[]
  checklist JourneyChecklistItem[]
  @@index([endedAt])
}

/// 일기·병원·편지. pregnancyId = 쓸 때 진행 중이던 임신(도장). 준비 때 쓴 것은 null.
model JourneyEntry {
  id          String        @id @default(cuid())
  date        DateTime
  kind        String        @default("diary") // diary | checkup | letter
  mood        String?
  content     String
  authorId    String?
  author      FamilyMember? @relation(fields: [authorId], references: [id], onDelete: SetNull)
  pregnancyId String?
  pregnancy   Pregnancy?    @relation(fields: [pregnancyId], references: [id], onDelete: Cascade)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  @@index([date])
  @@index([pregnancyId])
}

/// pregnancyId null = 준비 체크리스트, 값 = 그 임신의 체크리스트
model JourneyChecklistItem {
  id          String     @id @default(cuid())
  text        String
  done        Boolean    @default(false)
  sortOrder   Int        @default(0)
  pregnancyId String?
  pregnancy   Pregnancy? @relation(fields: [pregnancyId], references: [id], onDelete: Cascade)
  createdAt   DateTime   @default(now())
  @@index([pregnancyId])
}

/// 참고 사이트 — 단계와 무관하게 페이지의 것
model JourneyLink {
  id        String   @id @default(cuid())
  url       String
  title     String   @default("")
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
}

/// 주기 기록 — 하루짜리 사건을 덧붙이기만 한다(포동이는 추가 전용이라 "끝난 날" 도 따로 적을 수 있어야 한다).
/// kind: periodStart | periodEnd | ovulationTest.  result: ovulationTest 일 때만 negative | faint | positive
model CycleEvent {
  id        String   @id @default(cuid())
  date      DateTime
  kind      String
  result    String?
  createdAt DateTime @default(now())
  @@index([date])
}

/// 페이지 설정(싱글턴 id="main"). 단계와 무관한 홈 표시 스위치.
model JourneySettings {
  id         String   @id @default("main")
  showOnHome Boolean  @default(false)
  updatedAt  DateTime @updatedAt
}
```
`FamilyMember.babyEntries` 관계 필드는 `journeyEntries JourneyEntry[]` 로 바꾼다(관계 필드는 DB 열이 아니므로
`FamilyMember` 표는 안 바뀐다). `prisma/ensure.sql` 에 여섯 표의 `CREATE TABLE IF NOT EXISTS` + 인덱스 + FK 를
**Prisma 가 만드는 것과 똑같이** 적는다(§9 에서 diff 로 확인).

### 2.3 같은 날 같은 사건은 한 번만
`CycleEvent` POST 는 같은 날짜·같은 kind(테스트기는 결과까지 같으면)가 이미 있으면 **새로 만들지 않고 그 행을 돌려준다**
(200). 포동이와 사람이 같은 날을 두 번 적어도 계산이 흔들리지 않게. 결과가 다른 테스트기는 따로 남긴다(하루 두 번 검사).

## 3. 주기 계산 — `lib/cycle.ts` (순수 함수, vitest)

입력은 `CycleEvent[]` 와 오늘. DB·화면을 모른다.

- **생리 기간**: 시작일들을 정렬하고, 각 시작의 끝 = 그 시작 이후·다음 시작 이전의 첫 `periodEnd`(없으면 끝 모름).
- **주기 길이**: 이웃한 시작일 사이 일수 중 **15~60일만**(빠진 기록·잘못 적은 날을 거른다), 최근 6개의 평균(반올림).
  하나도 없으면 **28일**을 쓰고 `basis: "default"` 로 알린다("기록이 두 번 쌓이면 더 맞아져요").
- **생리 길이**: 끝을 아는 기간의 (끝-시작+1) 중 1~14일의 평균, 없으면 5일. 예정 표시용.
- **다음 예정일** = 마지막 시작 + 평균 주기. 오늘이 지났으면 굴리지 않고 `lateDays`(지난 일수)를 준다.
- **배란 예정일** = 다음 예정일 − 14일. **가임기** = 배란 예정일 −5일 ~ +1일.
- **지금 주기 며칠째** = 오늘 − 마지막 시작 + 1.
- 시작 기록이 하나도 없으면 `null`(화면은 첫 기록을 권한다).

```ts
export interface CyclePrediction {
  lastStart: Date; cycleDay: number;
  avgCycle: number; avgPeriod: number; basis: "records" | "default";
  nextStart: Date; daysUntilNext: number; lateDays: number; // 지났으면 lateDays>0, daysUntilNext<0
  ovulation: Date; fertileStart: Date; fertileEnd: Date;
}
export function periodsFrom(events): { start: Date; end: Date | null }[]
export function predictCycle(events, today = new Date()): CyclePrediction | null
```
날짜는 전부 `startOfDay`·`differenceInCalendarDays`(로컬 자정 규칙, `lib/date.ts` 와 같다).

## 4. 화면 (`app/baby/*`)

`page.tsx`(서버)는 진행 중인 임신·일기(작성자·임신 포함)·체크리스트·참고 사이트·주기 기록·설정을 한 번에 읽어
`<BabyClient>` 로 넘긴다. **"아기가 없으면 첫 설정" 화면은 없어진다** — 데이터가 하나도 없어도 준비 단계 페이지가 뜬다.
(그래서 "처음부터 다시 시작" 은 이제 "빈 준비 단계" 로 돌아간다.)

### 4.1 히어로 — 단계마다 다르다 (지금의 진한 판을 그대로 쓴다)
- **준비**: `h1` 은 "아기 준비". 예측이 있으면 큰 글씨로 **"다음 생리 예정 D-12"**(지났으면 "예정일에서 3일 지났어요"),
  아래 줄에 `10월 28일 예정 · 추정`. 막대는 이번 주기 진행(며칠째 / 평균 주기)이고 그 위에 **가임기 구간**을
  옅게 깐다. 그 아래 "가임기 10/30~11/5 · 배란 예정 11/4 (추정)". 예측이 없으면 "생리 시작일을 적으면 다음
  예정일과 가임기를 추정해 드려요" + [생리 시작 적기].
  오른쪽 위 ⚙ = 페이지 설정. 아래쪽에 **[임신을 확인했어요]** 버튼.
- **임신 / 출생**: 지금 히어로 그대로(태명·주차·막대·다음 검진). ⚙ = 임신 설정.

### 4.2 주기 카드 (`cycle-card.tsx`) — 준비 단계에서만 펼쳐 보인다
- 버튼 셋: [생리 시작] [생리 끝] [테스트기] → 작은 모달(날짜, 기본 오늘 · 테스트기는 결과 셋 중 하나).
- 최근 기간 목록: "10월 2일 ~ 10월 6일 · 5일" (끝 모르면 "~ ?"), 그 사이 주기 길이. 테스트기 결과는 날짜·결과 태그.
- 각 줄 `ItemActions`(삭제). 지우기는 묻지 않는다(다시 적기 3초) — 장보기와 같은 규칙.
- 평균 주기·생리 길이 한 줄, `basis: "default"` 면 "기록이 두 번 쌓이면 더 맞아져요".
- **임신 단계에서는 접힌 한 줄**("준비 때 주기 기록 N개 ▸")로만 보이고, 펼치면 같은 카드(읽기·삭제).

### 4.3 일기 (지금 타임라인 그대로)
- 종류 셋 그대로: 일상 · **병원**(지금 "검진" — 준비 단계에도 맞게 이름만 "병원" 으로) · 편지.
- 주차 꼬리표는 **진행 중인 임신에 도장 찍힌 기록**의 날짜 묶음에만 단다. 준비 때 기록·끝난 임신의 기록에는 없다.
- 다음 진료(미래 날짜의 병원 기록)는 단계와 상관없이 히어로 아래에 보인다.

### 4.4 체크리스트 · 참고 사이트
- 체크리스트는 지금 단계 것만. 준비 체크리스트는 빈 상태에서 직접 적기만(기본 항목 버튼 없음).
- 참고 사이트는 지금 그대로(단계 무관).

### 4.5 단계 바꾸기
- **[임신을 확인했어요]** → 모달: 태명(비워도 됨 → "우리 아기") · 이모지 · 색 · 날짜(출산 예정일 | 마지막 생리일).
  **마지막 생리일 칸은 가장 최근 `periodStart` 로 미리 채운다.** 저장하면 임신 단계로.
- **임신 설정** 맨 아래에 두 구역(서로 줄로 떼어 둔다):
  - "준비 단계로 돌아가기" → 모달: 두 선택지 중 **하나를 골라야** 버튼이 켜진다.
    "이 기간의 기록 남기기 — 일기는 그대로 두고 준비 단계로 돌아가요" /
    "이 기간의 기록 지우기 — 임신을 확인한 뒤 쓴 일기·체크리스트와 사진이 사라져요".
    문구는 이유를 말하지 않는다.
  - "처음부터 다시 시작"(이미 있는 것) — 문구를 "모든 기록(주기 기록 포함)" 으로 고친다.
- **페이지 설정**(준비 단계 ⚙): 홈에 보여주기 · 처음부터 다시 시작.

## 5. 홈 (`app/page.tsx`)
- `JourneySettings.showOnHome` 을 본다. 꺼져 있고 **무엇이든 기록이 있으면** 지금처럼 "홈에서도 보기" 한 줄.
- 켜져 있으면 카드 한 장(한 줄 전체):
  - 준비: "다음 생리 예정 D-12 · 추정" + 가임기 꼬리표 + 최근 일기 한 줄. 예측 없으면 "아기 준비" + 최근 일기.
  - 임신·출생: 지금 카드 그대로.

## 6. 달력 (`app/calendar/*`)
- 서버가 `journeyMarks()`(`lib/journey.ts`)로 **읽기 전용 표시**를 만들어 두 번째 prop 으로 넘긴다.
  `CalendarEvent` 로 저장하지 않는다(주기를 적을 때마다 다시 맞춰야 한다).
  ```ts
  type JourneyMark = { date: string /* yyyy-MM-dd */; kind: "period" | "periodPredicted" | "fertile" | "ovulation" | "hospital" | "due"; label: string };
  ```
  - 준비 단계일 때만: 기록된 생리 기간(`period`), 다음 예정 기간(`periodPredicted`, 평균 생리 길이만큼),
    가임기(`fertile`), 배란 예정일(`ovulation`). 라벨에 "추정".
  - 늘: 오늘 이후 병원 기록(`hospital`, 기록 첫 줄). 임신 단계: 출산 예정일(`due`).
- 격자 칸: 일정 점과 구별되는 작은 표시(색은 `palette()` 키로). 하루 모달·폰 목록: 읽기 전용 줄 + "아기 페이지에서 보기" 링크.
  지우기·고치기 버튼은 없다(아기 페이지에서 한다).
- 676줄 클라이언트에 새 개념이 들어가므로 표시 부분은 **별도 컴포넌트**(`journey-marks.tsx`)로 뺀다.

## 7. API
옛 경로 이름은 살리고 새 표를 가리키게 한다(옛 대화의 되돌리기 카드가 같은 주소를 부른다 — 없는 id 면 deleteMany 가 0건).
모든 DELETE 는 `deleteMany`(AGENTS.md).

| 경로 | 하는 일 |
|---|---|
| `PATCH /api/baby` | 페이지 설정 `{ showOnHome }` (싱글턴 upsert) |
| `DELETE /api/baby` | **처음부터 다시 시작**: 여섯 표를 모두 지우고 일기 사진 sweep |
| `POST /api/pregnancy` | 임신 확인 `{ nickname?, emoji?, color?, dueDate | lmpDate }`. 진행 중이 있으면 409 |
| `PATCH /api/pregnancy/[id]` | 임신 설정(태명·이모지·색·예정일·출생일) |
| `POST /api/pregnancy/[id]/end` | `{ keep: boolean }` 남기기=endedAt, 지우기=행 삭제+cascade+사진 sweep. 이미 끝났거나 없으면 200 |
| `POST /api/baby-entries` · `PATCH/DELETE /[id]` | 일기. POST 는 서버가 진행 중인 임신을 도장으로 찍는다(babyId 안 받음) |
| `POST /api/baby-checklist` · `PATCH/DELETE /[id]` | `{ text }` 또는 `{ texts }`. 서버가 지금 단계(진행 중 임신 id 또는 null)를 찍는다 |
| `POST /api/baby-links` · `PATCH/DELETE /[id]` | 참고 사이트(babyId 안 받음) |
| `POST /api/cycle-events` · `DELETE /[id]` | 주기 기록 `{ date?, kind, result? }`(§2.3 중복 방지) |

`lib/uploads.ts` 의 `sweepUploads` 는 `babyEntry` 대신 `journeyEntry` 를 센다.

## 8. 포동이 (`lib/agent/resources.ts`)
키는 그대로 두고(옛 대화의 되돌리기·시험이 키로 찾는다) 안을 바꾼다. 17종 → **18종**.
- `baby`(아기): catalog = 단계 한 줄(준비: 다음 예정 추정 / 임신: 태명·예정일). detail = 단계·진행 중인 임신·최근 일기·
  지금 체크리스트·참고 사이트·주기 요약(예측 포함, "추정" 명시). 만들지 않는다.
- `babyEntry`·`babyChecklist`·`babyLink`: `requireBabyId()` 를 없앤다 — **준비 단계에서도 추가된다.**
  `describe` 의 checkup 설명을 "병원" 으로.
- **새 `cycle`(주기 기록)**: catalog = 최근 기록 + 예측 한 줄. create = `/api/cycle-events`, 인자 `date`(비우면 오늘)·
  `kind`(enum)·`result`(enum, 테스트기만). undo = `/api/cycle-events/[id]`.
  `create_item` 인자 설명이 늘어나는 것(PODONGI.md "고정 비용")은 `npm run agent:prompt` 로 다시 재서 적는다.
- `RESOURCES` 순서: `baby` 가 `/baby` 를 쓰는 다른 것들보다 앞(이미 시험이 잡는다).
- 실행 기록(`AgentRun`)에는 지금처럼 도구 이름·label 만 남는다(주기 내용이 로그 표에 눌러앉지 않는다).

## 9. 검증
- **vitest**: `lib/cycle.ts`(기간 짝짓기, 15~60 거르기, 기본 28, 지난 예정일, 배란·가임기 경계, 같은 날 두 기록),
  `journeyMarks`(단계별로 무엇이 나오는지), 포동이 리소스 시험 갱신(`resources.test.ts`·`catalog.test.ts`).
- **ensure.sql 대조**: 로컬 DB 에서 새 여섯 표를 지우고 `ensure.sql` 로 다시 만든 뒤
  `prisma migrate diff --from-url <로컬> --to-schema-datamodel prisma/schema.prisma` 가 **비어 있어야** 한다.
  두 번 돌려도 오류 없음.
- **ui:flows**(로컬): 아기 흐름을 새로 쓴다 — 준비 단계에서 일기 쓰기·지우기, 생리 시작 → 히어로에 "추정",
  테스트기 결과, 임신 확인 → 주차, 그 상태에서 일기 하나 → "준비 단계로 · 지우기" → 그 일기만 사라지고 준비 때
  일기는 남는다, "남기기" 도 한 번, 홈 표시 켜고 끄기(돌려놓기). **처음부터 다시 시작은 돌리지 않는다**
  (개발자 로컬 기록이 다 지워진다). 진행 중인 임신이 로컬에 이미 있으면 단계 흐름은 건너뛰고 그렇게 알린다.
- `npm run agent:smoke`, `npm run lint` 0건, `npx tsc --noEmit`, `npm run ui:audit`(로컬) — 390px 에서 가로 넘침 없음.
- 달력: 준비 단계 데이터로 격자·하루 모달·폰 목록에 표시가 나오는지 화면으로 본다.

## 10. 문서
- AGENTS.md "아기 페이지" 절을 새 모델로 고치고, 의료 문구 원칙의 **예외(주기 날짜만, 추정 표시, 권유 문장 금지)** 를 적는다.
- PODONGI.md: 리소스 수 17→18, 고정 비용 숫자 다시 잼.
- DEPLOY.md: 옛 네 표는 쓰이지 않으며 지워도 된다(사람 손으로 한 번).
- `prisma/seed.ts`: 새 모델로 준비 단계 견본(주기 기록 두 번, 일기 두 개).
