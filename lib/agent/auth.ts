// Codex(ChatGPT) OAuth 토큰 저장·갱신.
// Vercel 은 파일을 쓸 수 없고 refresh_token 은 교체될 수 있으므로 DB 에 둡니다.
// ⚠️ 토큰 값은 로그·에러 메시지에 절대 넣지 않습니다. 밖으로 나가는 건 account_id 와 만료 시각까지.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/agent/crypto";

/**
 * 토큰이 들어 있는 싱글턴 행의 id. 기본은 `"main"` 입니다.
 *
 * `AGENT_AUTH_ROW_ID` 로 바꿀 수 있는 이유는 **테스트 때문**입니다 — 자동 테스트가
 * 실제 토큰 행을 덮어썼다가 중간에 죽으면 평문이 DB 에만 있으므로 복구할 길이 없습니다.
 * 테스트는 이 값을 별도 행으로 돌려 실제 행을 아예 건드리지 않습니다.
 * (상수로 굳히지 않고 매번 읽습니다 — lib/agent/config.ts 의 agentConfig() 와 같은 이유)
 * 운영에서는 설정하지 마세요.
 */
export function authRowId(): string {
  return process.env.AGENT_AUTH_ROW_ID || "main";
}

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_URL = "https://auth.openai.com/oauth/token";

// 만료 이틀 전부터 갱신합니다.
// 상류 Codex CLI 는 "JWT exp 5분 전"에 갱신하지만, 그건 **계속 떠 있는 프로세스가 주기적으로**
// 검사하기 때문에 가능한 값입니다(codex-rs …/auth/manager.rs 의 should_refresh_proactively).
// 우리는 스케줄러 없이 **요청이 들어올 때만** 검사하므로, 창이 좁으면 하필 그 5분에
// 아무도 에이전트를 쓰지 않았다는 이유로 access·refresh 가 같이 죽어 재주입이 필요해집니다.
// 이틀은 상류가 JWT 를 못 읽을 때 쓰는 대체 규칙(8일마다 갱신 · 토큰 수명 10일)과 같은 지점입니다.
const REFRESH_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
// 갱신 HTTP 는 트랜잭션·서버리스 함수 시간 안에서 끝나야 합니다. 형식 폴백까지 최대 2회(=16초).
const HTTP_TIMEOUT_MS = 8_000;
const TX_TIMEOUT_MS = 30_000; // 갱신 HTTP 요청이 트랜잭션 안에서 일어납니다
const TX_MAX_WAIT_MS = 10_000;

/** 토큰이 이미 죽은 경우. 본문 형식 문제가 아니므로 다른 형식으로 재시도해도 소용없습니다. */
const DEAD_TOKEN_CODES = new Set(["invalid_grant", "invalid_client"]);

/** 로컬에서 받은 `codex_auth.json` 의 모양. */
export interface CodexAuthFile {
  access_token: string;
  refresh_token: string;
  expires_in?: number | null;
  expires_at?: number | null;
  account_id?: string | null;
  provider?: string | null;
}

interface ExpiryHint {
  expires_in?: number | null;
  expires_at?: number | null;
}

/**
 * 밀리초를 Date 로. 범위를 벗어나면 null.
 * `new Date(NaN)`·`new Date(1e21)` 은 **Invalid Date 인데 객체라 truthy** 라서,
 * 그대로 Prisma 에 넘어가면 validation 오류 메시지에 `data`(= 암호문)가 통째로 실립니다.
 */
function toDate(ms: number): Date | null {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** access_token(JWT) 의 exp 클레임. JWT 가 아니면 null. 값은 남기지 않습니다. */
function jwtExpiry(accessToken: string): Date | null {
  const payload = accessToken.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown };
    if (typeof claims.exp === "number" && Number.isFinite(claims.exp)) return toDate(claims.exp * 1000);
  } catch {
    // JWT 가 아니면 아래 힌트로 넘어갑니다.
  }
  return null;
}

/** 만료 시각: 토큰 자체(JWT exp)가 가장 정확하고, 없으면 응답의 expires_at·expires_in. */
function resolveExpiry(accessToken: string, hint: ExpiryHint): Date {
  const fromToken = jwtExpiry(accessToken);
  if (fromToken) return fromToken;
  const at = hint.expires_at;
  if (typeof at === "number" && Number.isFinite(at)) {
    const d = toDate(at < 1e12 ? at * 1000 : at);
    if (d) return d;
  }
  const within = hint.expires_in;
  if (typeof within === "number" && Number.isFinite(within)) {
    const d = toDate(Date.now() + within * 1000);
    if (d) return d;
  }
  return new Date(Date.now() + 60 * 60 * 1000); // 알 수 없으면 1시간만 믿습니다.
}

