// 관리자 화면에서 ChatGPT 를 **다시 연결**하는 두 걸음 — 라우트가 부르는 순수한 몸통.
//
// 왜 붙여넣기인가: 등록된 redirect_uri 가 `http://localhost:1455/auth/callback` 하나뿐이라
// 로그인이 끝나면 브라우저가 **가족의 폰·노트북의 localhost** 로 돌아간다. 거기엔 아무것도 없으니
// 그 탭은 "연결할 수 없음" 이 되고, 주소창에 code 와 state 가 남는다. 그 주소를 붙여넣게 한다.
// (터미널의 `npm run agent:login -- --paste` 와 같은 방식. 조각은 lib/agent/oauth.ts 에서 같이 쓴다.)
//
// 시작(startConnect)과 마치기(finishConnect)는 **서로 다른 요청**이라, 그 사이의 verifier·state 를
// 쿠키에 봉해 둔다(lib/agent/crypto.ts 의 sealPending — 토큰과 다른 열쇠). 15분, 한 번 쓰면 끝.
//
// ⚠️ 토큰·verifier·code 는 어떤 결과에도 싣지 않는다. 화면에 가는 것은 아래에서 지은 문구와
//    `TokenExchangeError` 문구(oauth.ts 가 거른 것)와 account_id 뿐이다. connect.test.ts 가 잡는다.
import { openPending, sealPending } from "@/lib/agent/crypto";
import type { CodexAuthFile } from "@/lib/agent/auth";
import {
  TokenExchangeError,
  buildAuthorizeUrl,
  createPkce,
  extractAccountId,
  inspectCallback,
  type TokenResponse,
} from "@/lib/agent/oauth";
import { ALLOW_ACCOUNT_CHANGE_LABEL } from "@/lib/agent/connect-copy";

/** 쿠키 이름. 로그인 세션 쿠키와 섞이지 않게 따로 둔다. */
export const PENDING_COOKIE = "podong_agent_connect";
/** 쿠키가 따라가는 길. 시작·마치기 두 라우트에만 실린다(`/api/agent/connect/finish` 도 이 아래). */
export const PENDING_COOKIE_PATH = "/api/agent/connect";
/** 로그인하고 주소를 붙여넣기까지 주는 시간. 터미널 로그인의 대기 시간(15분)과 같다. */
export const PENDING_TTL_MS = 15 * 60 * 1000;
/**
 * 쿠키 속성(지울 때도 **같은 path** 로 지워야 한다 — path 가 다르면 브라우저는 다른 쿠키로 본다).
 * secure 규칙은 로그인 세션 쿠키(lib/session.ts)와 같다: 운영(HTTPS)에서만, 사설 IP 로 `npm start`
 * 할 때는 `FORCE_INSECURE_COOKIE=1` 로 끈다.
 */
export function pendingCookieBase() {
  return {
    name: PENDING_COOKIE,
    path: PENDING_COOKIE_PATH,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && process.env.FORCE_INSECURE_COOKIE !== "1",
  };
}
/** 실을 때만 maxAge 를 붙인다. ⚠️ 지울 때 maxAge 를 넘기면 Next 가 그것으로 만료를 다시 미래로 잡는다. */
export function pendingCookieSet(pending: string) {
  return { ...pendingCookieBase(), value: pending, maxAge: PENDING_TTL_MS / 1000 };
}

/** 붙여넣은 주소의 상한. 콜백 주소는 수백 자다 — 이보다 길면 다른 것을 붙여넣은 것이다. */
const MAX_URL_CHARS = 4096;

const RESTART = "처음부터 다시 해 주세요 — 연결하기를 다시 눌러 주세요.";
const EMPTY_URL = "로그인을 마친 탭의 주소를 붙여넣어 주세요.";
const TOO_LONG = "붙여넣은 주소가 너무 길어요. 로그인을 마친 탭의 주소창 주소만 붙여넣어 주세요.";
const EXCHANGE_FAILED = "ChatGPT 에서 토큰을 받지 못했어요. 처음부터 다시 연결해 주세요.";
const SAVE_FAILED = "로그인은 됐는데 저장하지 못했어요. 처음부터 다시 연결해 주세요.";
const ACCOUNT_CHANGED =
  `로그인한 계정이 지금 연결된 계정과 달라요. 바꾸려면 '${ALLOW_ACCOUNT_CHANGE_LABEL}'에 체크하고 다시 연결해 주세요.`;
export const CONNECTED = "연결됐어요";

interface PendingLogin {
  verifier: string;
  state: string;
  /** 만료 시각(밀리초). */
  exp: number;
}

export interface StartResult {
  /** 새 탭으로 열 ChatGPT 로그인 주소. challenge·state 가 들어 있다(비밀 아님). */
  url: string;
  /** 쿠키에 그대로 실을 봉인 덩어리. */
  pending: string;
}

