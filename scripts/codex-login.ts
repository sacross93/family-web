// Codex(ChatGPT) 로그인 → 토큰을 **DB 에 바로 저장**합니다.
// 사용법:
//   npm run agent:login              브라우저로 로그인하고 로컬 서버(1455)가 콜백을 받습니다
//   npm run agent:login -- --paste   서버 없이, 로그인 후 주소창의 주소를 붙여넣습니다
//
// 평문 토큰 파일을 만들지 않는 것이 핵심입니다 — 파일을 거치지 않으면 지워야 할 비밀도 없습니다.
// ⚠️ 토큰 값은 절대 출력하지 않습니다. 밖으로 나가는 건 account_id 와 만료 시각까지.
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prisma } from "../lib/prisma";
import { saveAuth } from "../lib/agent/auth";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const PORT = 1455;
const REDIRECT_URI = `http://localhost:${PORT}/auth/callback`;
const SCOPE = "openid profile email offline_access";
const CALLBACK_PATH = "/auth/callback";
const WAIT_MS = 15 * 60 * 1000; // 15분

// ─────────────────────────────────────────────────────────────
// PKCE · 인증 URL
// ─────────────────────────────────────────────────────────────

export interface Pkce {
  verifier: string;
  challenge: string;
  state: string;
}

export function createPkce(): Pkce {
  const verifier = randomBytes(32).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
    state: randomBytes(16).toString("hex"),
  };
}

export function buildAuthorizeUrl(challenge: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    originator: "python-cli",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// ─────────────────────────────────────────────────────────────
// 콜백 해석
// ─────────────────────────────────────────────────────────────

/** 짧은 오류 코드만 통과시킵니다(주소에 실려 온 문자열을 그대로 쓰지 않도록). */
function safeCode(raw: string | null): string | null {
  return raw && /^[a-zA-Z0-9_-]{1,40}$/.test(raw) ? raw : null;
}

/**
 * 콜백 주소에서 `code` 를 꺼냅니다. 전체 URL 도, `/auth/callback?...` 같은 경로도 받습니다.
 * `state` 가 다르면 거부합니다 — 남이 만든 주소를 붙여넣게 만드는 공격을 막습니다.
 */
export function readCallback(rawUrl: string, expectedState: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl.trim(), `http://localhost:${PORT}`);
  } catch {
    throw new Error("주소를 이해하지 못했어요. 브라우저 주소창의 주소를 그대로 붙여넣어 주세요.");
  }

  const failure = safeCode(url.searchParams.get("error"));
  if (failure) throw new Error(`로그인이 취소되었거나 거부됐어요 (${failure}).`);

  const state = url.searchParams.get("state");
  if (!state || state !== expectedState) {
    throw new Error("state 가 일치하지 않아요. 이 실행에서 연 로그인 주소가 맞는지 확인하고 다시 시작해 주세요.");
  }

  const code = url.searchParams.get("code");
  if (!code) throw new Error("주소에 code 가 없어요. 로그인을 다시 시작해 주세요.");
  return code;
}

// ─────────────────────────────────────────────────────────────
// 토큰 교환
// ─────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
}

/**
 * authorization_code 를 토큰으로 바꿉니다.
 * 본문은 **form-encoded** — 이 프로젝트에서 실제로 성공이 확인된 형식입니다.
 */
export async function exchangeCode(
  code: string,
  verifier: string,
  fetchImpl: typeof fetch = fetch
): Promise<TokenResponse> {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
    }).toString(),
  });

  if (!res.ok) {
    let hint: string | null = null;
    try {
      const body = (await res.json()) as { error?: unknown };
      hint = safeCode(typeof body.error === "string" ? body.error : null);
    } catch {
      // 본문을 못 읽으면 상태 코드만 씁니다.
    }
    throw new Error(`토큰 교환에 실패했어요 (HTTP ${res.status}${hint ? ` · ${hint}` : ""}).`);
  }

  const body = (await res.json().catch(() => null)) as Partial<TokenResponse> | null;
  if (!body || typeof body.access_token !== "string" || typeof body.refresh_token !== "string") {
    throw new Error("토큰 응답에 access_token·refresh_token 이 없어요.");
  }
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_in: typeof body.expires_in === "number" ? body.expires_in : undefined,
    expires_at: typeof body.expires_at === "number" ? body.expires_at : undefined,
  };
}

