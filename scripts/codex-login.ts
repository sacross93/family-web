// Codex(ChatGPT) 로그인 → 토큰을 **DB 에 바로 저장**합니다.
// 사용법:
//   npm run agent:login              브라우저로 로그인하고 로컬 서버(1455)가 콜백을 받습니다
//   npm run agent:login -- --paste   서버 없이, 로그인 후 주소창의 주소를 붙여넣습니다
//   npm run agent:login -- --force   지금 저장된 것과 다른 계정으로 바꿀 때만 필요합니다
//
// 평문 토큰 파일을 만들지 않는 것이 핵심입니다 — 파일을 거치지 않으면 지워야 할 비밀도 없습니다.
// ⚠️ 토큰 값은 절대 출력하지 않습니다. 밖으로 나가는 건 account_id 와 만료 시각까지.
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prisma } from "../lib/prisma";
import { saveAuth, authRowId } from "../lib/agent/auth";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const PORT = 1455;
const REDIRECT_URI = `http://localhost:${PORT}/auth/callback`;
const SCOPE = "openid profile email offline_access";
const CALLBACK_PATH = "/auth/callback";
const WAIT_MS = 15 * 60 * 1000; // 15분
const EXCHANGE_TIMEOUT_MS = 15_000;

const HTML = { "Content-Type": "text/html; charset=utf-8" };

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
    // ⚠️ 저장소의 다른 곳(API 호출)은 실측된 "codex_cli_rs" 를 쓰지만, **로그인만은 다릅니다.**
    //    이 값은 이 프로젝트에서 실제로 로그인에 성공한 값이라 그대로 둡니다.
    //    첫 실제 로그인 전까지는 확인할 방법이 없으니 근거 없이 바꾸지 마세요.
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

export type CallbackResult =
  | { kind: "ok"; code: string }
  | { kind: "denied"; reason: string } // 우리 로그인인데 실패함 → 끝낸다
  | { kind: "ignore"; reason: string }; // 우리 로그인이 아님 → 계속 기다린다

/**
 * 콜백 주소를 살펴봅니다. 전체 URL 도, `/auth/callback?...` 경로도 받습니다.
 *
 * **`state` 를 가장 먼저** 봅니다. RFC 6749 §4.1.2.1 상 오류 응답에도 `state` 가 실려 오므로,
 * state 없는/다른 요청은 남이 보낸 것으로 보고 무시해야 합니다. 그러지 않으면 대기 중에
 * 사용자가 방문한 페이지의 `<img src="http://127.0.0.1:1455/auth/callback?error=x">` 하나로
 * 로그인이 거짓 사유와 함께 깨집니다.
 */
export function inspectCallback(rawUrl: string, expectedState: string): CallbackResult {
  let url: URL;
  try {
    url = new URL(rawUrl.trim(), `http://localhost:${PORT}`);
  } catch {
    return { kind: "ignore", reason: "주소를 이해하지 못했어요. 브라우저 주소창의 주소를 그대로 붙여넣어 주세요." };
  }

  const state = url.searchParams.get("state");
  if (!state || state !== expectedState) {
    return {
      kind: "ignore",
      reason: "state 가 일치하지 않아요. 이 실행에서 연 로그인 주소가 맞는지 확인하고 다시 시작해 주세요.",
    };
  }

  const failure = safeCode(url.searchParams.get("error"));
  if (failure) return { kind: "denied", reason: `로그인이 취소되었거나 거부됐어요 (${failure}).` };

  const code = url.searchParams.get("code");
  if (!code) return { kind: "denied", reason: "주소에 code 가 없어요. 로그인을 다시 시작해 주세요." };

  return { kind: "ok", code };
}

/** 붙여넣기 모드용 — 성공이 아니면 그 사유로 예외를 던집니다. */
export function readCallback(rawUrl: string, expectedState: string): string {
  const result = inspectCallback(rawUrl, expectedState);
  if (result.kind !== "ok") throw new Error(result.reason);
  return result.code;
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
  let res: Response;
  try {
    res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT_URI,
      }).toString(),
      signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
    });
  } catch {
    // 원인 객체에 요청 본문(code_verifier)이 실릴 수 있으므로 그대로 올리지 않습니다.
    throw new Error("토큰 교환 요청을 보내지 못했어요 (네트워크 오류이거나 시간이 초과됐어요).");
  }

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
  // 빈 문자열도 string 이라 타입 검사만으로는 통과합니다 — 그대로 저장하면 쓰던 토큰이 죽습니다.
  if (
    !body ||
    typeof body.access_token !== "string" ||
    !body.access_token ||
    typeof body.refresh_token !== "string" ||
    !body.refresh_token
  ) {
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

/** 지금은 safeCode 를 거친 문구만 들어오지만, 그 결합에 기대지 않도록 항상 이스케이프합니다. */
function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c
  );
}