/**
 * 저장된 암호문을 풉니다. 실패하면 Node 의 `Unsupported state or unable to authenticate data`
 * 대신 무엇을 해야 하는지 알려주는 문구로 바꿉니다(AUTH_SECRET 이 바뀐 경우가 대부분).
 */
function readSecret(blob: string): string {
  try {
    return decryptSecret(blob);
  } catch {
    throw new Error(
      "저장된 토큰을 읽지 못했어요. AUTH_SECRET 이 바뀌었다면 `npm run agent:auth` 로 다시 넣어 주세요."
    );
  }
}

/** 토큰을 암호화해 싱글턴 행에 저장합니다. */
export async function saveAuth(data: CodexAuthFile): Promise<void> {
  const row = {
    provider: data.provider || "openai-codex",
    accessToken: encryptSecret(data.access_token),
    refreshToken: encryptSecret(data.refresh_token),
    accountId: data.account_id ?? null,
    expiresAt: resolveExpiry(data.access_token, data),
  };
  await prisma.agentAuth.upsert({
    where: { id: authRowId() },
    update: row,
    create: { id: authRowId(), ...row },
  });
}

/**
 * `chatgpt-account-id` 헤더에 쓰는 계정 식별자(UUID). **비밀이 아닙니다.**
 * 주입할 때 access_token(JWT)의 `https://api.openai.com/auth` → `chatgpt_account_id`
 * 클레임에서 뽑아 평문 컬럼에 저장해 둔 값이라, 요청마다 토큰을 다시 파싱할 필요가 없습니다.
 * 행이 없거나 저장돼 있지 않으면 `null` — 이 헤더는 없어도 요청이 나가므로 예외를 던지지 않습니다.
 */
export async function getAccountId(): Promise<string | null> {
  const row = await prisma.agentAuth.findUnique({
    where: { id: authRowId() },
    select: { accountId: true },
  });
  return row?.accountId ?? null;
}

/** 갱신 HTTP 를 대신 수행하는 함수. 테스트에서 주입합니다(네트워크를 타지 않게). */
export type RefreshFn = (refreshToken: string) => Promise<RefreshResult>;

/**
 * 쓸 수 있는 access_token 을 돌려줍니다.
 * 만료가 REFRESH_WINDOW_MS 안으로 들어오면 갱신하고,
 * `force` 면 만료 여부와 상관없이 갱신합니다(401 재시도용).
 */
export async function getAccessToken(force = false, refresh: RefreshFn = requestRefresh): Promise<string> {
  const row = await prisma.agentAuth.findUnique({ where: { id: authRowId() } });
  if (!row) {
    throw new Error("에이전트 토큰이 아직 없어요. `npm run agent:auth -- <codex_auth.json>` 로 넣어 주세요.");
  }
  if (!force && row.expiresAt.getTime() - REFRESH_WINDOW_MS > Date.now()) {
    return readSecret(row.accessToken);
  }
  return refreshAccessToken(row.accessToken, refresh);
}

/**
 * 행을 잠그고(SELECT … FOR UPDATE) 갱신합니다 — 동시에 들어온 요청 중 하나만 갱신하도록.
 * 갱신에 실패하면 예외를 던지고 기존 토큰은 그대로 둡니다(트랜잭션 롤백).
 */
async function refreshAccessToken(staleAccessToken: string, refresh: RefreshFn): Promise<string> {
  return prisma.$transaction(
    async (tx) => {
      const locked = await lockRow(tx);
      // 잠금을 기다리는 사이 다른 요청이 이미 갱신했다면 그 토큰을 씁니다.
      if (locked.accessToken !== staleAccessToken) return readSecret(locked.accessToken);

      const previousRefreshToken = readSecret(locked.refreshToken);
      const fresh = await refresh(previousRefreshToken);
      await tx.agentAuth.update({
        where: { id: authRowId() },
        data: {
          accessToken: encryptSecret(fresh.access_token),
          // 새 refresh_token 이 오면 이전 것은 못 쓰게 되므로 반드시 갈아끼웁니다.
          refreshToken: encryptSecret(fresh.refresh_token || previousRefreshToken),
          expiresAt: resolveExpiry(fresh.access_token, fresh),
        },
      });
      return fresh.access_token;
    },
    { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS }
  );
}

