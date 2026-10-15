# 아기 페이지 — 준비부터 출산까지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/baby` 를 임신 준비(주기 기록·예측) → 임신 → 출생을 한 흐름으로 챙기는 페이지로 바꾼다.

**Architecture:** 기록(일기·체크리스트·참고 사이트·주기)은 페이지의 것이고, 임신은 그 아래 0..n(`Pregnancy`). 진행 중인 임신에 쓴 일기·체크리스트에 서버가 `pregnancyId` 도장을 찍는다. 단계는 계산한다. 운영 스키마는 `prisma/ensure.sql`(CREATE 만)로 나가므로 **새 표 여섯 개**를 만들고 옛 `Baby*` 네 표는 스키마에서 뺀다. 예측은 순수 함수 `lib/cycle.ts`, 서버 조회는 `lib/journey.ts` 의 `journeyState()` 한 곳.

**Tech Stack:** Next.js 16 App Router · React 19 · TS · Tailwind v4 · Prisma 6 + Postgres · date-fns · vitest · Playwright(ui-flows 스크립트).

**Spec:** `docs/superpowers/specs/2026-10-16-baby-journey-design.md` — 모든 작업자는 이 스펙과 이 계획을 함께 읽는다.

## Global Constraints

- **`AGENTS.md` 필독**(Next 16 은 다르다 — 동적 params 는 `Promise`, `proxy.ts`). 포동이 작업(T6)은 `PODONGI.md` 도.
- 색은 `palette(key)` 로만(`lib/colors.ts`). `"bg-"+key` 같은 동적 클래스 금지. 새 HEX·그림자·폰트 금지. UI 는 `@/components/ui` 배럴.
- 날짜: 클라이언트 → 서버는 `"yyyy-MM-dd"`, 서버는 `parseDateInput`(로컬 자정). 계산은 `startOfDay`·`differenceInCalendarDays`(`lib/date.ts` 에서 import).
- **DELETE 는 `deleteMany({ where: { id } })`** — 두 번 불러도 200.
- 화면 문구: 한국어 존댓말·따뜻·간결. **임신이 끝난 이유를 암시하는 말을 쓰지 않는다.** 예측 날짜에는 반드시 **"추정"**. **권하는 문장(“이때 ~하세요”) 금지.**
- 모바일 우선 390px: 가로 넘침 금지, 탭 타깃 ≥40px, hover 전용 동작 금지, 떠 있는 버튼 금지, 메뉴는 portal(`ItemActions`).
- `ensure.sql` 에는 **`CREATE … IF NOT EXISTS` 만**(ALTER 로 시작하는 줄이 있으면 배포 때 통째로 건너뛴다).
- 작업자(서브에이전트)는 **커밋·`db push`·`ui:flows`·dev 서버 금지**. 리드가 검토 후 커밋한다.
- 끝낼 때: `npx tsc --noEmit`(자기 파일 0건 — 다른 작업이 진행 중이면 그쪽 파일 오류는 보고만), `npm run lint` 0건, `npm test` 통과.
- 주석 밀도·말투는 주변 코드를 따른다(이 저장소는 **왜**를 한국어로 적는다).

## Review Focus

1. **같은 날 두 번 적은 생리 시작 / 시작 없는 "끝" / 다음 시작 뒤의 "끝"** — 기간이 꼬이면 예측이 틀린다. 같은 날은 하나로, 짝 없는 끝은 버린다. → T1 `periodsFrom` 시험.
2. **미래 날짜로 잘못 적은 생리 시작** — 예측이 미래 기준이 되어 "주기 -20일째" 가 된다. 오늘 이후 시작은 예측에서 뺀다. → T1 `predictCycle` 시험.
3. **몇 달 빼먹은 기록(간격 > 60일)** — 평균이 90일로 튄다. 15~60일만 쓰고, 남는 게 없으면 기본 28일 + `basis:"default"`. → T1 시험.
4. **임신 확인을 두 번 누름(두 폰·두 번 탭)** — 진행 중인 임신이 둘이 되면 단계·도장이 꼬인다. 두 번째는 409, 화면은 그 문구를 보여 준다. → T2 라우트 + T7 ui-flows 단계.
5. **"준비 단계로 · 지우기" 에 사진 붙은 일기** — 일기는 cascade 로 사라지는데 사진 파일이 남거나, 준비 때 일기까지 지워지면 안 된다. → T2(사진 먼저 모으기) + T7 ui-flows 단계(준비 때 일기는 남는지).

---

## File Structure

| 파일 | 책임 | 작업 |
|---|---|---|
| `prisma/schema.prisma` | 새 여섯 모델, 옛 네 모델 제거 | T1 |
| `prisma/ensure.sql` | 새 여섯 표 CREATE IF NOT EXISTS (FK 인라인) | T1 |
| `lib/cycle.ts` (+test) | 주기 기간·예측 순수 함수, 종류·결과 메타 | T1 |
| `lib/journey.ts` (+test) | `stageOf`·`journeyState()`·`journeyMarks()` | T1 |
| `lib/types.ts` | 새 타입, 옛 Baby 타입 제거 | T1 |
| `lib/uploads.ts` | sweep 이 `journeyEntry` 를 센다 | T1 |
| `prisma/seed.ts` | 새 모델로 준비 단계 견본 | T1 |
| `app/api/baby/route.ts` | GET 요약 · PATCH 설정 · DELETE 전체 리셋 | T2 |
| `app/api/pregnancy/route.ts`, `[id]/route.ts`, `[id]/end/route.ts` | 임신 시작·설정·끝내기 | T2 |
| `app/api/baby-entries/*`, `baby-checklist/*`, `baby-links/*` | 새 표, 서버가 도장 | T2 |
| `app/api/cycle-events/route.ts`, `[id]/route.ts` | 주기 기록(중복 방지) | T2 |
| `app/baby/*` | 단계별 화면 | T3 |
| `app/page.tsx`, `app/baby/baby-home-invite.tsx` | 홈 카드·초대 줄 | T4 |
| `app/calendar/page.tsx`, `calendar-client.tsx`, `journey-marks.tsx` | 달력 표시 | T5 |
| `lib/agent/resources.ts` (+tests) | 포동이 리소스 18종 | T6 |
| `scripts/ui-flows.mjs`, `AGENTS.md`, `PODONGI.md`, `DEPLOY.md`, `lib/nav.ts` | 검사·문서 | T7 |

순서: **T1 → (리드 L1: db push + ensure 대조) → T2 → T3·T4·T5·T6 병렬(파일이 겹치지 않는다) → T7 → 리드 L2(전체 검증·배포)**.

---

### Task 1: 기초 — 스키마 · ensure.sql · 주기 계산 · 서버 조회 · 타입 · 시드

**Files:**
- Modify: `prisma/schema.prisma` (FamilyMember 관계 필드, `model Baby`~`model BabyLink` 를 새 모델로 교체)
- Modify: `prisma/ensure.sql` (끝에 추가)
- Create: `lib/cycle.ts`, `lib/cycle.test.ts`, `lib/journey.ts`, `lib/journey.test.ts`
- Modify: `lib/types.ts`, `lib/uploads.ts:131-134`, `prisma/seed.ts:22-27,265-307`

**Interfaces:**
- Produces (뒤 작업이 이 이름 그대로 쓴다):
  - `lib/cycle.ts`: `CycleKind`, `TestResult`, `CYCLE_KINDS`, `TEST_RESULTS`, `CYCLE_KIND_META`, `TEST_RESULT_META`, `DEFAULT_CYCLE`, `DEFAULT_PERIOD`, `CycleEventLike`, `Period`, `CyclePrediction`, `periodsFrom(events)`, `predictCycle(events, today?)`
  - `lib/journey.ts`: `Stage`, `stageOf(active)`, `JourneyState`, `journeyState(today?)`, `MarkKind`, `JourneyMark`, `journeyMarks(state)`, `firstLineOf(content, max?)`
  - `lib/types.ts`: `Pregnancy`, `JourneyEntry`, `JourneyChecklistItem`, `JourneyLink`, `CycleEvent`, `JourneyEntryWithAuthor`, `JourneyPageData`
  - Prisma 대리자: `prisma.pregnancy`, `prisma.journeyEntry`, `prisma.journeyChecklistItem`, `prisma.journeyLink`, `prisma.cycleEvent`, `prisma.journeySettings`

- [ ] **Step 1: 스키마 교체**

`FamilyMember` 의 `babyEntries   BabyEntry[]` 를 `journeyEntries JourneyEntry[]` 로 바꾼다. `model Baby {` 부터 `model BabyLink { … }` 끝까지(그 위의 아기 관련 주석 블록 포함)를 아래로 교체한다. 위 주석 블록은 새 설명으로 바꾼다.

```prisma
// ─────────────────────────────────────────────
// 아기 페이지 (/baby) — 준비부터 출산까지 (스펙 2026-10-16-baby-journey-design.md)
// 기록은 **페이지의 것**이고 임신은 그 아래 0..n. 진행 중인 임신(endedAt 없음)에 쓴 일기·체크리스트에
// 서버가 pregnancyId 도장을 찍는다. "준비 단계로 · 지우기" = 그 임신 행 삭제 → 도장 찍힌 것만 cascade.
// 운영 스키마는 prisma/ensure.sql(CREATE 만)로 나가므로 옛 Baby* 표를 고치지 않고 새 표를 만들었다.
// ─────────────────────────────────────────────

/// 임신 한 번. endedAt 이 비어 있으면 진행 중(최대 1개 — POST /api/pregnancy 가 지킨다).
model Pregnancy {
  id        String    @id @default(cuid())
  nickname  String    @default("우리 아기") // 태명. 아직 없으면 기본값
  emoji     String    @default("🌱")
  color     String    @default("rose") // 팔레트 키
  dueDate   DateTime // 출산 예정일
  birthDate DateTime? // 출생일 (출생 후)
  endedAt   DateTime? // "준비 단계로 · 남기기" 를 고른 때
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  entries   JourneyEntry[]
  checklist JourneyChecklistItem[]

  @@index([endedAt])
}

/// 일기 — kind: "diary"(일상) | "checkup"(병원) | "letter"(편지).
/// pregnancyId = 쓸 때 진행 중이던 임신(서버가 찍는다). 준비 때 쓴 것은 null.
model JourneyEntry {
  id          String        @id @default(cuid())
  date        DateTime // 기록 날짜 (하루 단위)
  kind        String        @default("diary")
  mood        String? // 컨디션 이모지
  content     String // 마크다운
  authorId    String?
  author      FamilyMember? @relation(fields: [authorId], references: [id], onDelete: SetNull)
  pregnancyId String?
  pregnancy   Pregnancy?    @relation(fields: [pregnancyId], references: [id], onDelete: Cascade)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@index([date])
  @@index([pregnancyId])
}

/// 체크리스트 — pregnancyId null = 준비 체크리스트, 값 = 그 임신의 체크리스트.
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

/// 참고 사이트 — 단계와 무관하게 페이지의 것. title 이 비면 도메인으로 표시.
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

/// 아기 페이지 설정(싱글턴 id="main"). 단계와 무관한 홈 표시 스위치.
model JourneySettings {
  id         String   @id @default("main")
  showOnHome Boolean  @default(false)
  updatedAt  DateTime @updatedAt
}
```

Run: `npx prisma validate && npx prisma generate` → Expected: valid, client generated.

- [ ] **Step 2: `prisma/ensure.sql` 끝에 새 표 추가**

Prisma 가 만드는 DDL 과 **같은 이름·같은 타입**이다(`prisma migrate diff --from-empty` 로 뽑았다). FK 만 `ALTER TABLE … ADD CONSTRAINT` 대신 `CREATE TABLE` 안에 넣었다 — `ensure-tables.mjs` 가 ALTER 로 시작하는 줄을 거부하기 때문이다. `Pregnancy` 가 FK 대상이므로 먼저 만든다.

