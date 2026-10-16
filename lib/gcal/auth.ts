// 서비스 계정 키 → 구글 access token. `googleapis` 패키지 없이 jose(이미 의존성) 하나로.
//
// 흐름: 키의 private_key 로 JWT(RS256)를 서명해 토큰 끝점에 보내면 1시간짜리 토큰이 온다(스펙 §2).
// 받은 토큰은 이 프로세스 메모리에 **만료 1분 전까지** 둔다 — 요청마다 서명·왕복을 하지 않게.
//
// 비밀이 새는 길을 막는 것이 이 파일의 절반이다. 키·assertion·토큰은 오류 문구에도, cause 에도 싣지 않는다.
// 구글 오류 본문(error_description 등)은 **읽지 않는다** — 거기에 우리가 보낸 assertion 이 되돌아올 수 있다.
// 오류에 남기는 것은 HTTP 상태와 짧은 영숫자 코드뿐이다.
//
// GcalError·timedFetch 가 client.ts 가 아니라 여기 있는 이유: client 가 auth 를 부르므로, 반대로
// auth 가 client 에서 가져오면 순환이 된다. client.ts 는 GcalError 를 그대로 다시 내보낸다.

import { SignJWT, importPKCS8 } from "jose";
import type { GcalOn } from "./config";

export interface GcalDeps {
  fetch?: typeof fetch;
  now?: () => number;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
/** 구글 요청 하나의 상한(스펙 §6). 넘으면 실패로 보고 다음 동기화에 맡긴다. */
export const GCAL_TIMEOUT_MS = 5_000;
/** 만료까지 이만큼 남으면 새로 받는다 — 쓰는 도중에 끊기지 않게 */
const REFRESH_MARGIN_MS = 60_000;

// ─────────────────────────────────────────────
// 오류
// ─────────────────────────────────────────────

const CODE_RE = /^[A-Za-z0-9_]{1,40}$/;

/** 구글이 준 코드 중 짧은 영숫자만 남긴다. 그 밖의 글자(토큰이 섞였을 수도 있는)는 버린다. */
export function safeCode(v: unknown): string | null {
  return typeof v === "string" && CODE_RE.test(v) ? v : null;
}

function messageFor(status: number, code: string | null): string {
  switch (code) {
    case "timeout":
      return `구글 캘린더가 ${GCAL_TIMEOUT_MS / 1000}초 안에 답하지 않았어요`;
    case "network":
      return "구글 캘린더에 연결하지 못했어요";
    case "bad_key":
      return "구글 서비스 계정 키를 읽지 못했어요";
    case "bad_response":
      return `구글 캘린더 응답을 읽지 못했어요 (${status})`;
  }
  // 403·404 는 거의 늘 "공유가 안 됐거나 권한이 '보기'" 다(스펙 §8). 할당량 403 은 그 안내가 틀리니 뺀다.
  if ((status === 403 || status === 404) && !/rate|quota|limit/i.test(code ?? "")) {
    return "캘린더를 열 수 없어요 — 서비스 계정에 '일정 변경'으로 공유됐는지 확인해 주세요";
  }
  return `구글 캘린더 요청이 실패했어요 (${status}${code ? ` · ${code}` : ""})`;
}

/** message 는 한국어 짧은 문구. 비밀 없음 — status 와 걸러진 code 만으로 만든다. */
export class GcalError extends Error {
  status: number;
  code: string | null;
  constructor(status: number, code: string | null, message?: string) {
    const safe = safeCode(code);
    super(message ?? messageFor(status, safe));
    this.name = "GcalError";
    this.status = status;
    this.code = safe;
  }
}

// ─────────────────────────────────────────────
// 5초 제한 fetch
// ─────────────────────────────────────────────

/**
 * 본문까지 다 읽고 돌려준다 — 시간 제한이 본문 읽기까지 덮게.
 * AbortSignal.timeout 대신 setTimeout 을 쓰는 이유: 시험이 가짜 시계로 5초를 돌릴 수 있어야 한다.
 * 던지는 것은 언제나 GcalError 이고, 원래 오류(주소·내부 문구가 들어 있을 수 있다)는 버린다.
 */
export async function timedFetch(
  deps: GcalDeps | undefined,
  url: string,
  init: RequestInit,
): Promise<{ status: number; ok: boolean; text: string }> {
  const f = deps?.fetch ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GCAL_TIMEOUT_MS);
  try {
    const res = await f(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    return { status: res.status, ok: res.ok, text };
  } catch {
    throw new GcalError(0, ctrl.signal.aborted ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }
}

/** JSON 이면 그 값, 아니면 undefined. 던지지 않는다. */
export function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

// ─────────────────────────────────────────────
// 토큰
// ─────────────────────────────────────────────

// 서비스 계정별로 하나. 계정이 바뀌면(키 교체) 옛 토큰을 쓰지 않는다.
let cache: { token: string; exp: number; clientEmail: string } | null = null;

/** 시험용 — 모듈 캐시를 비운다. 401 을 받았을 때도 쓴다(토큰이 먼저 죽었으면 다음엔 새로 받게). */
export function _resetTokenCache(): void {
  cache = null;
}

export async function getAccessToken(cfg: GcalOn, deps?: GcalDeps): Promise<string> {
  const now = deps?.now?.() ?? Date.now();
  if (cache && cache.clientEmail === cfg.clientEmail && now < cache.exp - REFRESH_MARGIN_MS) {
    return cache.token;
  }

  let key: CryptoKey;
  try {
    key = await importPKCS8(cfg.privateKey, "RS256");
  } catch {
    throw new GcalError(0, "bad_key");
  }

  const iat = Math.floor(now / 1000);
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(cfg.clientEmail)
    .setAudience(TOKEN_URL)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 3600)
    .sign(key);

  const res = await timedFetch(deps, TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
  });
  const body = parseJson(res.text) as { access_token?: unknown; expires_in?: unknown; error?: unknown } | undefined;

  if (!res.ok) {
    // OAuth 오류는 `{ error: "invalid_grant", error_description: "…" }` — 설명은 읽지 않는다.
    const code = safeCode(body?.error);
    throw new GcalError(res.status, code, `구글 인증에 실패했어요 (${res.status}${code ? ` · ${code}` : ""})`);
  }
  if (typeof body?.access_token !== "string" || !body.access_token) {
    throw new GcalError(res.status, "bad_response", `구글 인증 응답을 읽지 못했어요 (${res.status})`);
  }

  const expiresIn = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 3600;
  cache = { token: body.access_token, exp: now + expiresIn * 1000, clientEmail: cfg.clientEmail };
  return cache.token;
}
