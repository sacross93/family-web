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
