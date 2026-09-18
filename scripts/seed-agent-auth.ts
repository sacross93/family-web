// 배포 DB 에 에이전트 토큰을 한 번 심는다. **일회용 — 심고 나면 이 파일과 AGENT_SEED 를 지운다.**
//
// 왜 필요한가: 프로덕션 DATABASE_URL 은 Vercel 이 Secret 으로 잠가 두어 밖에서 읽을 수 없다.
// 그래서 로컬에서 배포 DB 에 직접 쓰는 길이 없다. 빌드는 그 값을 갖고 있으므로 빌드 중에 심는다.
//
// 안전: AGENT_SEED 에는 **암호문만** 들어간다. AUTH_SECRET 없이는 아무 의미가 없는 문자열이라
// 환경변수 목록이나 빌드 로그에 남아도 토큰이 새지 않는다. 이 스크립트는 복호화하지 않는다.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface Seed {
  accessToken: string;
  refreshToken: string;
  accountId: string | null;
  expiresAt: string;
}

function parse(raw: string): Seed {
  const v: unknown = JSON.parse(raw);
  if (typeof v !== "object" || v === null) throw new Error("AGENT_SEED 가 객체가 아닙니다");
  const s = v as Record<string, unknown>;
  const str = (k: string) => {
    const x = s[k];
    if (typeof x !== "string" || !x) throw new Error(`AGENT_SEED.${k} 가 비었습니다`);
    return x;
  };
  return {
    accessToken: str("accessToken"),
    refreshToken: str("refreshToken"),
    accountId: typeof s.accountId === "string" ? s.accountId : null,
    expiresAt: str("expiresAt"),
  };
}

async function main() {
  const raw = process.env.AGENT_SEED;
  if (!raw) {
    console.log("AGENT_SEED 없음 — 건너뜁니다.");
    return;
  }

  const seed = parse(raw);
  const expiresAt = new Date(seed.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) throw new Error("expiresAt 이 날짜가 아닙니다");

  // 짧은 값으로 기존 행을 덮어쓰는 사고를 막는다. 한 번 덮으면 원본은 되살릴 수 없다.
  if (seed.accessToken.length < 50 || seed.refreshToken.length < 50) {
    throw new Error("암호문이 너무 짧습니다 — 덮어쓰지 않습니다");
  }

  const data = {
    provider: "openai-codex",
    accessToken: seed.accessToken,
    refreshToken: seed.refreshToken,
    accountId: seed.accountId,
    expiresAt,
  };
  await prisma.agentAuth.upsert({
    where: { id: "main" },
    create: { id: "main", ...data },
    update: data,
  });

  // 토큰은 절대 찍지 않는다. 확인에 필요한 만큼만.
  console.log(`✓ AgentAuth 심음 — accountId=${seed.accountId} expiresAt=${expiresAt.toISOString()}`);
}

main()
  .catch((e) => {
    console.error("AgentAuth 심기 실패:", e instanceof Error ? e.message : "알 수 없음");
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