```sql

-- 아기 페이지 — 준비부터 출산까지 (2026-10-16, 스펙 2026-10-16-baby-journey-design.md)
-- 옛 Baby·BabyEntry·BabyChecklistItem·BabyLink 는 쓰지 않는다(열을 바꾸려면 ALTER 가 필요해 새 표로 옮겼다).
-- FK 는 **CREATE TABLE 안에** 둔다 — 이 파일은 ALTER 로 시작하는 줄이 있으면 통째로 건너뛴다.
-- 이름(…_pkey·…_fkey·…_idx)은 Prisma 가 만드는 것과 같아야 `prisma migrate diff` 가 비어 나온다.
CREATE TABLE IF NOT EXISTS "Pregnancy" (
    "id" TEXT NOT NULL,
    "nickname" TEXT NOT NULL DEFAULT '우리 아기',
    "emoji" TEXT NOT NULL DEFAULT '🌱',
    "color" TEXT NOT NULL DEFAULT 'rose',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "birthDate" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pregnancy_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Pregnancy_endedAt_idx" ON "Pregnancy"("endedAt");

CREATE TABLE IF NOT EXISTS "JourneyEntry" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'diary',
    "mood" TEXT,
    "content" TEXT NOT NULL,
    "authorId" TEXT,
    "pregnancyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JourneyEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "JourneyEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "FamilyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "JourneyEntry_pregnancyId_fkey" FOREIGN KEY ("pregnancyId") REFERENCES "Pregnancy"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "JourneyEntry_date_idx" ON "JourneyEntry"("date");
CREATE INDEX IF NOT EXISTS "JourneyEntry_pregnancyId_idx" ON "JourneyEntry"("pregnancyId");

CREATE TABLE IF NOT EXISTS "JourneyChecklistItem" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "pregnancyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyChecklistItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "JourneyChecklistItem_pregnancyId_fkey" FOREIGN KEY ("pregnancyId") REFERENCES "Pregnancy"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "JourneyChecklistItem_pregnancyId_idx" ON "JourneyChecklistItem"("pregnancyId");

CREATE TABLE IF NOT EXISTS "JourneyLink" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CycleEvent" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CycleEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CycleEvent_date_idx" ON "CycleEvent"("date");

CREATE TABLE IF NOT EXISTS "JourneySettings" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "showOnHome" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JourneySettings_pkey" PRIMARY KEY ("id")
);
```

Run: `grep -nE "^\s*(DROP|ALTER|DELETE|TRUNCATE|UPDATE|INSERT)\b" prisma/ensure.sql` → Expected: 출력 없음.

- [ ] **Step 3: `lib/cycle.test.ts` 먼저 (실패 확인)**

```ts
import { describe, it, expect } from "vitest";
import { periodsFrom, predictCycle, DEFAULT_CYCLE, DEFAULT_PERIOD } from "./cycle";

const d = (s: string) => {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
};
const ymd = (x: Date) =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
const start = (s: string) => ({ date: d(s), kind: "periodStart" });
const end = (s: string) => ({ date: d(s), kind: "periodEnd" });

describe("periodsFrom", () => {
  it("시작마다 그 뒤·다음 시작 전의 첫 끝을 짝짓는다", () => {
    const p = periodsFrom([start("2026-09-01"), end("2026-09-05"), start("2026-09-29"), end("2026-10-03")]);
    expect(p.map((x) => [ymd(x.start), x.end && ymd(x.end), x.length])).toEqual([
      ["2026-09-01", "2026-09-05", 5],
      ["2026-09-29", "2026-10-03", 5],
    ]);
  });
  it("같은 날 두 번 적은 시작은 하나다", () => {
    expect(periodsFrom([start("2026-09-01"), start("2026-09-01")])).toHaveLength(1);
  });
  it("시작 없는 끝·다음 시작 뒤의 끝은 버린다", () => {
    const p = periodsFrom([end("2026-08-20"), start("2026-09-01"), start("2026-09-29"), end("2026-10-02")]);
    expect(p[0].end).toBeNull();
    expect(ymd(p[1].end!)).toBe("2026-10-02");
  });
  it("넘어온 순서와 상관없이 날짜순이다", () => {
    const p = periodsFrom([start("2026-09-29"), start("2026-09-01")]);
    expect(p.map((x) => ymd(x.start))).toEqual(["2026-09-01", "2026-09-29"]);
  });
});

describe("predictCycle", () => {
  it("시작 기록이 없으면 null", () => {
    expect(predictCycle([end("2026-09-05")], d("2026-10-01"))).toBeNull();
  });
  it("오늘 이후로 잘못 적은 시작은 예측에서 뺀다", () => {
    expect(predictCycle([start("2026-11-30")], d("2026-10-01"))).toBeNull();
    const p = predictCycle([start("2026-09-20"), start("2026-11-30")], d("2026-10-01"))!;
    expect(ymd(p.lastStart)).toBe("2026-09-20");
  });
  it("시작 하나면 기본 28일 · basis default · 배란 = 다음 예정 −14 · 가임기 −5~+1", () => {
    const p = predictCycle([start("2026-10-01")], d("2026-10-05"))!;
    expect(p.avgCycle).toBe(DEFAULT_CYCLE);
    expect(p.basis).toBe("default");
    expect(ymd(p.nextStart)).toBe("2026-10-29");
    expect(ymd(p.ovulation)).toBe("2026-10-15");
    expect(ymd(p.fertileStart)).toBe("2026-10-10");
    expect(ymd(p.fertileEnd)).toBe("2026-10-16");
    expect(p.cycleDay).toBe(5);
    expect(p.daysUntilNext).toBe(24);
    expect(p.lateDays).toBe(0);
  });
  it("두 번 이상이면 기록으로 평균(반올림)", () => {
    const p = predictCycle([start("2026-08-01"), start("2026-08-29"), start("2026-09-29")], d("2026-10-01"))!;
    // 28, 31 → 29.5 → 30
    expect(p.avgCycle).toBe(30);
    expect(p.basis).toBe("records");
    expect(ymd(p.nextStart)).toBe("2026-10-29");
  });
  it("15~60일 밖의 간격(빠진 기록)은 쓰지 않는다 — 남는 게 없으면 기본값", () => {
    const p = predictCycle([start("2026-05-01"), start("2026-09-01")], d("2026-09-10"))!;
    expect(p.avgCycle).toBe(DEFAULT_CYCLE);
    expect(p.basis).toBe("default");
  });
  it("최근 여섯 주기만 쓴다", () => {
    // 처음 한 번은 45일, 그 뒤 여섯 번은 28일
    const days = ["2026-01-01", "2026-02-15", "2026-03-15", "2026-04-12", "2026-05-10", "2026-06-07", "2026-07-05", "2026-08-02"];
    const p = predictCycle(days.map(start), d("2026-08-05"))!;
    expect(p.avgCycle).toBe(28);
  });
  it("생리 길이는 끝을 아는 기간의 평균, 없으면 기본 5일", () => {
    expect(predictCycle([start("2026-10-01")], d("2026-10-02"))!.avgPeriod).toBe(DEFAULT_PERIOD);
    const p = predictCycle([start("2026-09-01"), end("2026-09-04"), start("2026-09-29"), end("2026-10-04")], d("2026-10-05"))!;
    // 4일, 6일 → 5
    expect(p.avgPeriod).toBe(5);
  });
  it("예정일이 지나면 굴리지 않고 지난 일수를 준다", () => {
    const p = predictCycle([start("2026-09-01")], d("2026-10-02"))!;
    expect(ymd(p.nextStart)).toBe("2026-09-29");
    expect(p.daysUntilNext).toBe(-3);
    expect(p.lateDays).toBe(3);
  });
  it("오늘 시작했으면 1일째", () => {
    expect(predictCycle([start("2026-10-01")], d("2026-10-01"))!.cycleDay).toBe(1);
  });
});
```

Run: `npx vitest run lib/cycle.test.ts` → Expected: FAIL (`Cannot find module './cycle'`).

- [ ] **Step 4: `lib/cycle.ts` 구현**

```ts
// 주기 기록에서 생리 기간·평균 주기·다음 예정일·배란 예정일·가임기를 **추정**한다.
// 순수 함수 — DB 도 화면도 모른다. 날짜는 lib/date.ts 와 같은 로컬 자정 규칙이다.
//
// 화면에 나가는 값은 전부 "추정" 이다. 아기 페이지는 "의료 시기 문구를 넣지 않는다" 가 원칙인데
// **여기서 나온 날짜만** 예외로 보여 준다(AGENTS.md) — 날짜와 "추정" 표시뿐, 권하는 문장은 없다.
import { addDays } from "date-fns";
import type { PaletteKey } from "@/lib/colors";
import { startOfDay, differenceInCalendarDays } from "@/lib/date";

export type CycleKind = "periodStart" | "periodEnd" | "ovulationTest";
export type TestResult = "negative" | "faint" | "positive";
export const CYCLE_KINDS: CycleKind[] = ["periodStart", "periodEnd", "ovulationTest"];
export const TEST_RESULTS: TestResult[] = ["negative", "faint", "positive"];

export const CYCLE_KIND_META: Record<CycleKind, { label: string; emoji: string }> = {
  periodStart: { label: "생리 시작", emoji: "🌸" },
  periodEnd: { label: "생리 끝", emoji: "🌿" },
  ovulationTest: { label: "테스트기", emoji: "🧪" },
};
export const TEST_RESULT_META: Record<TestResult, { label: string; color: PaletteKey }> = {
  negative: { label: "음성", color: "sky" },
  faint: { label: "희미", color: "butter" },
  positive: { label: "양성", color: "mint" },
};

/** 기록이 모자랄 때 쓰는 값. 화면은 basis 로 "기록이 쌓이면 더 맞아져요" 를 붙인다. */
export const DEFAULT_CYCLE = 28;
export const DEFAULT_PERIOD = 5;
// 이 밖의 간격은 빠뜨린 기록이나 잘못 적은 날로 본다 — 넣으면 평균이 90일로 튄다.
const CYCLE_MIN = 15;
const CYCLE_MAX = 60;
const PERIOD_MAX = 14;
const RECENT = 6;
// 달력 계산법: 배란 = 다음 예정 − 14일, 가임기 = 배란 −5일 ~ +1일.
const LUTEAL_DAYS = 14;
const FERTILE_BEFORE = 5;
const FERTILE_AFTER = 1;

export interface CycleEventLike {
  date: Date | string;
  kind: string;
  result?: string | null;
}

export interface Period {
  start: Date;
  /** 끝난 날을 안 적었으면 null */
  end: Date | null;
  /** 끝-시작+1. 끝을 모르면 null */
  length: number | null;
}

export interface CyclePrediction {
  lastStart: Date;
  /** 오늘이 이번 주기 며칠째인지(시작일 = 1) */
  cycleDay: number;
  avgCycle: number;
  avgPeriod: number;
  /** records = 기록으로 낸 평균, default = 기록이 모자라 기본 28일 */
  basis: "records" | "default";
  nextStart: Date;
  /** 다음 예정일까지 남은 날. 지났으면 음수 */
  daysUntilNext: number;
  /** 예정일에서 지난 날(지나지 않았으면 0). 굴려서 다음 달로 넘기지 않는다 */
  lateDays: number;
  ovulation: Date;
  fertileStart: Date;
  fertileEnd: Date;
}

const dayOf = (d: Date | string) => startOfDay(new Date(d));

/** 날짜순, 같은 날은 하나만 */
function uniqueDays(days: Date[]): Date[] {
  const seen = new Set<number>();
  return [...days]
    .sort((a, b) => a.getTime() - b.getTime())
    .filter((d) => (seen.has(d.getTime()) ? false : (seen.add(d.getTime()), true)));
}

const mean = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;

/** 생리 기간들(시작 날짜순). 끝 = 그 시작 이후·다음 시작 이전의 첫 "생리 끝". 짝 없는 끝은 버린다. */
export function periodsFrom(events: CycleEventLike[]): Period[] {
  const starts = uniqueDays(events.filter((e) => e.kind === "periodStart").map((e) => dayOf(e.date)));
  const ends = uniqueDays(events.filter((e) => e.kind === "periodEnd").map((e) => dayOf(e.date)));
  return starts.map((start, i) => {
    const next = starts[i + 1];
    const end =
      ends.find((e) => e.getTime() >= start.getTime() && (!next || e.getTime() < next.getTime())) ?? null;
    return { start, end, length: end ? differenceInCalendarDays(end, start) + 1 : null };
  });
}

/** 다음 예정일·배란 예정일·가임기(전부 추정). 오늘까지의 시작 기록이 없으면 null. */
export function predictCycle(events: CycleEventLike[], today: Date = new Date()): CyclePrediction | null {
  const t = dayOf(today);
  // 미래 날짜로 잘못 적은 시작은 뺀다 — 그걸 기준으로 삼으면 "주기 -20일째" 가 된다.
  const periods = periodsFrom(events).filter((p) => p.start.getTime() <= t.getTime());
  if (periods.length === 0) return null;

  const gaps: number[] = [];
  for (let i = 1; i < periods.length; i++) {
    const gap = differenceInCalendarDays(periods[i].start, periods[i - 1].start);
    if (gap >= CYCLE_MIN && gap <= CYCLE_MAX) gaps.push(gap);
  }
  const recentGaps = gaps.slice(-RECENT);
  const basis = recentGaps.length > 0 ? "records" : "default";
  const avgCycle = recentGaps.length > 0 ? Math.round(mean(recentGaps)) : DEFAULT_CYCLE;

  const lengths = periods
    .map((p) => p.length)
    .filter((n): n is number => n !== null && n >= 1 && n <= PERIOD_MAX)
    .slice(-RECENT);
  const avgPeriod = lengths.length > 0 ? Math.round(mean(lengths)) : DEFAULT_PERIOD;

  const lastStart = periods[periods.length - 1].start;
  const nextStart = addDays(lastStart, avgCycle);
  const daysUntilNext = differenceInCalendarDays(nextStart, t);
  const ovulation = addDays(nextStart, -LUTEAL_DAYS);

  return {
    lastStart,
    cycleDay: differenceInCalendarDays(t, lastStart) + 1,
    avgCycle,
    avgPeriod,
    basis,
    nextStart,
    daysUntilNext,
    lateDays: Math.max(0, -daysUntilNext),
    ovulation,
    fertileStart: addDays(ovulation, -FERTILE_BEFORE),
    fertileEnd: addDays(ovulation, FERTILE_AFTER),
  };
}
```

