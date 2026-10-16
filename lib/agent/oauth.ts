// Codex(ChatGPT) OAuth — 로그인 주소 만들기·콜백 해석·토큰 교환. **순수한 조각만** 둔다.
//
// 두 곳이 같이 쓴다: 터미널 로그인(`scripts/codex-login.ts`)과 관리자 화면의 다시 연결하기
// (`lib/agent/connect.ts` → `app/api/agent/connect/*`). 그래서 여기에는 prisma 도, 로컬 서버도,
// 화면도 없다 — `node:crypto` 와 주입한 fetch 뿐이다.
//
// ⚠️ 토큰 값·verifier·code 는 절대 출력하지 않습니다. 밖으로 나가는 건 account_id 와 만료 시각까지.
import { createHash, randomBytes } from "node:crypto";

export const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
export const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
export const TOKEN_URL = "https://auth.openai.com/oauth/token";
/**
 * 콜백 포트. 관리자 화면에서 연결할 때도 이 주소로 돌아온다 — 등록된 redirect_uri 가 이것뿐이라
 * 바꿀 수 없다. 그래서 화면 쪽은 "연결할 수 없음" 이 뜬 탭의 주소를 붙여넣게 한다(붙여넣기 방식).
 */
export const CALLBACK_PORT = 1455;
export const CALLBACK_PATH = "/auth/callback";
export const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;
export const SCOPE = "openid profile email offline_access";
const EXCHANGE_TIMEOUT_MS = 15_000;

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
export function safeCode(raw: string | null): string | null {
  return raw && /^[a-zA-Z0-9_-]{1,40}$/.test(raw) ? raw : null;
}

/**
 * 실패의 **고정된 이름**. `reason` 은 터미널에 맞춘 문장("이 실행에서 연…")이라,
 * 관리자 화면(lib/agent/connect.ts)은 이것으로 제 문장을 고른다. 터미널의 kind·reason 은 그대로다.
 * - `bad_url` — URL 로 못 읽었거나 state 가 아예 없다(콜백 주소가 아니다. 다른 것을 붙여넣었다)
 * - `state` — state 가 있는데 다르다(다른 로그인에서 나온 주소)
 * - `denied` — 우리 로그인인데 거부·취소됐다
 * - `no_code` — 우리 로그인인데 code 가 없다(로그인 주소 자체를 붙여넣은 경우 등)
 */
export type CallbackFailure = "bad_url" | "state" | "denied" | "no_code";

export type CallbackResult =
  | { kind: "ok"; code: string }
  | { kind: "denied"; reason: string; failure: "denied" | "no_code" } // 우리 로그인인데 실패함 → 끝낸다
  | { kind: "ignore"; reason: string; failure: "bad_url" | "state" }; // 우리 로그인이 아님 → 계속 기다린다

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
    url = new URL(rawUrl.trim(), `http://localhost:${CALLBACK_PORT}`);
  } catch {
    return {
      kind: "ignore",
      reason: "주소를 이해하지 못했어요. 브라우저 주소창의 주소를 그대로 붙여넣어 주세요.",
      failure: "bad_url",
    };
  }

  const state = url.searchParams.get("state");
  if (!state || state !== expectedState) {
    return {
      kind: "ignore",
      reason: "state 가 일치하지 않아요. 이 실행에서 연 로그인 주소가 맞는지 확인하고 다시 시작해 주세요.",
      failure: state ? "state" : "bad_url",
    };
  }

  const failure = safeCode(url.searchParams.get("error"));
  if (failure) {
    return { kind: "denied", reason: `로그인이 취소되었거나 거부됐어요 (${failure}).`, failure: "denied" };
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return { kind: "denied", reason: "주소에 code 가 없어요. 로그인을 다시 시작해 주세요.", failure: "no_code" };
  }

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
 * `exchangeCode` 가 던지는 **유일한** 예외. 문구는 이 파일이 직접 지은 것뿐이라(상태 코드와
 * `safeCode` 를 거친 짧은 코드만 섞인다) 화면에 그대로 띄워도 된다는 표시다.
 * 관리자 화면은 이 종류가 아닌 예외를 일반 문구로 바꾼다 — 모르는 예외에는 무엇이 실렸을지 모른다.
 */
export class TokenExchangeError extends Error {
  /** 응답의 짧은 OAuth 오류 코드(`invalid_grant` 등, safeCode 를 거친 것). 없으면 null. */
  readonly oauthError: string | null;
  constructor(message: string, oauthError: string | null = null) {
    super(message);
    this.name = "TokenExchangeError";
    this.oauthError = oauthError;
  }
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
    throw new TokenExchangeError("토큰 교환 요청을 보내지 못했어요 (네트워크 오류이거나 시간이 초과됐어요).");
  }

  if (!res.ok) {
    let hint: string | null = null;
    try {
      const body = (await res.json()) as { error?: unknown };
      hint = safeCode(typeof body.error === "string" ? body.error : null);
    } catch {
      // 본문을 못 읽으면 상태 코드만 씁니다.
    }
    throw new TokenExchangeError(`토큰 교환에 실패했어요 (HTTP ${res.status}${hint ? ` · ${hint}` : ""}).`, hint);
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
    throw new TokenExchangeError("토큰 응답에 access_token·refresh_token 이 없어요.");
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
