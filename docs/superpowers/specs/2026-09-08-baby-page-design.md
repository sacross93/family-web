# 아기 페이지 (`/baby`) 설계

작성: 2026-09-08 · 상태: 승인됨 (사용자 컨펌 후 구현 진행)

## 1. 목적

부부가 임신 기간 동안 함께 쓰는 **교환일기형 아기 공간**. 아내(임산부)와 남편이 같은 타임라인에
일상 기록·검진 메모·아기에게 보내는 편지를 남기고, 히어로에서 임신 주차와 출산 D-day를 본다.
출산 후에는 출생일만 넣으면 같은 페이지가 "태어난 지 N일" 성장 일기로 이어진다.

### 결정 사항 (브레인스토밍 결과)
- **'임신' 페이지가 아니라 '아기' 레코드**로 모델링한다. 태명·예정일·출생일(nullable).
- 기록은 **단일 타임라인**. 작성자는 게시판처럼 가족 구성원(FamilyMember)을 글쓸 때 고른다. 계정 분리 없음.
- 아기에게 쓰는 **편지는 핵심 기능**(기록 종류 중 하나).
- **홈 대시보드 노출은 토글**(기본 꺼짐). 초기 임신의 민감함을 고려해 조용하고 따뜻한 톤.
- **의료 시기·국가 지원 제도를 UI에 박지 않는다.** 체크리스트는 편집 가능한 메모이며, 기본 항목은 일반적·비의료 문구만.

### 범위 밖 (나중에)
주차별 배 사진 시리즈 · 체중 그래프 · 주차별 아기 크기 한마디 · 자체 스티커 표면(계획의 `plan:<id>` 방식) · 출생 후 성장 모드 본격화(현재는 D+N 표기만).

## 2. 데이터 모델 (Prisma)

```prisma
// 아기 — 임신 중엔 태명+예정일, 출생 후엔 출생일 채움
model Baby {
  id         String    @id @default(cuid())
  nickname   String                       // 태명 (예: "콩이")
  emoji      String    @default("🌱")
  color      String    @default("rose")   // 팔레트 키
  dueDate    DateTime                     // 출산 예정일 (필수)
  birthDate  DateTime?                    // 출생일 (출생 후)
  showOnHome Boolean   @default(false)    // 홈 대시보드 카드 노출
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  entries   BabyEntry[]
  checklist BabyChecklistItem[]
}

// 기록 — kind: "diary"(일상) | "checkup"(검진) | "letter"(편지)
model BabyEntry {
  id        String   @id @default(cuid())
  babyId    String
  baby      Baby     @relation(fields: [babyId], references: [id], onDelete: Cascade)
  date      DateTime                      // 기록 날짜 (하루 단위, 로컬 00:00)
  kind      String   @default("diary")
  mood      String?                       // 컨디션 이모지 (일상 기록용, 선택)
  content   String                        // 마크다운
  authorId  String?
  author    FamilyMember? @relation(fields: [authorId], references: [id], onDelete: SetNull)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([babyId, date])
}

model BabyChecklistItem {
  id        String   @id @default(cuid())
  babyId    String
  baby      Baby     @relation(fields: [babyId], references: [id], onDelete: Cascade)
  text      String
  done      Boolean  @default(false)
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())

  @@index([babyId])
}
```

- `FamilyMember`에 `babyEntries BabyEntry[]` 역관계 추가.
- 사진은 별도 테이블 없음. `MarkdownEditor`의 이미지 업로드(`/api/upload`)로 본문에 삽입.
- "다음 검진" = `kind="checkup"`이고 `date >= 오늘`인 기록 중 가장 가까운 것. 별도 필드 없음.
- UI는 아기 1명만 다룬다(`findFirst`, `orderBy createdAt desc`). 테이블은 복수 허용.

## 3. 날짜 헬퍼 (`lib/date.ts`)

