-- 배포할 때마다 **있어야 할 표가 있는지**만 확인한다. (scripts/ensure-tables.mjs 가 돌린다)
--
-- ⚠️ 이 파일에는 **더하기만** 적는다. `CREATE ... IF NOT EXISTS` 만.
--    DROP·ALTER·DELETE 를 여기 적으면 배포할 때마다 운영 데이터가 그 명령을 맞는다.
--    기존 열을 바꾸거나 표를 지워야 하면 이 파일이 아니라 사람 손으로 한 번만 한다.
--
-- 왜 이 파일이 있나: 운영 `DATABASE_URL` 은 Vercel 에 Secret 으로 잡혀 있어 **아무도 다시
-- 읽을 수 없다**(설계상 그렇다). 그래서 새 표가 생기면 사람이 Neon 콘솔에 들어가야 했는데,
-- 그건 "배포하면 끝" 이어야 할 일에 사람 손을 묶어 두는 것이다. 빌드는 그 값을 갖고 있으니
-- 거기서 확인한다. 두 번 돌아도 안전하니 배포마다 돌아도 된다.

-- 포동이의 기억 (2026-09-21). `/memories` 가 이 표를 읽는다.
CREATE TABLE IF NOT EXISTS "AgentMemory" (
    "id"        TEXT NOT NULL,
    "text"      TEXT NOT NULL,
    -- "포동이"(짐작해 적은 것) | "가족"(직접 말해 준 것). 화면에서 태그로 구분해 보여준다.
    "by"        TEXT NOT NULL DEFAULT '포동이',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AgentMemory_createdAt_idx" ON "AgentMemory"("createdAt");

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

-- "cycleSince" 는 이 표가 운영에 생기기 **전에** 더했다(2026-10-16) — 그래서 아직 CREATE 한 줄로 충분하다.
-- 표가 이미 있는 DB(로컬)는 IF NOT EXISTS 라 이 열이 안 들어간다 → 거기는 `npm run db:push`.
CREATE TABLE IF NOT EXISTS "JourneySettings" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "showOnHome" BOOLEAN NOT NULL DEFAULT false,
    "cycleSince" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JourneySettings_pkey" PRIMARY KEY ("id")
);