Run: `npx vitest run lib/cycle.test.ts` → Expected: PASS (14 tests).

- [ ] **Step 5: `lib/journey.test.ts` 먼저 (실패 확인)**

```ts
import { describe, it, expect } from "vitest";
import { stageOf, journeyMarks, firstLineOf } from "./journey";
import { predictCycle } from "./cycle";

const d = (s: string) => {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
};
const preg = (over: Partial<{ birthDate: Date | null; dueDate: Date; nickname: string }> = {}) => ({
  id: "p1", nickname: "콩이", emoji: "🌱", color: "rose", dueDate: d("2027-05-01"),
  birthDate: null, endedAt: null, createdAt: d("2026-09-01"), updatedAt: d("2026-09-01"), ...over,
});
const ev = (date: string, kind: string, result: string | null = null) =>
  ({ id: date + kind, date: d(date), kind, result, createdAt: d(date) });
const hosp = (date: string, content: string) =>
  ({ id: "h" + date, date: d(date), kind: "checkup", mood: null, content, authorId: null, pregnancyId: null, createdAt: d(date), updatedAt: d(date) });

describe("stageOf", () => {
  it("진행 중인 임신 없음 → prep, 있음 → pregnant, 출생일 → born", () => {
    expect(stageOf(null)).toBe("prep");
    expect(stageOf(preg())).toBe("pregnant");
    expect(stageOf(preg({ birthDate: d("2027-05-02") }))).toBe("born");
  });
});

describe("journeyMarks", () => {
  const events = [ev("2026-09-01", "periodStart"), ev("2026-09-04", "periodEnd"), ev("2026-09-29", "periodStart")];
  const today = d("2026-10-05");

  it("준비: 기록된 생리 · 예정(추정) · 가임기(추정) · 배란 예정(추정)", () => {
    const marks = journeyMarks({ stage: "prep", active: null, cycleEvents: events, prediction: predictCycle(events, today), upcomingHospital: [] });
    const of = (k: string) => marks.filter((m) => m.kind === k).map((m) => m.date);
    expect(of("period")).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-29"]);
    // 평균 28 → 다음 10/27, 생리 길이 4일
    expect(of("periodPredicted")).toEqual(["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);
    expect(of("ovulation")).toEqual(["2026-10-13"]);
    expect(of("fertile")).toEqual(["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-14"]);
    for (const m of marks.filter((m) => m.kind !== "period")) expect(m.label).toContain("추정");
  });
  it("예정일이 지났으면 예정·가임기를 그리지 않는다", () => {
    const late = predictCycle(events, d("2026-11-10"));
    const marks = journeyMarks({ stage: "prep", active: null, cycleEvents: events, prediction: late, upcomingHospital: [] });
    expect(marks.some((m) => m.kind !== "period")).toBe(false);
  });
  it("임신: 주기 표시는 없고 출산 예정일이 있다", () => {
    const marks = journeyMarks({ stage: "pregnant", active: preg(), cycleEvents: events, prediction: null, upcomingHospital: [] });
    expect(marks.map((m) => m.kind)).toEqual(["due"]);
    expect(marks[0]).toMatchObject({ date: "2027-05-01", label: "콩이 출산 예정일" });
  });
  it("병원 기록은 단계와 상관없이 첫 줄로", () => {
    const h = [hosp("2026-10-20", "## 산부인과 상담\n물어볼 것")];
    for (const stage of ["prep", "pregnant", "born"] as const) {
      const marks = journeyMarks({ stage, active: stage === "prep" ? null : preg(), cycleEvents: [], prediction: null, upcomingHospital: h });
      expect(marks.find((m) => m.kind === "hospital")).toMatchObject({ date: "2026-10-20", label: "병원 · 산부인과 상담" });
    }
  });
});

describe("firstLineOf", () => {
  it("마크다운 기호를 떼고 첫 줄만, 길면 줄인다", () => {
    expect(firstLineOf("\n\n> **안녕** 하세요\n둘째 줄")).toBe("안녕 하세요");
    expect(firstLineOf("가".repeat(40), 10)).toBe("가".repeat(10) + "…");
    expect(firstLineOf("![사진](/uploads/a.png)")).toBe("사진");
  });
});
```

Run: `npx vitest run lib/journey.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 6: `lib/journey.ts` 구현**

```ts
// 아기 페이지의 "지금 상태" 를 한 곳에서 읽는다 — 홈 · 달력 · 포동이가 모두 이것을 부른다.
// (아기 페이지 자체는 일기 전체가 필요해 page.tsx 가 따로 읽는다.)
// 홈은 요청당 SQL 이 16개로 재여 있다(2026-09-23). 여기서 다섯 개를 쓴다 — 늘리면 다시 잴 것.
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { predictCycle, periodsFrom, type CyclePrediction } from "@/lib/cycle";
import { startOfDay, toDateInput, isSameDay } from "@/lib/date";
import type { CycleEvent, FamilyMember, JourneyEntry, Pregnancy } from "@prisma/client";

export type Stage = "prep" | "pregnant" | "born";

/** 단계는 저장하지 않고 계산한다: 진행 중인 임신 없음 = 준비, 있음 = 임신, 출생일 = 출생 */
export function stageOf(active: Pick<Pregnancy, "birthDate"> | null): Stage {
  if (!active) return "prep";
  return active.birthDate ? "born" : "pregnant";
}

export interface JourneyState {
  showOnHome: boolean;
  /** 진행 중인 임신(endedAt 없음). 없으면 준비 단계 */
  active: Pregnancy | null;
  stage: Stage;
  /** 날짜순 전부(작은 표다) */
  cycleEvents: CycleEvent[];
  /** 준비 단계일 때만 계산한다. 임신 중에는 null */
  prediction: CyclePrediction | null;
  latestEntry: (JourneyEntry & { author: FamilyMember | null }) | null;
  /** 오늘 이후 병원 기록(가까운 순, 20개까지) */
  upcomingHospital: JourneyEntry[];
  /** 홈 초대 줄을 띄울지: 임신·일기·주기 중 무엇이든 있으면 */
  hasAnything: boolean;
}