```ts
export const PREGNANCY_DAYS = 280;

/** 마지막 생리일 → 출산 예정일 (+280일) */
export function dueDateFromLmp(lmp: Date | string): Date;

export interface PregnancyProgress {
  elapsedDays: number;  // 시작일(예정일-280)부터 오늘까지 경과일. 0 이상으로 클램프
  weeks: number;        // floor(elapsedDays / 7)
  days: number;         // elapsedDays % 7
  trimester: 1 | 2 | 3; // weeks < 14 → 1, < 28 → 2, else 3
  progress: number;     // elapsedDays / 280, 0~1 클램프
  dueDays: number;      // 예정일까지 남은 일수 (오늘=0, 과거=음수)
  dueLabel: string;     // "D-245" | "D-DAY" | "D+3"  (기존 dday()와 동일 규칙)
  overdue: boolean;     // dueDays < 0
}
export function pregnancyProgress(dueDate: Date | string, today?: Date): PregnancyProgress;

/** 출생 후: 태어난 지 N일 (출생일=1일째로 세지 않고 차이 일수. 오늘 태어났으면 0) */
export function daysSinceBirth(birthDate: Date | string, today?: Date): number;
```

- 모두 `differenceInCalendarDays` + `startOfDay` 기반(자정 경계 안전).
- **단위 테스트(vitest, 이 프로젝트 첫 테스트)**: 예정일 D-245일 때 5주 0일 / 5주 3일 경계, 0주 0일(경과 0일), 13주6일→1분기·14주0일→2분기, 27주6일→2분기·28주0일→3분기, 예정일 당일(40주 0일, D-DAY, progress 1), 예정일 지난 경우(overdue, progress 1 클램프, 주차는 40주+ 계속 증가), 시작일 이전(경과 음수 → 0 클램프), `dueDateFromLmp` 왕복, `daysSinceBirth`.

## 4. 화면 (`app/baby/page.tsx` + `baby-client.tsx`)

서버 컴포넌트에서 `baby`(entries: date desc·createdAt desc, author include / checklist: sortOrder asc)와 `members`를 읽어 클라이언트에 전달. `export const dynamic = "force-dynamic"`.

### 4.1 아기가 없을 때 — 첫 설정
`PageHeader emoji="🌱" title="아기"` 아래 카드 하나. 폼: 태명(필수), **날짜 입력 방식 Segmented(출산 예정일 | 마지막 생리일)** → 날짜 하나, 이모지(기본 🌱, 자유 입력), `ColorPicker`. 저장 → `POST /api/baby` → `router.refresh()`.
문구 예: "우리 아기 이야기를 시작해 볼까요? 🌱 태명과 예정일만 있으면 돼요."

### 4.2 히어로 (아기 있음)
`palette(baby.color).gradient` 카드.
- 왼쪽: 이모지+태명 (`font-display`), 큰 숫자 **"5주 3일"** (`font-num`), 보조 "1분기 · 출산 예정 9월 21일 (월)".
- 오른쪽/아래: `Tag`로 **출산 D-245**, 다음 검진이 있으면 **"다음 검진 D-3 · 9월 11일"**.
- 진행 바: `bg-sunken` 트랙 + `palette.dot` 채움, `progress*100`%.
- 출생일이 있으면 주차 대신 **"태어난 지 N일"** + 출생일. D-day·진행 바 숨김.
- 우상단 `IconButton`(Settings) → **설정 모달**: 태명·이모지·색·예정일·출생일(선택)·**홈에 보여주기** `Checkbox`. `PATCH /api/baby`.
- 톤: 카운트다운을 요란하게 하지 않는다. 숫자 하나, 문장 하나.

