-- 포동이의 기억 표 하나를 더한다. (2026-09-21)
--
-- 왜 이 파일이 있나: `prisma db push` 는 스키마 **전체**를 맞추는 명령이라 운영에 대고 돌릴 때
-- 무엇을 건드릴지 불안하다. 이번에 실제로 필요한 것은 **새 표 하나와 색인 하나**가 전부라,
-- 그것만 떼어 둔다. Neon 콘솔의 SQL 편집기에 그대로 붙여 넣으면 된다 —
-- 연결 문자열을 어디에도 옮길 필요가 없다.
--
-- 두 번 돌려도 안전하다(`IF NOT EXISTS`). 기존 표는 하나도 건드리지 않는다.
-- 돌린 뒤 사이트의 `/memories` 가 "아직 확인할 수 없어요" 대신 빈 목록을 보여주면 된 것이다.

CREATE TABLE IF NOT EXISTS "AgentMemory" (
    "id"        TEXT NOT NULL,
    "text"      TEXT NOT NULL,
    -- "포동이"(짐작해서 적은 것) | "가족"(직접 말해 준 것). 화면에서 태그로 구분해 보여준다.
    "by"        TEXT NOT NULL DEFAULT '포동이',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AgentMemory_createdAt_idx" ON "AgentMemory"("createdAt");