async function lockRow(tx: Prisma.TransactionClient): Promise<{ accessToken: string; refreshToken: string }> {
  const rows = await tx.$queryRaw<Array<{ accessToken: string; refreshToken: string }>>`
    SELECT "accessToken", "refreshToken" FROM "AgentAuth" WHERE "id" = ${authRowId()} FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new Error("에이전트 토큰이 사라졌어요. `npm run agent:auth` 로 다시 넣어 주세요.");
  return row;
}

export interface RefreshResult extends ExpiryHint {
  access_token: string;
  refresh_token?: string;
}

/** 본문 형식. 어느 쪽이 맞는지 실측할 수 없어 둘 다 시도합니다(아래 requestRefresh 주석). */
type RefreshEncoding = "json" | "form";

type RefreshAttempt =
  | { ok: true; value: RefreshResult }
  | { ok: false; reason: "network" | "http" | "body"; status: number | null; code: string | null };

function refreshPayload(encoding: RefreshEncoding, refreshToken: string) {
  const fields = { client_id: CLIENT_ID, grant_type: "refresh_token", refresh_token: refreshToken };
  return encoding === "json"
    ? { contentType: "application/json", body: JSON.stringify(fields) }
    : { contentType: "application/x-www-form-urlencoded", body: new URLSearchParams(fields).toString() };
}

/**
 * 토큰을 갱신합니다. 본문 형식은 **JSON 먼저, 4xx 면 form-encoded 로 1회 재시도** 입니다.
 * 상류 Codex CLI 는 JSON 을 쓰고(codex-rs/login/src/auth/manager.rs), 이 엔드포인트가
 * form-encoded 를 받아준다는 것도 실측된 바 있어 — 어느 쪽이 refresh 에 맞는지는
 * 실제 갱신 시점(토큰 만료 직전)까지 확인할 수 없습니다. 그래서 고르지 않고 둘 다 시도합니다.
 * 테스트를 위해 fetch 를 주입할 수 있습니다.
 */
export async function requestRefresh(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<RefreshResult> {
  const first = await attemptRefresh("json", refreshToken, fetchImpl);
  if (first.ok) {
    console.warn("refresh: json ok");
    return first.value;
  }

  // 4xx 는 "형식이 마음에 안 든다"일 수 있으니 다른 형식으로 한 번 더. 5xx·네트워크 오류는 형식 문제가 아닙니다.
  // 단 invalid_grant·invalid_client 는 토큰이 이미 죽은 것이라, 2차 시도는 확정적으로 실패하고
  // refresh_token 만 한 번 더 밖으로 나갑니다 → 건너뜁니다.
  const tokenIsDead = first.code !== null && DEAD_TOKEN_CODES.has(first.code);
  if (
    first.reason === "http" &&
    first.status !== null &&
    first.status >= 400 &&
    first.status < 500 &&
    !tokenIsDead
  ) {
    const second = await attemptRefresh("form", refreshToken, fetchImpl);
    if (second.ok) {
      console.warn("refresh: form ok");
      return second.value;
    }
    throw refreshError(second);
  }
  throw refreshError(first);
}

async function attemptRefresh(
  encoding: RefreshEncoding,
  refreshToken: string,
  fetchImpl: typeof fetch
): Promise<RefreshAttempt> {
  const { contentType, body } = refreshPayload(encoding, refreshToken);
  let res: Response;
  try {
    res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch {
    // 원인 객체에 요청 본문이 실릴 수 있으므로 그대로 올리지 않습니다.
    return { ok: false, reason: "network", status: null, code: null };
  }

  if (!res.ok) {
    return { ok: false, reason: "http", status: res.status, code: await oauthErrorCode(res) };
  }

  const parsed = (await res.json().catch(() => null)) as Partial<RefreshResult> | null;
  if (!parsed || typeof parsed.access_token !== "string" || !parsed.access_token) {
    return { ok: false, reason: "body", status: res.status, code: null };
  }
  return {
    ok: true,
    value: {
      access_token: parsed.access_token,
      refresh_token: typeof parsed.refresh_token === "string" ? parsed.refresh_token : undefined,
      expires_in: typeof parsed.expires_in === "number" ? parsed.expires_in : undefined,
      expires_at: typeof parsed.expires_at === "number" ? parsed.expires_at : undefined,
    },
  };
}

/** 실패 사유를 사람이 읽을 문구로. 토큰 값은 들어가지 않습니다. */
function refreshError(attempt: Extract<RefreshAttempt, { ok: false }>): Error {
  if (attempt.reason === "network") {
    return new Error("토큰 갱신 요청을 보내지 못했어요 (네트워크 오류이거나 시간이 초과됐어요).");
  }
  if (attempt.reason === "body") {
    return new Error("토큰 갱신 응답에 access_token 이 없어요.");
  }
  return new Error(
    `토큰 갱신에 실패했어요 (HTTP ${attempt.status}${attempt.code ? ` · ${attempt.code}` : ""}). ` +
      "`npm run agent:auth` 로 토큰을 다시 넣어 주세요."
  );
}

/** 오류 응답에서 짧은 코드(invalid_grant 등)만 뽑습니다. 본문을 그대로 쓰지 않습니다. */
async function oauthErrorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: unknown; code?: unknown };
    const raw =
      typeof body.error === "string"
        ? body.error
        : typeof (body.error as { type?: unknown } | undefined)?.type === "string"
          ? (body.error as { type: string }).type
          : typeof body.code === "string"
            ? body.code
            : null;
    return raw && /^[a-z0-9_]{1,40}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}