### 4.3 기록 남기기
PageHeader 우측 `Button primary "+ 기록 남기기"` → `Modal`:
- 작성자: 게시판과 같은 구성원 선택 UI(아바타 라디오). 마지막 선택을 `localStorage("podong_baby_author")`에 기억.
- 날짜 `Input type=date` 기본 오늘.
- 종류 `Segmented`: 일상 📝 · 검진 🩺 · 편지 💌.
- 컨디션 이모지: 종류가 일상일 때만. 이모지 8개 정도 칩(😊 🙂 😐 😪 🤢 😢 🤯 🥰) + 선택 해제 가능.
- 내용: `MarkdownEditor`(이미지 업로드 포함). 플레이스홀더는 종류별로 다름
  (일상 "오늘 몸은 어땠어요? 남편은 무엇을 해줬나요?", 검진 "병원에서 들은 이야기, 초음파 사진을 남겨요", 편지 "아기에게 한마디 💌").
- 저장 → `POST /api/baby-entries` → 낙관적 추가 후 서버 응답으로 교체. 수정은 같은 모달 재사용(`PATCH`).

### 4.4 타임라인
- 상단 `Segmented` 필터: 전체 · 일상 · 검진 · 편지.
- 날짜별 그룹 헤더: `kDate(date)` + 그 날짜의 임신 주차 보조 표기("5주 3일"). 그룹은 최신 날짜 먼저.
- 글 카드(`Card`): `Avatar`(작성자) + 이름 + 종류 `Tag`(일상 mint · 검진 sky · 편지 rose) + mood 이모지 + `MarkdownView` 본문 + 우측 수정/삭제 `IconButton`. 모바일에서 항상 보임(`opacity-100 lg:opacity-0 lg:group-hover:opacity-100`).
- 편지 카드는 `palette("rose").soft` 배경으로 살짝 구분. 다른 카드는 기본 `bg-surface`.
- 삭제는 `confirm()` 후 `DELETE`. 낙관적 제거, 실패 시 복원.
- 빈 상태 `EmptyState emoji="🌱" title="첫 기록을 남겨볼까요?" description="오늘의 몸 상태, 병원 이야기, 아기에게 한마디. 무엇이든 좋아요."`.

### 4.5 준비 체크리스트
`Card` + `CardTitle "준비 체크리스트"`. 계획 체크리스트와 동일 UX(원형 `Checkbox`, 인라인 추가 입력, 삭제).
비어 있으면 "기본 항목 넣기" `Button soft` → 아래 항목을 순서대로 생성(모두 편집·삭제 가능, 비의료·일반 문구):
"산모수첩 챙기기", "다닐 병원 정하기", "태명 정하기 🌱", "가족에게 알리기", "출산 준비물 목록 만들기", "아기 이름 후보 적어보기".

### 4.6 레이아웃
- 모바일(1열): 히어로 → 체크리스트(접힘 가능, 기본 접힘, 헤더에 "3/6" 진행) → 필터 → 타임라인. 하단 여백 `pb-24`.
- `lg:` 2열: 왼쪽 2/3 타임라인, 오른쪽 1/3 체크리스트 `sticky top-6`.
- 폭 390px에서 가로 스크롤 없음. 탭 타깃 ≥ 40px.

## 5. 홈 카드 (`app/page.tsx`)

`prisma.baby.findFirst({ where: { showOnHome: true }, orderBy: { createdAt: "desc" }, include: { entries: { orderBy: [{date:"desc"},{createdAt:"desc"}], take: 1, include: { author: true } } } })`.
있을 때만 `DashCard href="/baby" emoji={baby.emoji} title={baby.nickname} color={baby.color}`: 큰 숫자 "5주 3일" + `Tag` "출산 D-245" (출생 후엔 "태어난 지 N일"), 아래에 최근 글 한 줄(작성자 이름 · 첫 줄 `line-clamp-1`). 없으면 카드 자체를 렌더하지 않는다.

## 6. 메뉴 (`lib/nav.ts`)

`{ href: "/baby", label: "아기", emoji: "🌱", color: "rose", desc: "함께 쓰는 아기 일기" }` — `/board` 앞(기념일 다음)에 삽입. `NavItem` DB 오버라이드는 href 기준 병합이므로 추가 작업 없음. 관리자 페이지 페이지 선택 목록도 `NAV`에서 자동 반영.