export async function journeyState(today: Date = new Date()): Promise<JourneyState> {
  const t = startOfDay(today);
  const [settings, active, cycleEvents, latestEntry, upcomingHospital] = await Promise.all([
    prisma.journeySettings.findUnique({ where: { id: "main" } }),
    prisma.pregnancy.findFirst({ where: { endedAt: null }, orderBy: { createdAt: "desc" } }),
    prisma.cycleEvent.findMany({ orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    prisma.journeyEntry.findFirst({
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: { author: true },
    }),
    prisma.journeyEntry.findMany({
      where: { kind: "checkup", date: { gte: t } },
      orderBy: { date: "asc" },
      take: 20,
    }),
  ]);
  const stage = stageOf(active);
  return {
    showOnHome: settings?.showOnHome ?? false,
    active,
    stage,
    cycleEvents,
    prediction: stage === "prep" ? predictCycle(cycleEvents, today) : null,
    latestEntry,
    upcomingHospital,
    hasAnything: Boolean(active || latestEntry || cycleEvents.length > 0),
  };
}

export type MarkKind = "period" | "periodPredicted" | "fertile" | "ovulation" | "hospital" | "due";

/** 달력에 얹는 읽기 전용 표시. CalendarEvent 로 저장하지 않는다(주기를 적을 때마다 다시 맞춰야 한다). */
export interface JourneyMark {
  /** "yyyy-MM-dd" */
  date: string;
  kind: MarkKind;
  label: string;
}

/** 마크다운 첫 줄을 글자로. 기호(#·>·*·-·`)와 이미지·링크 껍데기를 걷어낸다. */
export function firstLineOf(content: string, max = 24): string {
  const line =
    content
      .split("\n")
      .map((l) =>
        l
          .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
          .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
          .replace(/^[\s#>*\-+]+/, "")
          .replace(/[*_`~]/g, "")
          .trim()
      )
      .find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

function eachDay(from: Date, to: Date, fn: (d: Date) => void) {
  for (let d = startOfDay(from); d.getTime() <= startOfDay(to).getTime(); d = addDays(d, 1)) fn(d);
}

export function journeyMarks(
  s: Pick<JourneyState, "stage" | "active" | "cycleEvents" | "prediction" | "upcomingHospital">
): JourneyMark[] {
  const out: JourneyMark[] = [];
  const push = (d: Date, kind: MarkKind, label: string) => out.push({ date: toDateInput(d), kind, label });

  // 주기 표시는 준비 단계에서만 — 임신 중에 "다음 생리 예정" 을 그리면 안 된다.
  if (s.stage === "prep") {
    for (const p of periodsFrom(s.cycleEvents)) eachDay(p.start, p.end ?? p.start, (d) => push(d, "period", "생리"));
    const pr = s.prediction;
    // 예정일이 지났으면 예정·가임기를 그리지 않는다 — 지난 날짜에 "예정" 을 칠하면 거짓말이다.
    if (pr && pr.lateDays === 0) {
      eachDay(pr.nextStart, addDays(pr.nextStart, pr.avgPeriod - 1), (d) =>
        push(d, "periodPredicted", "생리 예정 (추정)")
      );
      eachDay(pr.fertileStart, pr.fertileEnd, (d) =>
        isSameDay(d, pr.ovulation) ? push(d, "ovulation", "배란 예정 (추정)") : push(d, "fertile", "가임기 (추정)")
      );
    }
  }
  for (const h of s.upcomingHospital) push(h.date, "hospital", `병원 · ${firstLineOf(h.content) || "진료"}`);
  if (s.stage === "pregnant" && s.active) push(s.active.dueDate, "due", `${s.active.nickname} 출산 예정일`);
  return out;
}
```

Run: `npx vitest run lib/journey.test.ts lib/cycle.test.ts` → Expected: PASS.

- [ ] **Step 7: `lib/types.ts`**

import·export 목록에서 `Baby, BabyEntry, BabyChecklistItem, BabyLink` 를 빼고 `Pregnancy, JourneyEntry, JourneyChecklistItem, JourneyLink, CycleEvent` 를 넣는다. 파일 끝의 `BabyEntryWithAuthor`·`BabyDetail` 를 아래로 바꾼다.

```ts
export type JourneyEntryWithAuthor = JourneyEntry & { author: FamilyMember | null };

/** 아기 페이지가 서버에서 받는 것. 체크리스트는 지금 단계 것만(준비 = pregnancyId null). */
export interface JourneyPageData {
  showOnHome: boolean;
  active: Pregnancy | null;
  entries: JourneyEntryWithAuthor[];
  checklist: JourneyChecklistItem[];
  links: JourneyLink[];
  cycleEvents: CycleEvent[];
}
```

- [ ] **Step 8: `lib/uploads.ts`** — `prisma.babyEntry.count(...)` 를 `prisma.journeyEntry.count(...)` 로(변수 이름 `inEntry` 그대로).

- [ ] **Step 9: `prisma/seed.ts`** — 정리 단계의 `babyChecklistItem/babyEntry/baby.deleteMany()` 세 줄을 아래로 바꾸고(FK 순서), 아기 견본(`console.log("🌱 아기...")` 부터 `babyChecklistItem.createMany` 끝까지)을 준비 단계 견본으로 바꾼다.

```ts
  await prisma.journeyChecklistItem.deleteMany();
  await prisma.journeyEntry.deleteMany();
  await prisma.journeyLink.deleteMany();
  await prisma.cycleEvent.deleteMany();
  await prisma.pregnancy.deleteMany();
  await prisma.journeySettings.deleteMany();
```

```ts
  console.log("🌱 아기 준비...");
  // 준비 단계 견본: 주기 두 번(28일 간격) + 테스트기 + 일기 둘 + 다가오는 병원 하나.
  await prisma.cycleEvent.createMany({
    data: [
      { date: addDays(today(), -40), kind: "periodStart" },
      { date: addDays(today(), -36), kind: "periodEnd" },
      { date: addDays(today(), -12), kind: "periodStart" },
      { date: addDays(today(), -8), kind: "periodEnd" },
      { date: addDays(today(), -1), kind: "ovulationTest", result: "faint" },
    ],
  });
  await prisma.journeyEntry.createMany({
    data: [
      { date: addDays(today(), -3), kind: "diary", mood: "🙂", content: "같이 산책하면서 이야기 많이 했어요 🌿", authorId: eomma.id },
      { date: addDays(today(), -3), kind: "letter", content: "언젠가 만날 우리 아기에게 💌", authorId: appa.id },
      { date: addDays(today(), 9), kind: "checkup", content: "병원 상담 예약 🩺", authorId: eomma.id },
    ],
  });
  await prisma.journeyChecklistItem.createMany({
    data: [
      { text: "다닐 병원 알아보기", sortOrder: 0 },
      { text: "함께 이야기 나누기", done: true, sortOrder: 1 },
    ],
  });
```

- [ ] **Step 10: 확인**

Run: `npx prisma validate && npx prisma generate && npm test` → Expected: 시험 전부 PASS.
Run: `npx tsc --noEmit 2>&1 | grep -E "^(lib/(cycle|journey|types|uploads)|prisma/)"` → Expected: 출력 없음.
(앱의 다른 파일 — `app/api/baby*`, `app/baby/*`, `app/page.tsx`, `lib/agent/resources.ts` — 은 T2~T6 이 고칠 때까지 오류가 난다. 정상이다.)

---

### Lead L1: 로컬 DB 반영 · ensure.sql 대조 (리드가 직접)

- [ ] `npx prisma db push --accept-data-loss` (로컬. 옛 Baby* 네 표가 지워진다 — 사용자에게 알렸다.)
- [ ] 운영 흉내 DB: `createdb podong_ensure_check` → 커밋 `HEAD`(T1 이전) 스키마로 `prisma db push`(옛 표 포함) → `psql -f prisma/ensure.sql` **두 번**(둘 다 오류 없음) → `prisma migrate diff --from-url postgresql://ascentai@localhost:5432/podong_ensure_check --to-schema-datamodel prisma/schema.prisma --script` 에 새 여섯 표 관련 줄이 **0줄**(옛 표 DROP 줄만) → `dropdb podong_ensure_check`.
- [ ] `npm run db:seed` → 준비 견본이 들어간다(로컬 계정은 seed 가 덮지 않는다).
- [ ] 커밋: `git add prisma lib && git commit`.

---

### Task 2: API 라우트

**Files:**
- Modify: `app/api/baby/route.ts` (전체 교체)
- Create: `app/api/pregnancy/route.ts`, `app/api/pregnancy/[id]/route.ts`, `app/api/pregnancy/[id]/end/route.ts`
- Modify: `app/api/baby-entries/route.ts`, `app/api/baby-entries/[id]/route.ts`, `app/api/baby-checklist/route.ts`, `app/api/baby-checklist/[id]/route.ts`, `app/api/baby-links/route.ts`, `app/api/baby-links/[id]/route.ts`
- Create: `app/api/cycle-events/route.ts`, `app/api/cycle-events/[id]/route.ts`

**Interfaces:**
- Consumes: T1 의 Prisma 대리자, `CYCLE_KINDS`·`TEST_RESULTS`, `imageUrlsIn`·`sweepUploads`(`lib/uploads.ts`), `parseDateInput`·`dueDateFromLmp`·`startOfDay`(`lib/date.ts`), `normalizeUrl`(`lib/url.ts`), `PALETTE_KEYS`.
- Produces (T3·T4·T6·T7 이 부르는 계약):

| 요청 | 본문 | 응답 |
|---|---|---|
| `GET /api/baby` | — | `{ stage, showOnHome, active: { id, nickname, dueDate, birthDate } \| null }` |
| `PATCH /api/baby` | `{ showOnHome: boolean }` | `{ showOnHome }` |
| `DELETE /api/baby` | — | `{ ok: true }` (여섯 표 전부 + 사진) |
| `POST /api/pregnancy` | `{ nickname?, emoji?, color?, dueDate? \| lmpDate? }` | `Pregnancy` · 진행 중 있으면 **409** `{ error }` · 날짜 없으면 400 |
| `PATCH /api/pregnancy/[id]` | `{ nickname?, emoji?, color?, dueDate?, birthDate?: string \| null }` | `Pregnancy` · 없으면 404 |
| `POST /api/pregnancy/[id]/end` | `{ keep: boolean }` | `{ ok: true }` · keep 이 boolean 아니면 400 |
| `POST /api/baby-entries` | `{ content, date?, kind?, mood?, authorId? }` | `JourneyEntryWithAuthor` (서버가 `pregnancyId` 를 찍음) |
| `PATCH /api/baby-entries/[id]` | `{ content?, date?, kind?, mood?, authorId? }` | `JourneyEntryWithAuthor` |
| `DELETE /api/baby-entries/[id]` | — | `{ ok: true }` |
| `POST /api/baby-checklist` | `{ text }` 또는 `{ texts: string[] }` | 항목 하나 또는 배열 (서버가 지금 단계를 찍음) |
| `PATCH/DELETE /api/baby-checklist/[id]` | `{ done?, text? }` | 항목 / `{ ok: true }` |
| `POST /api/baby-links` | `{ url, title? }` | `JourneyLink` |
| `PATCH/DELETE /api/baby-links/[id]` | `{ title?, url? }` | 링크 / `{ ok: true }` |
| `POST /api/cycle-events` | `{ date?, kind, result? }` | `CycleEvent`(같은 날·같은 종류·같은 결과면 **있던 행**) · 잘못된 kind/result 400 |
| `DELETE /api/cycle-events/[id]` | — | `{ ok: true }` |

`babyId` 는 어디서도 받지 않는다(보내도 무시).

- [ ] **Step 1: `app/api/baby/route.ts` 전체 교체**

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { imageUrlsIn, sweepUploads } from "@/lib/uploads";
import { stageOf } from "@/lib/journey";

/** 지금 단계와 홈 표시 — 검사(ui-flows)·홈 초대 줄이 쓴다 */
export async function GET() {
  const [settings, active] = await Promise.all([
    prisma.journeySettings.findUnique({ where: { id: "main" } }),
    prisma.pregnancy.findFirst({
      where: { endedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, nickname: true, dueDate: true, birthDate: true },
    }),
  ]);
  return NextResponse.json({ stage: stageOf(active), showOnHome: settings?.showOnHome ?? false, active });
}

/** 페이지 설정 — 지금은 홈 표시 하나. 싱글턴이라 없으면 만든다 */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (typeof body?.showOnHome !== "boolean") {
    return NextResponse.json({ error: "바꿀 설정이 없어요." }, { status: 400 });
  }
  const s = await prisma.journeySettings.upsert({
    where: { id: "main" },
    create: { id: "main", showOnHome: body.showOnHome },
    update: { showOnHome: body.showOnHome },
  });
  return NextResponse.json({ showOnHome: s.showOnHome });
}

/** 처음부터 다시 시작: 아기 페이지의 모든 기록(주기 기록·임신·설정 포함)을 지운다 */
export async function DELETE() {
  // 사진 주소는 **지우기 전에** 챙긴다 — 일기가 사라지면 읽을 본문이 없다.
  const entries = await prisma.journeyEntry.findMany({ select: { content: true } });
  const urls = entries.flatMap((e) => imageUrlsIn(e.content));
  // 전부 deleteMany — 이미 비어 있으면 0건을 지우고 끝난다. 두 번 눌러도 같은 결과다.
  // 자식(일기·체크리스트)부터 지우면 FK 순서를 신경 쓸 일이 없다.
  await prisma.$transaction([
    prisma.journeyEntry.deleteMany({}),
    prisma.journeyChecklistItem.deleteMany({}),
    prisma.journeyLink.deleteMany({}),
    prisma.cycleEvent.deleteMany({}),
    prisma.pregnancy.deleteMany({}),
    prisma.journeySettings.deleteMany({}),
  ]);
  // 행을 지운 뒤에 훑는다: "아직 어디서 쓰이나" 를 세므로 순서가 바뀌면 하나도 못 지운다.
  await sweepUploads(urls);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: `app/api/pregnancy/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PALETTE_KEYS } from "@/lib/colors";
import { dueDateFromLmp, parseDateInput } from "@/lib/date";

const COLORS = new Set<string>(PALETTE_KEYS);

/** 임신을 확인했어요: 예정일(또는 마지막 생리일)로 시작. 태명은 비워도 된다 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const lmp = parseDateInput(body?.lmpDate);
  const dueDate = parseDateInput(body?.dueDate) ?? (lmp ? dueDateFromLmp(lmp) : null);
  if (!dueDate) {
    return NextResponse.json({ error: "출산 예정일 또는 마지막 생리일을 알려 주세요." }, { status: 400 });
  }
  // 진행 중인 임신은 하나뿐이다 — 두 폰에서 동시에 누르면 둘이 생겨 단계와 도장이 꼬인다.
  const existing = await prisma.pregnancy.findFirst({ where: { endedAt: null }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "이미 임신 단계예요. 새로고침해 주세요." }, { status: 409 });
  }
  const nickname = String(body?.nickname ?? "").trim();
  const pregnancy = await prisma.pregnancy.create({
    data: {
      dueDate,
      ...(nickname ? { nickname } : {}),
      emoji: String(body?.emoji ?? "").trim() || "🌱",
      color: COLORS.has(body?.color) ? body.color : "rose",
    },
  });
  return NextResponse.json(pregnancy);
}
```

- [ ] **Step 3: `app/api/pregnancy/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PALETTE_KEYS } from "@/lib/colors";
import { parseDateInput } from "@/lib/date";

const COLORS = new Set<string>(PALETTE_KEYS);

/** 임신 설정 부분 수정 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const data: Record<string, unknown> = {};
  if (typeof body?.nickname === "string" && body.nickname.trim()) data.nickname = body.nickname.trim();
  if (typeof body?.emoji === "string" && body.emoji.trim()) data.emoji = body.emoji.trim();
  if (typeof body?.color === "string" && COLORS.has(body.color)) data.color = body.color;
  const due = parseDateInput(body?.dueDate);
  if (due) data.dueDate = due;
  if (body?.birthDate === null) data.birthDate = null;
  else {
    const birth = parseDateInput(body?.birthDate);
    if (birth) data.birthDate = birth;
  }
  // update 는 없는 행에 P2025(500)를 던진다 — 누가 먼저 "준비 단계로 · 지우기" 를 했을 수 있다.
  const { count } = await prisma.pregnancy.updateMany({ where: { id }, data });
  if (count === 0) return NextResponse.json({ error: "이미 없는 임신 기록이에요." }, { status: 404 });
  return NextResponse.json(await prisma.pregnancy.findUnique({ where: { id } }));
}
```

- [ ] **Step 4: `app/api/pregnancy/[id]/end/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { imageUrlsIn, sweepUploads } from "@/lib/uploads";

/**
 * 준비 단계로 돌아간다.
 * - keep: true  → endedAt 만 찍는다. 그 기간 일기는 타임라인에 남는다(이미 끝났으면 그대로).
 * - keep: false → 그 임신을 지운다. 도장 찍힌 일기·체크리스트가 cascade 로 같이 사라진다.
 *   **이미 끝난(남기기 했던) 임신도 지운다** — 안 그러면 한 번 남긴 기간은 전체 리셋 말고는 지울 길이 없다.
 * 둘 다 몇 번 불러도 같은 결과다.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (typeof body?.keep !== "boolean") {
    return NextResponse.json({ error: "남길지 지울지 골라 주세요." }, { status: 400 });
  }
  if (body.keep) {
    await prisma.pregnancy.updateMany({ where: { id, endedAt: null }, data: { endedAt: new Date() } });
    return NextResponse.json({ ok: true });
  }
  // 사진 주소는 지우기 전에 — cascade 로 일기가 사라지면 본문을 못 읽는다.
  const entries = await prisma.journeyEntry.findMany({ where: { pregnancyId: id }, select: { content: true } });
  await prisma.pregnancy.deleteMany({ where: { id } });
  await sweepUploads(entries.flatMap((e) => imageUrlsIn(e.content)));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: 일기 라우트**

`app/api/baby-entries/route.ts` 전체:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateInput } from "@/lib/date";

const KINDS = new Set(["diary", "checkup", "letter"]);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const content = String(body?.content ?? "").trim();
  if (!content) {
    return NextResponse.json({ error: "내용을 적어 주세요." }, { status: 400 });
  }
  const date = body?.date ? parseDateInput(body.date) : new Date();
  if (!date) {
    return NextResponse.json({ error: "날짜를 확인해 주세요." }, { status: 400 });
  }
  // 도장은 서버가 찍는다: 지금 진행 중인 임신. 준비 단계면 null.
  // 클라이언트 값을 믿지 않는다 — "준비 단계로 · 지우기" 가 지울 범위가 이 값이다.
  const active = await prisma.pregnancy.findFirst({ where: { endedAt: null }, select: { id: true } });
  const entry = await prisma.journeyEntry.create({
    data: {
      date,
      kind: KINDS.has(body.kind) ? body.kind : "diary",
      mood: typeof body.mood === "string" && body.mood.trim() ? body.mood.trim() : null,
      content,
      authorId: body.authorId || null,
      pregnancyId: active?.id ?? null,
    },
    include: { author: true },
  });
  return NextResponse.json(entry);
}
```

`app/api/baby-entries/[id]/route.ts`: 지금 파일에서 `prisma.babyEntry` 세 곳을 `prisma.journeyEntry` 로 바꾼다. 그리고 PATCH 의 `prisma.babyEntry.update(...)` 는 없는 행에 500 을 던지므로 아래로 바꾼다:

```ts
  const { count } = await prisma.journeyEntry.updateMany({ where: { id }, data });
  if (count === 0) return NextResponse.json({ error: "이미 지워진 기록이에요." }, { status: 404 });
  const entry = await prisma.journeyEntry.findUnique({ where: { id }, include: { author: true } });
```

- [ ] **Step 6: 체크리스트 라우트**

`app/api/baby-checklist/route.ts` 전체:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** 단건 { text } 또는 일괄 { texts }. 지금 단계에 붙는다: 임신 중이면 그 임신, 아니면 준비 체크리스트 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const texts: string[] = Array.isArray(body?.texts)
    ? body.texts.map((t: unknown) => String(t ?? "").trim()).filter(Boolean)
    : [String(body?.text ?? "").trim()].filter(Boolean);
  if (texts.length === 0) {
    return NextResponse.json({ error: "내용을 입력해 주세요." }, { status: 400 });
  }
  const active = await prisma.pregnancy.findFirst({ where: { endedAt: null }, select: { id: true } });
  const pregnancyId = active?.id ?? null;
  const last = await prisma.journeyChecklistItem.findFirst({
    where: { pregnancyId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const base = (last?.sortOrder ?? -1) + 1;
  const items = await prisma.journeyChecklistItem.createManyAndReturn({
    data: texts.map((text, i) => ({ text, pregnancyId, sortOrder: base + i })),
  });
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  return NextResponse.json(Array.isArray(body?.texts) ? sorted : sorted[0]);
}
```

`app/api/baby-checklist/[id]/route.ts`: `prisma.babyChecklistItem` → `prisma.journeyChecklistItem`. PATCH 의 `update` 를 `updateMany` + `count === 0 → 404 { error: "이미 지워진 항목이에요." }` + `findUnique` 로.

- [ ] **Step 7: 참고 사이트 라우트**

`app/api/baby-links/route.ts`: `babyId` 확인 블록을 지우고, `findFirst` 의 `where: { babyId: body.babyId }` 를 빼고, `prisma.babyLink` → `prisma.journeyLink`, `data` 에서 `babyId` 를 뺀다. `[id]/route.ts` 도 `prisma.journeyLink` 로, PATCH 는 `updateMany` + 404 + `findUnique`.

- [ ] **Step 8: 주기 기록 라우트**

`app/api/cycle-events/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateInput, startOfDay } from "@/lib/date";
import { CYCLE_KINDS, TEST_RESULTS, type CycleKind, type TestResult } from "@/lib/cycle";

/** 주기 기록 하나 { date?, kind, result? } — 날짜를 비우면 오늘 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const kind = body?.kind as CycleKind;
  if (!CYCLE_KINDS.includes(kind)) {
    return NextResponse.json({ error: "무엇을 적을지 골라 주세요." }, { status: 400 });
  }
  const result = kind === "ovulationTest" ? (body?.result as TestResult) : null;
  if (kind === "ovulationTest" && !TEST_RESULTS.includes(result as TestResult)) {
    return NextResponse.json({ error: "테스트기 결과를 골라 주세요." }, { status: 400 });
  }
  const date = body?.date ? parseDateInput(body.date) : startOfDay(new Date());
  if (!date) {
    return NextResponse.json({ error: "날짜를 확인해 주세요." }, { status: 400 });
  }
  // 같은 날 같은 사건은 한 번만 — 포동이와 사람이 같은 날을 두 번 적어도 계산이 흔들리지 않게.
  // 결과가 다른 테스트기는 따로 남긴다(하루에 두 번 검사할 수 있다).
  const same = await prisma.cycleEvent.findFirst({ where: { date, kind, result } });
  if (same) return NextResponse.json(same);
  return NextResponse.json(await prisma.cycleEvent.create({ data: { date, kind, result } }));
}
```

`app/api/cycle-events/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // deleteMany — 이미 없으면 0건. 두 번 눌러도 200 이라 화면이 지운 줄을 되살리지 않는다.
  await prisma.cycleEvent.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 9: 확인**

Run: `npx tsc --noEmit 2>&1 | grep "^app/api/"` → Expected: 출력 없음. `npm run lint` → 0 problems(다른 작업 파일의 오류는 보고만). `npm test` → PASS.

---

### Task 3: 아기 페이지 화면 (`app/baby/*`)

**Files:**
- Modify: `app/baby/page.tsx`, `baby-client.tsx`, `baby-hero.tsx`, `baby-settings-modal.tsx`, `entry-timeline.tsx`, `entry-modal.tsx`, `baby-checklist.tsx`, `baby-links.tsx`, `baby-meta.ts`
- Create: `app/baby/prep-hero.tsx`, `cycle-card.tsx`, `cycle-event-modal.tsx`, `pregnancy-start-modal.tsx`, `back-to-prep-modal.tsx`, `journey-settings-modal.tsx`
- Delete: `app/baby/baby-setup.tsx`
- **건드리지 않음:** `app/baby/baby-home-invite.tsx`(T4)

**Interfaces:**
- Consumes: T2 의 API 표 그대로. `JourneyPageData`·`JourneyEntryWithAuthor`·`Pregnancy`·`CycleEvent`·`JourneyChecklistItem`·`JourneyLink`(`lib/types.ts`), `stageOf`·`Stage`(`lib/journey.ts`), `predictCycle`·`periodsFrom`·`CYCLE_KIND_META`·`TEST_RESULT_META`·`CycleKind`·`TestResult`(`lib/cycle.ts`).
- Produces: 화면만.

- [ ] **Step 1: `page.tsx`** — 한 번에 읽어 `<BabyClient initial={…} members={…} />`:

```ts
export default async function BabyPage() {
  const active = await prisma.pregnancy.findFirst({ where: { endedAt: null }, orderBy: { createdAt: "desc" } });
  const [entries, checklist, links, cycleEvents, settings, members] = await Promise.all([
    prisma.journeyEntry.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }], include: { author: true } }),
    // 지금 단계 것만: 임신 중이면 그 임신의 체크리스트, 아니면 준비 체크리스트(pregnancyId null)
    prisma.journeyChecklistItem.findMany({ where: { pregnancyId: active?.id ?? null }, orderBy: { sortOrder: "asc" } }),
    prisma.journeyLink.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.cycleEvent.findMany({ orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    prisma.journeySettings.findUnique({ where: { id: "main" } }),
    prisma.familyMember.findMany({ orderBy: { createdAt: "asc" } }),
  ]);
  return (
    // key 가 단계(진행 중인 임신)를 따른다 — BabyClient 는 useState(initial) 로 시작하므로
    // router.refresh() 만으로는 상태가 바뀌지 않는다. 임신을 시작하거나 끝내면 key 가 바뀌어
    // 새 단계의 데이터(특히 그 단계의 체크리스트)로 다시 붙는다.
    <BabyClient
      key={active?.id ?? "prep"}
      initial={{ showOnHome: settings?.showOnHome ?? false, active, entries, checklist, links, cycleEvents }}
      members={members}
    />
  );
}
```

- [ ] **Step 2: `baby-meta.ts`** — `checkup` 을 `{ label: "병원", emoji: "🩺", color: "sky", placeholder: "병원에서 들은 이야기, 검사 결과를 남겨요" }` 로. `DEFAULT_CHECKLIST` 위 주석에 "임신 단계에서만 쓴다(준비 단계 기본 항목은 일부러 없다 — 무엇을 넣어도 의료 조언이 된다)" 를 더한다. `AUTHOR_STORAGE_KEY` 는 그대로(`lib/me.ts` 가 읽는다).

- [ ] **Step 3: `baby-client.tsx` 상태와 처리**

상태: `active`(Pregnancy|null), `entries`, `checklist`, `links`, `cycleEvents`, `showOnHome`, 모달 상태들. `stage = stageOf(active)`, `prediction = stage === "prep" ? predictCycle(cycleEvents) : null`.

처리 함수(전부 기존 패턴: `fetch(...).catch(() => null)`, 실패 시 되돌리기 + `alert(...)`):
- `createEntry/saveEntry/deleteEntry`: 지금 것 그대로, 본문에서 `babyId` 를 뺀다.
- `addCheck(text)`, `addDefaultChecks()`(임신 단계에서만 버튼), `toggleCheck`, `removeCheck`: 지금 것, `babyId` 뺌.
- `addLink/editLinkTitle/removeLink`: 지금 것, `babyId` 뺌.
- `addCycleEvent({ date, kind, result })`: `POST /api/cycle-events` → 받은 행을 `cycleEvents` 에 넣고(같은 id 가 이미 있으면 넣지 않는다 — 서버가 중복이면 있던 행을 돌려준다) 날짜순 정렬. 실패: `alert("기록하지 못했어요. 잠시 후 다시 시도해 주세요.")`.
- `removeCycleEvent(id)`: 낙관적 제거 → `DELETE /api/cycle-events/[id]` → 실패 시 되돌림. **묻지 않는다**(다시 적기 3초 — DESIGN 의 장보기 규칙).
- `startPregnancy(payload)`: `POST /api/pregnancy` → 성공 시 모달 닫고 `router.refresh()` — page.tsx 의 `key` 가 바뀌어 임신 단계 데이터로 다시 붙는다(그동안 버튼은 busy). 409 면 서버 `error` 를 `alert` 하고 `router.refresh()`.
- `savePregnancy(patch)`: `PATCH /api/pregnancy/[id]`(지금 `saveSettings` 와 같은 낙관적 방식).
- `endPregnancy(keep)`: `POST /api/pregnancy/[id]/end { keep }` → **서버 성공 후에만** 모달 닫고 `router.refresh()`(key 가 `"prep"` 으로 바뀌어 준비 체크리스트·남은 일기로 다시 붙는다). 실패: `alert("바꾸지 못했어요. 잠시 후 다시 시도해 주세요.")` 하고 아무것도 안 바꾼다.
- `setHome(v)`: `PATCH /api/baby { showOnHome: v }` 낙관적.
- `resetAll()`: 지금의 `resetBaby` 와 같은 흐름(설정 창 닫기 → confirm → `DELETE /api/baby` → 성공 후에만 전부 빈 값·`showOnHome=false` 로 두고 `router.refresh()` — 임신 단계였다면 key 가 바뀌어 빈 준비 단계로 다시 붙는다). confirm 문구: title "아기 페이지의 모든 기록을 지울까요?", description "일기·주기 기록·체크리스트·참고 사이트와 올린 사진이 모두 사라지고, 다시 볼 수 없어요.", confirmLabel "모두 지우기".

레이아웃(지금과 같은 격자: 폰은 일기 먼저, `lg` 는 3열):
```
<Hero …/>                              // prep → <PrepHero>, 그 외 → <BabyHero>
<div className="grid gap-6 lg:grid-cols-3">
  <div className="order-2 …">            // 사이드
    {stage === "prep" && <CycleCard …/>}  // 준비: 펼친 주기 카드 (사이드 맨 위)
    <BabyChecklist … onAddDefaults={stage === "prep" ? undefined : addDefaultChecks} />
    <BabyLinks …/>
    {stage !== "prep" && cycleEvents.length > 0 && <CycleCard collapsed … />}  // 임신·출생: 접힌 한 줄
  </div>
  <div className="order-1 lg:col-span-2"><EntryTimeline …/></div>
</div>
{dialog}{모달들}
```
`PageHeader` 는 쓰지 않는다(히어로가 `h1` 을 가진다).

- [ ] **Step 4: `prep-hero.tsx`** — 지금 `BabyHero` 의 진한 판(`on-chrome … bg-gradient-to-br from-chrome via-chrome to-peach-soft`)과 글자 크기 체계를 그대로 쓴다.
- 오른쪽 위 ⚙ `IconButton aria-label="아기 페이지 설정"` → `onOpenSettings`.
- 머리: 🌱 원 + `<h1 className="font-display text-lg font-bold text-chrome-ink">아기 준비</h1>`.
- `prediction` 있음:
  - 큰 글씨(`font-display text-6xl … sm:text-7xl`): `lateDays > 0` 이면 `"{lateDays}일 지남"`, `daysUntilNext === 0` 이면 `"오늘"`, 그 외 `"D-{daysUntilNext}"`.
  - 그 아래 `font-num text-base text-ink-soft`: `"다음 생리 예정 {kDate(nextStart)} · 추정"` (지났으면 `"{kDate(nextStart)} 예정이었어요 · 추정"`).
  - 막대: 이번 주기 진행 `min(1, cycleDay / avgCycle)`(`role="progressbar" aria-label="이번 주기 진행"`). 막대 **아래에** 가임기 구간을 옅은 띠로(`palette("mint").soft`, `left = (fertileStart - lastStart)/avgCycle`, `width = (fertileEnd - fertileStart + 1)/avgCycle`, 0~100% 로 자름). 양 끝 글자: 왼쪽 `"{cycleDay}일째"`, 오른쪽 `"평균 {avgCycle}일"`.
  - 한 줄: `"가임기 {kDateShort(fertileStart)} ~ {kDateShort(fertileEnd)} · 배란 예정 {kDateShort(ovulation)} (추정)"` — `lateDays > 0` 이면 이 줄을 숨긴다.
  - `basis === "default"` 면 작은 글씨 `"기록이 두 번 쌓이면 더 맞아져요"`.
- `prediction` 없음: `"생리 시작일을 적으면 다음 예정일과 가임기를 추정해 드려요."` + `<Button size="sm" variant="outline" onClick={onRecordStart}>생리 시작 적기</Button>`.
- 미래 병원 기록이 있으면 지금 히어로의 "다음 검진" 줄과 같은 모양으로 `"다음 진료"`.
- 맨 아래: `<Button variant="soft" onClick={onStartPregnancy}>임신을 확인했어요</Button>`.
- **권하는 문장 금지**(“이때 시도해 보세요” 같은 것 없음).

- [ ] **Step 5: `baby-hero.tsx`** — props 를 `{ pregnancy: Pregnancy; entries: JourneyEntryWithAuthor[]; onOpenSettings }` 로. `findNextCheckup` 은 그대로 export(PrepHero 도 쓴다). "다음 검진" → "다음 진료". 나머지 그대로.

- [ ] **Step 6: `cycle-card.tsx` + `cycle-event-modal.tsx`**
- `CycleCard({ events, prediction, collapsed?, onAdd(kind), onRemove(id) })`:
  - 펼친 모양(`Card`): 제목 `"주기 기록"`, 버튼 셋 `[🌸 생리 시작] [🌿 생리 끝] [🧪 테스트기]`(`Button size="sm" variant="outline"`, 폰에서 줄바꿈 허용 `flex flex-wrap gap-2`) → `onAdd(kind)` 가 모달을 연다.
  - 요약 한 줄(예측 있을 때): `"평균 주기 {avgCycle}일 · 생리 {avgPeriod}일"`.
  - 최근 기간 6개(최신 먼저, `periodsFrom(events)`): `"{kDateShort(start)} ~ {end ? kDateShort(end) : "?"}"` + 길이 `"{length}일"`, 그 기간의 테스트기 기록은 작은 `Tag`(`TEST_RESULT_META[result].label`, color 그대로).
  - 각 원본 기록 줄에 `ItemActions`(삭제 하나, `danger`). 기간 묶음과 별개로 **"모든 기록"** 접힘 목록(날짜·종류·결과, 각각 삭제)을 둔다 — 짝이 안 맞는 기록도 지울 수 있어야 한다.
  - 기록 0개: `EmptyState` 대신 한 줄 `"아직 기록이 없어요."`.
  - `collapsed` 일 때: `CollapsibleCard`(배럴에 있음)로 머리글 `"준비 때 주기 기록 {events.length}개"`, 펼치면 위와 같은 내용(추가 버튼은 숨긴다).
- `CycleEventModal({ kind, onClose, onSave({ date, kind, result }) })`: `Modal size="sm"`, 날짜(`Input type="date"`, 기본 오늘), `kind === "ovulationTest"` 면 `Segmented` 로 음성/희미/양성(고르기 전엔 저장 비활성). 제목 `CYCLE_KIND_META[kind].label`.

- [ ] **Step 7: `pregnancy-start-modal.tsx`** (지금 `baby-setup.tsx` 를 모달로 옮긴다)
- `Modal title="임신을 확인했어요" emoji="🌱"`. 필드: 태명(placeholder `"비워 두면 '우리 아기'"`, `maxLength 20`, 선택), 이모지·색(지금과 같은 격자), 날짜 `Segmented`(출산 예정일 | 마지막 생리일) + `Input type="date"`.
- **기본 모드: 마지막 `periodStart` 가 있으면 `"lmp"` + 그 날짜로 미리 채움**(hint: `"출산 예정일 {kDate(due)}"`), 없으면 `"due"` + 빈 칸.
- 저장 → `onStart({ nickname, emoji, color, dueDate? | lmpDate? })`. 버튼 `"시작하기"`.

- [ ] **Step 8: `baby-settings-modal.tsx`** (임신 설정)
- props: `{ pregnancy: Pregnancy; showOnHome: boolean; onClose; onSave(patch); onToggleHome(v); onBackToPrep(); onReset() }`. `BabySettingsPatch` 에서 `showOnHome` 을 빼고 홈 표시는 `onToggleHome` 으로 바로 저장(체크박스 그대로 두되 값은 `showOnHome` prop).
- 제목 `"임신 설정"`. 본문 끝에 **두 구역**을 `border-t border-line pt-4` 로 떼어 둔다(지금 리셋 구역과 같은 모양):
  1. `"준비 단계로 돌아가기"` / 설명 `"주기 기록과 준비 때 일기는 그대로예요. 이 기간의 기록은 남길지 지울지 다음 화면에서 골라요."` / `Button size="sm" variant="outline"` `"준비 단계로"` → `onBackToPrep`.
  2. `"처음부터 다시 시작"` / `"일기·주기 기록·체크리스트·참고 사이트와 올린 사진을 모두 지워요."` / `Button variant="danger" size="sm"` `"모두 지우기"` → `onReset`.

- [ ] **Step 9: `back-to-prep-modal.tsx`**
- `Modal title="준비 단계로 돌아갈까요?" size="sm"`. 두 선택 카드(라디오처럼, `role="radio"` + `aria-checked`, 처음엔 **아무것도 안 골라짐**):
  - `"이 기간의 기록 남기기"` — `"일기는 그대로 두고 준비 단계로 돌아가요."`
  - `"이 기간의 기록 지우기"` — `"임신을 확인한 뒤 쓴 일기·체크리스트와 올린 사진이 사라져요. 다시 볼 수 없어요."`
- 버튼: `"취소"` / `"준비 단계로"`(고르기 전엔 비활성. 지우기를 고르면 `variant="danger"`). → `onConfirm(keep)`.
- 문구에 이유를 말하지 않는다.

- [ ] **Step 10: `journey-settings-modal.tsx`** (준비 단계 ⚙)
- `Modal title="아기 페이지 설정"`. 홈에 보여주기 체크박스(지금 설정 모달의 그 줄 모양, 설명 `"홈 화면에 다음 예정일과 최근 기록 카드를 띄워요."`) → 바로 `onToggleHome(v)`. 아래 `"처음부터 다시 시작"` 구역(Step 8 의 2와 같은 문구) → `onReset`. 푸터 `"닫기"`.

- [ ] **Step 11: `entry-timeline.tsx`** — props 를 `{ entries: JourneyEntryWithAuthor[]; filter; onFilterChange; active: Pregnancy | null; onEdit; onDelete; onCreate }` 로. 주차 꼬리표 규칙: `active && !active.birthDate` 일 때, **그 날짜 묶음에 `pregnancyId === active.id` 인 기록이 하나라도 있으면** `weekLabel(pregnancyProgress(active.dueDate, day))`. 빈 화면 설명을 `"오늘의 마음, 병원 이야기, 아기에게 한마디. 무엇이든 좋아요."` 로.

- [ ] **Step 12: `entry-modal.tsx`·`baby-checklist.tsx`·`baby-links.tsx`** — 타입 이름만 새것으로(`BabyEntryWithAuthor` → `JourneyEntryWithAuthor`, `BabyChecklistItem` → `JourneyChecklistItem`, `BabyLink` → `JourneyLink`). `BabyChecklist` 의 `onAddDefaults` 를 **선택 prop** 으로 바꾸고 없으면 "기본 항목 넣기" 버튼을 숨긴다. 체크리스트 제목: 준비면 `"준비 체크리스트"`, 임신이면 지금 제목 — `title` prop 으로 받는다.

- [ ] **Step 13: `baby-setup.tsx` 삭제**, `git grep -n "baby-setup\|BabySetup"` → 0줄.

- [ ] **Step 14: 확인** — `npx tsc --noEmit 2>&1 | grep "^app/baby/"` 출력 없음, `npm run lint` 0, `npm test` PASS. (화면 확인은 리드가 dev 서버로 한다.)

---

### Task 4: 홈 카드 (`app/page.tsx`, `app/baby/baby-home-invite.tsx`)

**Files:** Modify `app/page.tsx`(import 줄, `getData` 의 `prisma.baby…` 자리, 초대 줄·아기 카드 블록), `app/baby/baby-home-invite.tsx`

**Interfaces:**
- Consumes: `journeyState()`·`JourneyState`(`lib/journey.ts`), `kindMeta`(`app/baby/baby-meta.ts`), `PATCH /api/baby { showOnHome }`.

- [ ] **Step 1: `getData`** — `prisma.baby.findFirst(...).catch(() => null)` 자리를 `journeyState().catch(() => null)` 로, 결과 이름 `journey`. 주석: "표가 아직 없는 배포 직후에도 홈은 떠야 한다 — 못 읽으면 아기 칸을 빼고 그린다."
- [ ] **Step 2: 초대 줄** — `journey && journey.hasAnything && !journey.showOnHome` 일 때 `<BabyHomeInvite emoji title summary />`.
  - 준비: `emoji="🌱" title="아기 준비"`, summary = 예측 있으면 `lateDays > 0 ? "예정일에서 {n}일 지남 · 추정" : "다음 생리 예정 D-{n} · 추정"`(0 이면 `"다음 생리 예정 오늘 · 추정"`), 없으면 `"준비 중"`.
  - 임신/출생: 지금과 같게(`active.emoji`, `active.nickname`, 주차 또는 "태어난 지 N일").
- [ ] **Step 3: 카드** — `journey?.showOnHome` 일 때 `DashCard href="/baby" className="col-span-full" action="일기 보기"`:
  - 임신/출생: 지금 카드 그대로(`baby` 를 `journey.active` 로).
  - 준비: `emoji="🌱" title="아기 준비"`. 큰 숫자 자리(`font-display text-3xl`)에 초대 줄과 같은 D-값, 옆 `Tag color="mint"` 로 `"가임기 {M/d}~{M/d} · 추정"`(예측 있고 `lateDays === 0` 일 때만). 최근 일기 줄은 지금과 같게(`journey.latestEntry`).
- [ ] **Step 4: `baby-home-invite.tsx`** — props `{ emoji, title, summary }`(id 없음), 이름 링크 글자는 `title`. `PATCH /api/baby` 본문을 `{ showOnHome: true }` 로. 상단 주석의 `Baby.showOnHome` 을 `JourneySettings.showOnHome` 으로.
- [ ] **Step 5: 확인** — `npx tsc --noEmit 2>&1 | grep -E "^app/(page|baby/baby-home-invite)"` 출력 없음, lint 0.

---

### Task 5: 달력 표시 (`app/calendar/*`)

**Files:** Modify `app/calendar/page.tsx`, `app/calendar/calendar-client.tsx`; Create `app/calendar/journey-marks.tsx`

**Interfaces:**
- Consumes: `journeyState()`·`journeyMarks()`·`JourneyMark`·`MarkKind`(`lib/journey.ts`), `palette()`.

- [ ] **Step 1: `page.tsx`**

```ts
  const [events, marks] = await Promise.all([
    prisma.calendarEvent.findMany({ orderBy: { start: "asc" } }),
    // 아기 페이지에서 오는 읽기 전용 표시(주기 추정·병원·예정일). 못 읽어도 달력은 떠야 한다.
    journeyState().then(journeyMarks).catch(() => []),
  ]);
  return <CalendarClient initialEvents={events} marks={marks} />;
```

- [ ] **Step 2: `journey-marks.tsx`** — 표시 부분만 따로(676줄 클라이언트에 새 개념을 섞지 않는다).

```ts
"use client";
import Link from "next/link";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/utils";
import type { JourneyMark, MarkKind } from "@/lib/journey";

// 색은 팔레트 키로만(동적 클래스 금지). 일정 점과 헷갈리지 않게 **막대**로 그린다.
const MARK_COLOR: Record<MarkKind, string> = {
  period: "rose", periodPredicted: "rose", fertile: "mint", ovulation: "mint", hospital: "sky", due: "butter",
};

/** 격자 칸 아래쪽의 얇은 막대들(같은 종류는 한 번). 예측은 옅게. */
export function MarkBars({ marks }: { marks: JourneyMark[] }) { … }

/** 하루 모달·폰 목록용 읽기 전용 줄. 고치기·지우기 없이 아기 페이지로 보낸다. */
export function MarkRows({ marks }: { marks: JourneyMark[] }) { … }  // 각 줄: 색 점 + label + 오른쪽 `<Link href="/baby">아기 페이지에서 보기</Link>`
```
`MarkBars`: 종류별 하나씩 `h-1 rounded-full` 막대, `periodPredicted`·`fertile` 은 `palette(c).soft`, 나머지는 `palette(c).dot`. 접근성: 칸에 `aria-label` 로 라벨을 이어 붙여 준다(`sr-only` span).

- [ ] **Step 3: `calendar-client.tsx` 배선**
- prop `marks: JourneyMark[]` 추가. `marksByDay = new Map<string, JourneyMark[]>()` (키는 이미 `"yyyy-MM-dd"` — `DAY_KEY` 형식과 같은지 확인하고 같게 맞춘다).
- 격자 칸(지금 `dayEvents` 를 그리는 곳) 아래에 `<MarkBars marks={marksByDay.get(key) ?? []} />`.
- 하루 모달: 일정 목록 위에 `<MarkRows …/>`(있을 때만). 일정이 없고 표시만 있는 날에 "일정이 없어요" 빈 화면이 표시와 같이 뜨지 않게 문구 조건을 맞춘다.
- 폰 목록("다가오는 일정"): 오늘 이후 표시 중 **`hospital`·`due`·`periodPredicted` 의 첫날·`ovulation`** 만 날짜순으로 일정 사이에 읽기 전용 줄로 끼운다(가임기 날마다 줄이 생기지 않게).
- [ ] **Step 4: 확인** — `npx tsc --noEmit 2>&1 | grep "^app/calendar/"` 출력 없음, lint 0.

---

### Task 6: 포동이 리소스 (`lib/agent/resources.ts`)

**Files:** Modify `lib/agent/resources.ts`(머리 주석·`currentBabyId`/`requireBabyId` 삭제·`baby`/`babyEntry`/`babyChecklist`/`babyLink` 블록·새 `cycle` 블록), `lib/agent/resources.test.ts`, `lib/agent/catalog.test.ts`(필요한 만큼), `lib/agent/tools.test.ts`(`babyId` 를 보내는 가짜 리소스는 그대로 둬도 된다 — 가짜다)

**Interfaces:**
- Consumes: `journeyState()`, `periodsFrom`·`CYCLE_KIND_META`·`TEST_RESULT_META`(`lib/cycle.ts`), T2 의 `POST /api/cycle-events`·`/api/baby-*`.
- **PODONGI.md 필독.** 추가 전용·키 유지·리소스별 if/else 금지·목차에 body 금지.

- [ ] **Step 1: `baby`**

```ts
  {
    key: "baby",
    label: "아기",
    listPath: "/baby",
    async catalog() {
      const s = await journeyState();
      if (s.active) {
        return [{
          title: s.active.nickname,
          hint: s.active.birthDate ? `출생 ${kDateShortYear(s.active.birthDate)}` : `예정일 ${kDateShortYear(s.active.dueDate)}`,
        }];
      }
      // 준비 단계 — 예측은 반드시 "추정" 으로 말한다(모델이 사실처럼 옮기지 않게).
      const p = s.prediction;
      return [{
        title: "아기 준비",
        hint: p ? `다음 생리 예정 ${kDateShortYear(p.nextStart)}(추정) · 가임기 ${kDateShortYear(p.fertileStart)}~${kDateShortYear(p.fertileEnd)}(추정)` : "주기 기록 없음",
      }];
    },
    // /baby 에는 id 가 없다 → open_page("/baby") 가 id 없이 부른다.
    async detail() {
      const s = await journeyState();
      const [entries, count, checklist, links] = await Promise.all([
        prisma.journeyEntry.findMany({ orderBy: { date: "desc" }, take: LIST_TAKE, include: { author: true } }),
        prisma.journeyEntry.count(),
        prisma.journeyChecklistItem.findMany({ where: { pregnancyId: s.active?.id ?? null }, orderBy: { sortOrder: "asc" } }),
        prisma.journeyLink.findMany({ orderBy: { sortOrder: "asc" } }),
      ]);
      return {
        stage: s.stage,
        pregnancy: s.active,
        // 잘린 줄 모르면 "기록은 이게 전부" 라고 답한다 — 전체 수를 같이 준다.
        entries, entryCount: count, checklist, links,
        cycle: s.prediction && { ...s.prediction, note: "날짜는 모두 달력 계산으로 낸 추정이다" },
      };
    },
  },
```

- [ ] **Step 2: `babyEntry`·`babyChecklist`·`babyLink`** — `toBody` 에서 `babyId: await requireBabyId()` 줄을 지운다(서버가 단계를 찍는다). `babyEntry.catalog` 의 `prisma.babyEntry` → `prisma.journeyEntry`. `babyChecklist.catalog` 는 **지금 단계 것만** 센다(`where: { pregnancyId: (await journeyState()).active?.id ?? null }` — 또는 `pregnancy.findFirst` 로 id 만). label 을 `"아기 체크리스트"`, describe `"아기 페이지의 지금 단계(준비 또는 임신) 체크리스트에 항목 하나를 추가한다."`. `babyEntry.describe` 를 `"아기 페이지에 기록을 남긴다. diary=일상, checkup=병원, letter=아기에게 쓰는 편지. 임신 준비 중에도 쓸 수 있다."`. `babyLink.describe` 의 "임신·육아" → "임신 준비·임신·육아". `currentBabyId`·`requireBabyId` 함수 삭제.

- [ ] **Step 3: 새 `cycle` — `babyLink` 뒤에**

```ts
  {
    key: "cycle",
    label: "주기 기록",
    listPath: "/baby",
    async catalog() {
      const rows = await prisma.cycleEvent.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: LIST_TAKE });
      return capped(
        rows.map((e) => ({
          id: e.id,
          title: `${CYCLE_KIND_META[e.kind as CycleKind]?.label ?? e.kind} ${kDateShortYear(e.date)}`,
          hint: e.result ? TEST_RESULT_META[e.result as TestResult]?.label : undefined,
        })),
        LIST_TAKE
      );
    },
    create: {
      api: "/api/cycle-events",
      describe:
        "아기 페이지의 주기 기록에 하루짜리 사건을 남긴다. periodStart=생리 시작, periodEnd=생리 끝, ovulationTest=배란 테스트기 결과.",
      schema: {
        type: "object",
        properties: {
          kind: { type: "string", description: "무엇을 적는지", enum: ["periodStart", "periodEnd", "ovulationTest"] },
          date: { type: "string", description: "날짜 yyyy-MM-dd. 비우면 오늘" },
          result: { type: "string", description: "테스트기 결과(ovulationTest 일 때만)", enum: ["negative", "faint", "positive"] },
        },
        required: ["kind"],
      },
      async toBody(args) {
        return { kind: optStr(args.kind), date: optStr(args.date), result: optStr(args.result) };
      },
      undoApi: (id) => `/api/cycle-events/${id}`,
    },
  },
```
머리 주석의 "16종" → "18종", "아기는 1명으로" → "아기 페이지는 한 쪽(단계는 서버가 정한다)으로".

- [ ] **Step 4: 시험 갱신** — `resources.test.ts` 의 가짜 prisma(`db`)에 `pregnancy`·`journeyEntry`·`journeyChecklistItem`·`journeyLink`·`journeySettings`·`cycleEvent` 대리자를 넣고 `baby` 상세 시험을 새 모양(`stage`·`entries`·`checklist`·`links`·`entryCount`)으로 고친다. 새 시험 둘:
  - `cycle` 리소스의 `toBody` 가 `{ kind, date, result }` 만 내고 `babyId` 가 없다.
  - `babyEntry`·`babyChecklist`·`babyLink` 의 `toBody` 결과에 `babyId` 가 **없다**(준비 단계에서도 추가된다).
  - `resolvePath("/baby")` 가 여전히 `baby` 를 고른다(순서 시험 유지).
- [ ] **Step 5: 확인** — `npm test` PASS, `npx tsc --noEmit 2>&1 | grep "^lib/agent/"` 출력 없음, lint 0. (`agent:smoke`·`agent:prompt` 재기는 리드.)

---

### Task 7: 검사 흐름과 문서

**Files:** Modify `scripts/ui-flows.mjs`(아기 절·시작 청소), `AGENTS.md`(아기 페이지 절), `PODONGI.md`(리소스 수·고정 비용 — 숫자는 리드가 잰 값), `DEPLOY.md`, `lib/nav.ts`(설명)

- [ ] **Step 1: `lib/nav.ts`** — `/baby` 의 `desc` 를 `"준비부터 출산까지 함께 쓰는 기록"`.
- [ ] **Step 2: ui-flows 시작 청소** — 지난 판 찌꺼기 블록(`{ const swept = … }`) 안에 덧붙인다:

```js
    // 태명에 MARK 가 붙은 임신 = 지난 판의 찌꺼기. 남으면 로컬이 임신 단계로 굳어
    // 다음 판의 단계 흐름이 조용히 건너뛰어진다. 지우기(keep:false)로 치운다.
    const b = await fetch("/api/baby").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (b?.active?.nickname?.includes(mark)) {
      await fetch(`/api/pregnancy/${b.active.id}/end`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keep: false }),
      }).catch(() => {});
      n++;
    }
```

- [ ] **Step 3: ui-flows 아기 절** — 지금 네 단계(쓰는 칸 위치·한 줄 저장·접힌 줄·지우기)는 그대로 두고(준비 단계에서도 돈다), `"아기가 홈에 없으면…"` 단계의 `PATCH` 본문을 `{ showOnHome }` 로 바꾸고(id 없음), 아래 단계들을 더한다. 모든 단계는 끝에 만든 것을 치운다.

```js
// 단계 흐름은 **로컬이 준비 단계일 때만** 돈다 — 개발자가 임신 단계로 써 두었으면 건드리지 않는다.
const before = await page.evaluate(() => fetch("/api/baby").then((r) => r.json()));
const api = (path, method, body) =>
  page.evaluate(([p, m, b]) => fetch(p, { method: m, headers: { "Content-Type": "application/json" }, body: b && JSON.stringify(b) })
    .then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) })), [path, method, body]);