/** access_token(JWT) 에서 chatgpt_account_id 를 꺼냅니다. 못 찾으면 null. */
export function extractAccountId(accessToken: string): string | null {
  const payload = accessToken.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    const auth = claims["https://api.openai.com/auth"];
    if (auth && typeof auth === "object") {
      const nested = (auth as Record<string, unknown>).chatgpt_account_id;
      if (typeof nested === "string" && nested) return nested;
    }
    const flat = claims.account_id;
    if (typeof flat === "string" && flat) return flat;
  } catch {
    // JWT 가 아니면 못 찾은 것으로 둡니다.
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// 콜백 받기 — 로컬 서버 / 붙여넣기
// ─────────────────────────────────────────────────────────────

function donePage(message: string, detail: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>포동 · 로그인</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,'Apple SD Gothic Neo',sans-serif;background:#fdf6f9;color:#4a3f45">
<div style="text-align:center;padding:32px;max-width:26rem">
<div style="font-size:48px;line-height:1">${message === "성공" ? "🎉" : "😥"}</div>
<h1 style="font-size:20px;margin:16px 0 8px">${detail}</h1>
<p style="font-size:14px;color:#8a7b83;margin:0">이 창은 닫으셔도 괜찮아요.</p>
</div></body></html>`;
}

function waitForCallbackOnServer(expectedState: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let timer: NodeJS.Timeout | undefined;

    const server = createServer((req, res) => {
      if (!req.url || !req.url.startsWith(CALLBACK_PATH)) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("여기가 아니에요.");
        return;
      }
      try {
        const code = readCallback(req.url, expectedState);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(donePage("성공", "로그인이 끝났어요! 터미널로 돌아가 주세요."));
        cleanup();
        resolve(code);
      } catch (e) {
        const message = e instanceof Error ? e.message : "로그인에 실패했어요.";
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(donePage("실패", message));
        cleanup();
        reject(e instanceof Error ? e : new Error(message));
      }
    });

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      server.close();
    };

    server.on("error", (e: NodeJS.ErrnoException) => {
      cleanup();
      reject(new Error(`포트 ${PORT} 를 열지 못했어요 (${e.code ?? "오류"}).`));
    });

    server.listen(PORT, "127.0.0.1", () => {
      timer = setTimeout(() => {
        cleanup();
        reject(new Error("15분 안에 로그인이 끝나지 않았어요. 다시 시도해 주세요."));
      }, WAIT_MS);
    });
  });
}

async function askPastedUrl(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question("\n로그인 후 브라우저 주소창의 주소를 그대로 붙여넣고 Enter: ")).trim();
  } finally {
    rl.close();
  }
}

function openBrowser(url: string) {
  if (process.env.AGENT_LOGIN_NO_BROWSER === "1") return;
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    const child = spawn(cmd, [url], {
      stdio: "ignore",
      detached: true,
      shell: process.platform === "win32",
    });
    child.on("error", () => {});
    child.unref();
  } catch {
    // 자동으로 못 열면 주소를 직접 열면 됩니다.
  }
}

// ─────────────────────────────────────────────────────────────

async function main() {
  const usePaste = process.argv.slice(2).includes("--paste");
  const { verifier, challenge, state } = createPkce();
  const authorizeUrl = buildAuthorizeUrl(challenge, state);

  console.log("\n아래 주소를 브라우저에서 열어 ChatGPT 계정으로 로그인해 주세요.\n");
  console.log(authorizeUrl);
  openBrowser(authorizeUrl);

  let code: string;
  if (usePaste) {
    console.log("\n(붙여넣기 모드 — 로컬 서버를 열지 않습니다.)");
    code = readCallback(await askPastedUrl(), state);
  } else {
    console.log(`\n로그인이 끝나면 이 창이 자동으로 이어집니다 (localhost:${PORT} 대기 중, 15분).`);
    try {
      code = await waitForCallbackOnServer(state);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      if (!message.startsWith(`포트 ${PORT}`)) throw e;
      // 포트를 못 쓰는 환경(원격·점유)에서는 붙여넣기로 이어갑니다.
      console.log(`\n${message} 대신 주소를 직접 붙여넣어 주세요.`);
      code = readCallback(await askPastedUrl(), state);
    }
  }

  const token = await exchangeCode(code, verifier);
  await saveAuth({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_in: token.expires_in,
    expires_at: token.expires_at,
    account_id: extractAccountId(token.access_token),
    provider: "openai-codex",
  });

  const saved = await prisma.agentAuth.findUnique({
    where: { id: "main" },
    select: { provider: true, accountId: true, expiresAt: true },
  });
  console.log(
    `\n✓ 로그인 완료 — provider ${saved?.provider ?? "?"} · account_id ${
      saved?.accountId ?? "(없음)"
    } · 만료 ${saved?.expiresAt.toISOString() ?? "?"}`
  );
  console.log("  토큰은 암호화해서 DB 에만 저장했어요. 따로 지울 파일은 없습니다.");
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
      console.error(e instanceof Error ? e.message : "알 수 없는 오류가 났어요.");
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
