// Codex(ChatGPT) OAuth 토큰 주입 도우미
// 로컬에서 받은 codex_auth.json 을 암호화해 DB 에 넣습니다.
// 사용법:
//   npm run agent:auth -- <codex_auth.json 경로>
// ⚠️ 토큰 값은 화면에 찍지 않습니다. 확인용으로 account_id 와 만료 시각만 보여줍니다.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { saveAuth } from "../lib/agent/auth";

async function main() {
  const [target] = process.argv.slice(2);
  if (!target) {
    console.error("사용법: npm run agent:auth -- <codex_auth.json 경로>");
    process.exit(1);
  }

  const raw = await readFile(path.resolve(target), "utf8");
  type AuthFileShape = Partial<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    expires_at: number;
    account_id: string;
    provider: string;
  }>;

  let data: AuthFileShape;
  try {
    data = JSON.parse(raw) as AuthFileShape;
  } catch {
    // SyntaxError 메시지에는 파일 일부가 실릴 수 있어 그대로 쓰지 않습니다.
    console.error("JSON 파일을 읽지 못했어요. 파일이 깨지지 않았는지 확인해 주세요.");
    process.exit(1);
  }

  if (!data.access_token || !data.refresh_token) {
    console.error("파일에 access_token·refresh_token 이 없어요. codex_auth.json 이 맞는지 확인해 주세요.");
    process.exit(1);
  }

  await saveAuth({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    expires_at: data.expires_at,
    account_id: data.account_id,
    provider: data.provider,
  });

  const saved = await prisma.agentAuth.findUnique({
    where: { id: "main" },
    select: { provider: true, accountId: true, expiresAt: true },
  });
  console.log(
    `✓ 저장 완료 — provider ${saved?.provider ?? "?"} · account_id ${saved?.accountId ?? "(없음)"} · 만료 ${
      saved?.expiresAt.toISOString() ?? "?"
    }`
  );
}

main()
  .catch((e) => {
    // 토큰은 암호화된 뒤에야 prisma 로 넘어가므로 메시지에 평문이 실릴 일은 없습니다.
    console.error(e instanceof Error ? e.message : "알 수 없는 오류가 났어요.");
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