function page(ok: boolean, detail: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>포동 · 로그인</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,'Apple SD Gothic Neo',sans-serif;background:#fdf6f9;color:#4a3f45">
<div style="text-align:center;padding:32px;max-width:26rem">
<div style="font-size:48px;line-height:1">${ok ? "🎉" : "😥"}</div>
<h1 style="font-size:20px;margin:16px 0 8px">${escapeHtml(detail)}</h1>
<p style="font-size:14px;color:#8a7b83;margin:0">이 창은 닫으셔도 괜찮아요.</p>
</div></body></html>`;
}

/**
 * 콜백을 기다립니다. `onListening` 은 **포트를 잡은 뒤** 불립니다 —
 * 주소 안내·브라우저 열기를 그 뒤에 해야, 포트를 못 쓸 때 사용자가 로그인을 시작하기 전에 알 수 있습니다.
 */
export function waitForCallbackOnServer(
  expectedState: string,
  port: number = PORT,
  onListening?: (actualPort: number) => void
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let timer: NodeJS.Timeout | undefined;

    const server = createServer((req, res) => {
      if (!req.url || !req.url.startsWith(CALLBACK_PATH)) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("여기가 아니에요.");
        return;
      }

      const result = inspectCallback(req.url, expectedState);

      // 우리 로그인이 아니면 400 만 주고 **계속 기다립니다**. 남이 보낸 요청 한 건으로
      // 로그인이 깨지면 안 됩니다.
      if (result.kind === "ignore") {
        res.writeHead(400, HTML);
        res.end(page(false, "이 로그인 요청이 아니에요."));
        return;
      }

      if (result.kind === "denied") {
        res.writeHead(400, HTML);
        res.end(page(false, result.reason));
        cleanup();
        reject(new Error(result.reason));
        return;
      }

      res.writeHead(200, HTML);
      res.end(page(true, "로그인이 끝났어요! 터미널로 돌아가 주세요."));
      cleanup();
      resolve(result.code);
    });

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      server.close();
    };

    server.on("error", (e: NodeJS.ErrnoException) => {
      cleanup();
      reject(new Error(`포트 ${port} 를 열지 못했어요 (${e.code ?? "오류"}).`));
    });

    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") onListening?.(address.port);
      timer = setTimeout(() => {
        cleanup();
        reject(new Error("15분 안에 로그인이 끝나지 않았어요. 다시 시도해 주세요."));
      }, WAIT_MS);
    });
  });
}

/** 붙여넣은 주소에는 1회용 code 가 들어 있으므로 터미널에 남기지 않습니다. */
async function askPastedUrl(): Promise<string> {
  process.stdout.write("\n로그인 후 브라우저 주소창의 주소를 붙여넣고 Enter (입력은 화면에 보이지 않아요): ");
  const silent = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output: silent, terminal: true });
  try {
    const answer = await rl.question("");
    process.stdout.write("\n");
    return answer.trim();
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
  const args = process.argv.slice(2);
  const usePaste = args.includes("--paste");
  const force = args.includes("--force");

  // 로그인부터 시켜 놓고 마지막에 실패하면 1회용 code 를 버리게 되니 먼저 확인합니다.
  if (!process.env.AUTH_SECRET) {
    throw new Error("AUTH_SECRET 이 없어요 (.env 확인). 지금 로그인해도 토큰을 암호화해 저장할 수 없어요.");
  }

  const before = await prisma.agentAuth.findUnique({
    where: { id: authRowId() },
    select: { provider: true, accountId: true, expiresAt: true },
  });
  if (before) {
    console.log(
      `\n지금 저장된 토큰 — provider ${before.provider} · account_id ${
        before.accountId ?? "(없음)"
      } · 만료 ${before.expiresAt.toISOString()}`
    );
    console.log("로그인에 성공하면 이 토큰을 덮어씁니다. 브라우저에 다른 ChatGPT 계정이 로그인돼 있지 않은지 봐 주세요.");
  }

  const { verifier, challenge, state } = createPkce();
  const authorizeUrl = buildAuthorizeUrl(challenge, state);

  let announced = false;
  const announce = () => {
    if (announced) return;
    announced = true;
    console.log("\n아래 주소를 브라우저에서 열어 ChatGPT 계정으로 로그인해 주세요.\n");
    console.log(authorizeUrl);
    openBrowser(authorizeUrl);
  };

  let code: string;
  if (usePaste) {
    announce();
    console.log("\n(붙여넣기 모드 — 로컬 서버를 열지 않습니다.)");
    code = readCallback(await askPastedUrl(), state);
  } else {
    try {
      // 포트를 먼저 잡고 그다음에 안내합니다 — 못 잡으면 로그인을 시작하기 전에 알 수 있게.
      code = await waitForCallbackOnServer(state, PORT, () => {
        announce();
        console.log(`\n로그인이 끝나면 이 창이 자동으로 이어집니다 (localhost:${PORT} 대기 중, 15분).`);
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      if (!message.startsWith(`포트 ${PORT}`)) throw e;
      // 포트를 못 쓰는 환경(원격·점유)에서는 붙여넣기로 이어갑니다.
      console.log(`\n${message} 대신 주소를 직접 붙여넣어 주세요.`);
      announce();
      code = readCallback(await askPastedUrl(), state);
    }
  }

  const token = await exchangeCode(code, verifier);
  const accountId = extractAccountId(token.access_token);

  // 브라우저에 다른 계정이 물려 있으면 "로그인만 했는데" 계정이 바뀝니다. 조용히 덮어쓰지 않습니다.
  if (before?.accountId && accountId && accountId !== before.accountId && !force) {
    throw new Error(
      `로그인한 계정이 지금 저장된 것과 달라요 (기존 ${before.accountId} → 새로 ${accountId}).\n` +
        "  기존 토큰은 그대로 두었습니다. 정말 바꾸실 거면 --force 를 붙여 처음부터 다시 로그인해 주세요."
    );
  }

  await saveAuth({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_in: token.expires_in,
    expires_at: token.expires_at,
    account_id: accountId,
    provider: "openai-codex",
  });

  const saved = await prisma.agentAuth.findUnique({
    where: { id: authRowId() },
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