/** 로그인 주소를 만들고, 마칠 때 필요한 verifier·state 를 봉해 돌려준다. */
export function startConnect(now: number = Date.now()): StartResult {
  const { verifier, challenge, state } = createPkce();
  const pending: PendingLogin = { verifier, state, exp: now + PENDING_TTL_MS };
  return { url: buildAuthorizeUrl(challenge, state), pending: sealPending(JSON.stringify(pending)) };
}

/** 봉인을 열어 본다. 없거나·깨졌거나·남의 열쇠거나·지났으면 null. */
function readPending(blob: string | undefined, now: number): PendingLogin | null {
  if (!blob) return null;
  try {
    const value = JSON.parse(openPending(blob)) as Partial<PendingLogin> | null;
    if (
      !value ||
      typeof value.verifier !== "string" ||
      typeof value.state !== "string" ||
      typeof value.exp !== "number" ||
      value.exp <= now
    ) {
      return null;
    }
    return { verifier: value.verifier, state: value.state, exp: value.exp };
  } catch {
    return null;
  }
}

export interface FinishInput {
  /** 붙여넣은 콜백 주소(`http://localhost:1455/auth/callback?code=…&state=…`). */
  url: string;
  /** 쿠키에서 읽은 봉인 덩어리. 없으면 undefined. */
  pending: string | undefined;
  /** "다른 계정으로 바꿔도 돼요" 체크. */
  allowAccountChange: boolean;
  /** 지금 저장된 연결. 행이 없으면 null. */
  current: { accountId: string | null } | null;
}

export interface FinishDeps {
  exchange: (code: string, verifier: string) => Promise<TokenResponse>;
  save: (data: CodexAuthFile) => Promise<void>;
  now: () => number;
}

/**
 * `restart` — **진행 중이던 연결이 끝났다**(쿠키를 지운다). code 는 한 번만 쓸 수 있으므로
 * 교환을 시도한 뒤에는 성공이든 실패든 언제나 true. 교환 전에 멈춘 것(주소를 잘못 붙여넣음)은
 * false 라 쿠키가 남고, 15분 안에 맞는 주소를 다시 붙여넣으면 된다.
 */
export type FinishResult =
  | { kind: "ok"; message: string; accountId: string | null; restart: true }
  | { kind: "bad_request"; message: string; restart: boolean }
  | { kind: "account_changed"; message: string; restart: true }
  | { kind: "upstream_error"; message: string; restart: true }
  | { kind: "server_error"; message: string; restart: true };

export async function finishConnect(input: FinishInput, deps: FinishDeps): Promise<FinishResult> {
  const pending = readPending(input.pending, deps.now());
  if (!pending) return { kind: "bad_request", message: RESTART, restart: true };

  const url = input.url.trim();
  if (!url) return { kind: "bad_request", message: EMPTY_URL, restart: false };
  if (url.length > MAX_URL_CHARS) return { kind: "bad_request", message: TOO_LONG, restart: false };

  // state 를 가장 먼저 본다(inspectCallback). 남의 주소로는 교환까지 가지 않는다.
  const callback = inspectCallback(url, pending.state);
  if (callback.kind !== "ok") return { kind: "bad_request", message: callback.reason, restart: false };

  // ── 여기부터 code 를 쓴다. 이후의 결과는 전부 restart: true ──
  let token: TokenResponse;
  try {
    token = await deps.exchange(callback.code, pending.verifier);
  } catch (e) {
    // oauth.ts 가 지은 문구만 그대로 보낸다. 모르는 예외에는 무엇이 실렸을지 모른다.
    const message = e instanceof TokenExchangeError ? e.message : EXCHANGE_FAILED;
    return { kind: "upstream_error", message, restart: true };
  }

  const accountId = extractAccountId(token.access_token);

  // 브라우저에 다른 계정이 물려 있으면 "다시 연결만 했는데" 계정이 바뀐다. 조용히 덮어쓰지 않는다.
  // 터미널 로그인(--force)과 같은 규칙: 어느 한쪽을 모르면 비교할 수 없으니 막지 않는다.
  const before = input.current?.accountId;
  if (before && accountId && accountId !== before && !input.allowAccountChange) {
    return { kind: "account_changed", message: ACCOUNT_CHANGED, restart: true };
  }

  try {
    await deps.save({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_in: token.expires_in,
      expires_at: token.expires_at,
      account_id: accountId,
      provider: "openai-codex",
    });
  } catch {
    // 저장 예외(프리즈마 검증 오류 등)에는 암호문이 통째로 실릴 수 있다 — 문구를 버린다.
    return { kind: "server_error", message: SAVE_FAILED, restart: true };
  }

  return { kind: "ok", message: CONNECTED, accountId, restart: true };
}
