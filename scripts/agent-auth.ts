// Codex(ChatGPT) OAuth 토큰 주입 도우미
// 이미 받아 둔 토큰 파일을 암호화해 DB 에 넣습니다.
// 사용법:
//   npm run agent:auth -- <토큰 json 경로>
// 받는 형식 두 가지:
//   ① 평평한 구조 — { access_token, refresh_token, expires_at?, account_id? … }
//   ② 중첩 구조   — { tokens: { access_token, refresh_token, account_id? }, … }  (~/.codex/auth.json)
// 파일이 아예 없다면 `npm run agent:login` 으로 새로 로그인하는 편이 낫습니다(파일을 안 만듭니다).
// ⚠️ 토큰 값은 화면에 찍지 않습니다. 확인용으로 account_id 와 만료 시각만 보여줍니다.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prisma } from "../lib/prisma";
import { saveAuth, type CodexAuthFile } from "../lib/agent/auth";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * 평평한 구조와 중첩(`tokens`) 구조를 모두 받아 저장용 모양으로 맞춥니다.
 * 어느 쪽도 아니면 무엇을 넣어야 하는지 한국어로 알려줍니다.
 */
export function normalizeAuthFile(raw: unknown): CodexAuthFile {
  if (!raw || typeof raw !== "object") {
    throw new Error("토큰 파일이 JSON 객체가 아니에요.");
  }
  const top = raw as Record<string, unknown>;
  const nested =
    top.tokens && typeof top.tokens === "object" ? (top.tokens as Record<string, unknown>) : null;
  const source = nested ?? top;

  const accessToken = str(source.access_token);
  const refreshToken = str(source.refresh_token);
  if (!accessToken || !refreshToken) {
    throw new Error(
      "파일에서 access_token·refresh_token 을 찾지 못했어요. " +
        "최상위에 있거나 tokens 안에 있어야 해요. 파일이 없다면 `npm run agent:login` 으로 새로 로그인해 주세요."
    );
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    // 중첩 구조에는 만료 정보가 없습니다 — 그때는 saveAuth 가 access_token(JWT)의 exp 를 씁니다.
    expires_in: num(source.expires_in) ?? num(top.expires_in),
    expires_at: num(source.expires_at) ?? num(top.expires_at),
    account_id: str(source.account_id) ?? str(top.account_id) ?? null,
    provider: str(source.provider) ?? str(top.provider) ?? null,
  };
}

async function main() {
  const [target] = process.argv.slice(2);
  if (!target) {
    console.error("사용법: npm run agent:auth -- <토큰 json 경로>");
    console.error("  파일이 없다면: npm run agent:login");
    process.exit(1);
  }

  const raw = await readFile(path.resolve(target), "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // SyntaxError 메시지에는 파일 일부가 실릴 수 있어 그대로 쓰지 않습니다.
    console.error("JSON 파일을 읽지 못했어요. 파일이 깨지지 않았는지 확인해 주세요.");
    process.exit(1);
  }

  await saveAuth(normalizeAuthFile(parsed));

  const saved = await prisma.agentAuth.findUnique({
    where: { id: "main" },
    select: { provider: true, accountId: true, expiresAt: true },
  });
  console.log(
    `✓ 저장 완료 — provider ${saved?.provider ?? "?"} · account_id ${saved?.accountId ?? "(없음)"} · 만료 ${
      saved?.expiresAt.toISOString() ?? "?"
    }`
  );
  console.log(`  원본 파일(${target})에는 평문 토큰이 그대로 남아 있어요. 더 쓸 일이 없으면 지워 주세요.`);
}

function isEntrypoint(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}

// 테스트에서 import 할 때는 실행되지 않도록 진입점일 때만 돌립니다.
if (isEntrypoint(import.meta.url)) {
  main()
    .catch((e) => {
      // 토큰은 암호화된 뒤에야 prisma 로 넘어가므로 메시지에 평문이 실릴 일은 없습니다.
      console.error(e instanceof Error ? e.message : "알 수 없는 오류가 났어요.");
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