await step("생리 시작을 적으면 히어로에 '추정' 예정일이 뜬다", async () => {
  if (before.stage !== "prep") throw new Error("로컬이 준비 단계가 아니라 건너뜀 — 임신을 끝내고 다시");
  await page.goto(BASE + "/baby", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /생리 시작/ }).first().click();
  await page.waitForTimeout(500);
  await page.locator('[role="dialog"] input[type="date"]').fill("2026-01-05"); // 과거 고정 — 로컬 기록과 겹치지 않게
  await page.getByRole("button", { name: /^저장$/ }).last().click();
  await page.waitForTimeout(1200);
  if (!(await text()).includes("추정")) throw new Error("예측이 안 보인다");
});
// (같은 날 다시 적으면 행이 하나 — api("/api/cycle-events","POST",{date:"2026-01-05",kind:"periodStart"}) 두 번의 id 가 같다)
// (끝에 그 id 를 DELETE)

await step("임신 확인 → 주차, 두 번째 확인은 409", async () => { /* 버튼 "임신을 확인했어요" → 태명 MARK+"콩" → 예정일 → 시작하기 → 히어로에 "주" 글자. 그 뒤 api("/api/pregnancy","POST",{dueDate:"2027-01-01"}).status === 409 */ });

await step("임신 중에 쓴 일기만 '준비 단계로 · 지우기' 로 사라진다", async () => {
  /* 1) 임신 전에: api POST /api/baby-entries {content: MARK+" 준비 때"} 를 먼저 만들어 둔다(이 단계 시작 전, 임신 확인 전에 — 순서를 위 단계보다 앞에 둘 것)
     2) 임신 중: api POST /api/baby-entries {content: MARK+" 임신 중", plus 사진: 업로드한 PNG 의 주소를 본문에 ![](url)}
     3) 화면: 설정 ⚙ → "준비 단계로" → "이 기간의 기록 지우기" → "준비 단계로"
     4) 새로고침: "임신 중" 없음, "준비 때" 있음, 히어로 h1 "아기 준비", 업로드 파일 수가 하나 줄었다(fileCount())
     5) 치우기: "준비 때" 일기 DELETE */
});