## 7. API

모두 `app/api/...`, `NextResponse.json`, 검증 실패 400 + 존댓말 메시지. `params`는 Promise(`await params`).

| 경로 | 메서드 | 본문 | 동작 |
|---|---|---|---|
| `/api/baby` | POST | `nickname`, `dueDate`(yyyy-MM-dd) 또는 `lmpDate`(yyyy-MM-dd), `emoji?`, `color?` | 생성. 둘 다 없으면 400. `lmpDate`만 오면 `dueDateFromLmp`. 반환 Baby |
| `/api/baby` | PATCH | `id`, 부분 필드 `nickname` `emoji` `color` `dueDate` `birthDate`(null 허용) `showOnHome` | 부분 수정. 반환 Baby |
| `/api/baby-entries` | POST | `babyId`, `date`, `kind`, `mood?`, `content`, `authorId?` | `kind`는 3종 외면 `diary`. `content` 빈값 400. 반환 entry(+author) |
| `/api/baby-entries/[id]` | PATCH | `date?` `kind?` `mood?`(null 허용) `content?` `authorId?` | 반환 entry(+author) |
| `/api/baby-entries/[id]` | DELETE | — | `{ ok: true }` |
| `/api/baby-checklist` | POST | `babyId`, `text` 또는 `texts: string[]`(기본 항목 일괄) | sortOrder는 마지막+1부터. 반환 item 또는 items[] |
| `/api/baby-checklist/[id]` | PATCH | `done?` `text?` | 반환 item |
| `/api/baby-checklist/[id]` | DELETE | — | `{ ok: true }` |

`color`는 `PaletteKey` 6종 외면 무시(기본 유지). **날짜는 클라이언트가 `yyyy-MM-dd` 문자열로 보내고 서버가 `parseDateInput`(lib/date.ts)으로 서버 로컬 자정 Date 를 만든다** — 기념일·할일 API 와 같은 규칙. 전체 ISO 문자열도 허용. 배포 서버는 `TZ=Asia/Seoul` 로 둔다(DEPLOY.md).

## 8. 타입 (`lib/types.ts`)

`Baby`, `BabyEntry`, `BabyChecklistItem` re-export. `BabyEntryWithAuthor = BabyEntry & { author: FamilyMember | null }`. `BabyDetail = Baby & { entries: BabyEntryWithAuthor[]; checklist: BabyChecklistItem[] }`.

## 9. 시드 · 문서

- `prisma/seed.ts`: 샘플 아기 1명("콩이", 예정일 = 오늘+245일, showOnHome false)과 기록 3개(엄마 일상 1, 아빠 편지 1, 검진 1) 추가. 실제 가족 DB에는 영향 없음(시드는 샘플용).
- `README.md` 기능 목록에 "**아기** — 부부가 함께 쓰는 임신·아기 일기(주차·D-day·편지·검진·체크리스트)" 추가.
- `AGENTS.md`에 한 줄: 아기 페이지 위치·모델·주차 헬퍼 이름.

## 10. 검증

- `npm run lint` · `npx tsc --noEmit` · `npm run build` 통과.
- `npx vitest run` 통과(헬퍼 테스트).
- 로컬 DB `npm run db:push` 후 브라우저(390px)에서: 첫 설정(예정일/생리일 두 방식) → 히어로 수치 확인 → 기록 3종 작성(이미지 포함 1건) → 수정 → 필터 → 삭제 → 체크리스트 기본 항목·체크·삭제 → 설정에서 홈 표시 켜기 → 홈 카드 확인 → 출생일 입력 시 "태어난 지 N일" 확인.
- 배포 DB(Neon)에는 사용자가 `DATABASE_URL="<Direct>" npx prisma db push`를 1회 실행해야 함(DEPLOY.md 절차). 코드 push만으로는 테이블이 생기지 않음.