await step("'남기기' 는 일기를 남기고 준비로 돌아간다", async () => {
  /* api 로 임신 시작(nickname MARK+"둘") → 일기 하나 → api POST /api/pregnancy/{id}/end {keep:true} → /baby 에 그 일기 있음 · h1 "아기 준비"
     치우기: api POST /api/pregnancy/{id}/end {keep:false} → 그 일기도 사라졌는지(끝난 임신도 지워진다) */
});
```
위 주석 자리는 **실제 코드로** 쓴다(이 저장소의 다른 단계처럼 `page.getByRole`·`api`·`text()`·`fileCount()` 로). 사진 업로드는 기존 사진 단계가 쓰는 PNG 생성 함수를 재사용한다.
**처음부터 다시 시작(`DELETE /api/baby`)은 돌리지 않는다** — 그 자리에 왜 안 돌리는지 한 줄 주석.

- [ ] **Step 4: AGENTS.md "아기 페이지" 절 교체**

```md
## 아기 페이지 (`/baby`) — 준비부터 출산까지
- 스펙 `docs/superpowers/specs/2026-10-16-baby-journey-design.md`. 기록(`JourneyEntry`·`JourneyChecklistItem`·`JourneyLink`·`CycleEvent`)은 **페이지의 것**, 임신(`Pregnancy`)은 그 아래 0..n. 진행 중 = `endedAt` 없음(최대 1개, `POST /api/pregnancy` 가 409 로 지킨다).
- **도장은 서버가 찍는다**: 진행 중인 임신이 있을 때 만든 일기·체크리스트에 `pregnancyId`. "준비 단계로 · 지우기" 가 지울 범위가 이 값이라 클라이언트 값을 받지 않는다. 단계는 `stageOf()` 로 계산(저장 안 함).
- 서버 조회는 `lib/journey.ts` 의 `journeyState()` 한 곳(홈·달력·포동이). 예측은 `lib/cycle.ts`(vitest).
- 옛 `Baby`·`BabyEntry`·`BabyChecklistItem`·`BabyLink` 표는 **쓰지 않는다**(운영에 남아 있을 수 있다 — DEPLOY.md). `ensure.sql` 이 ALTER 를 못 해서 새 표로 옮겼다.
- **의료 문구 원칙과 그 예외 하나**: 의료 시기·국가 제도 문구를 UI 에 넣지 않는다. **예외는 주기 계산 날짜(다음 생리 예정·배란 예정·가임기)뿐** — 날짜와 "추정" 표시만, **권하는 문장 금지.** 준비 체크리스트에 기본 항목을 넣지 않는 것도 같은 이유다.
- 화면 문구는 임신이 끝난 이유를 암시하지 않는다(두 리셋: "준비 단계로" = 그 임신만, "처음부터 다시 시작" = 전부).
- 홈 노출은 `JourneySettings.showOnHome` 일 때만. `BabyLink` 시절의 참고 사이트 규칙(`lib/url.ts`, 도메인만 표시)은 그대로.
```

- [ ] **Step 5: DEPLOY.md** — 배포 절 끝에: "2026-10 아기 페이지 재설계 이후 옛 `Baby`·`BabyEntry`·`BabyChecklistItem`·`BabyLink` 표는 쓰이지 않는다. 비어 있으면 Neon 콘솔에서 `DROP TABLE "BabyLink", "BabyChecklistItem", "BabyEntry", "Baby";` 로 지워도 된다(사람 손으로 한 번 — `ensure.sql` 에 넣지 말 것)." 51행의 예시 표 이름도 새 표로.
- [ ] **Step 6: PODONGI.md** — "현재 17종" → "현재 18종"(두 곳), 고정 비용 줄은 리드가 잰 숫자로.

---

### Lead L2: 전체 검증 · 배포 (리드)

- [ ] `npx tsc --noEmit`(0) · `npm run lint`(0) · `npm test`.
- [ ] `npm run dev` → 임시 로컬 계정(`npm run user:add`) → `npm run ui:flows -- http://localhost:3000 <id> <pw>` 전부 통과 → `npm run ui:audit http://localhost:3000 <id> <pw>`(390px 가로 넘침 없음) → `npm run agent:smoke` → `npm run agent:prompt /baby` 로 18종·고정 비용 다시 재서 PODONGI.md 에 적기 → 임시 계정 삭제.
- [ ] 화면 확인(390px 캡처): 준비 히어로(예측 있음/없음/지남), 주기 카드, 임신 확인 모달(LMP 미리 채움), 임신 히어로, 준비 단계로 모달, 달력 격자·하루 모달·폰 목록, 홈 카드(준비/임신).
- [ ] 홈 요청당 SQL 수를 `log_statement` 로 다시 재서(메모리 `podong-production-deploy` 방법) 늘어난 수를 커밋 메시지에 적는다.
- [ ] 커밋 → `git push`(= 배포) → `gh api …/commits/<sha>/status` 의 Vercel success → 운영 `/login` 200.
- [ ] 사용자에게: 운영에서 처음 열 때 `ensure.sql` 이 새 표를 만들었는지(빌드 로그 `[표 확인] ✓`) — gh 로 빌드 로그를 못 보면 사용자가 `/baby` 를 열어 보는 것으로 확인.
