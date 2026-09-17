// Codex(ChatGPT) OAuth 토큰 저장·갱신.
// Vercel 은 파일을 쓸 수 없고 refresh_token 은 교체될 수 있으므로 DB 에 둡니다.
// ⚠️ 토큰 값은 로그·에러 메시지에 절대 넣지 않습니다. 밖으로 나가는 건 account_id 와 만료 시각까지.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/agent/crypto";

const AUTH_ID = "main";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_URL = "https://auth.openai.com/oauth/token";

const REFRESH_WINDOW_MS = 5 * 60 * 1000; // 만료 5분 전이면 미리 갱신
const HTTP_TIMEOUT_MS = 15_000;
const TX_TIMEOUT_MS = 30_000; // 갱신 HTTP 요청이 트랜잭션 안에서 일어납니다
const TX_MAX_WAIT_MS = 10_000;

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

/** access_token(JWT) 의 exp 클레임. JWT 가 아니면 null. 값은 남기지 않습니다. */
function jwtExpiry(accessToken: string): Date | null {
  const payload = accessToken.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown };
    if (typeof claims.exp === "number" && Number.isFinite(claims.exp)) return new Date(claims.exp * 1000);
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
  if (typeof at === "number" && Number.isFinite(at)) return new Date(at < 1e12 ? at * 1000 : at);
  const within = hint.expires_in;
  if (typeof within === "number" && Number.isFinite(within)) return new Date(Date.now() + within * 1000);
  return new Date(Date.now() + 60 * 60 * 1000); // 알 수 없으면 1시간만 믿습니다.
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
    where: { id: AUTH_ID },
    update: row,
    create: { id: AUTH_ID, ...row },
  });
}

/**
 * 쓸 수 있는 access_token 을 돌려줍니다.
 * 만료 5분 전이면 갱신하고, `force` 면 만료 여부와 상관없이 갱신합니다(401 재시도용).
 */
export async function getAccessToken(force = false): Promise<string> {
  const row = await prisma.agentAuth.findUnique({ where: { id: AUTH_ID } });
  if (!row) {
    throw new Error("에이전트 토큰이 아직 없어요. `npm run agent:auth -- <codex_auth.json>` 로 넣어 주세요.");
  }
  if (!force && row.expiresAt.getTime() - REFRESH_WINDOW_MS > Date.now()) {
    return decryptSecret(row.accessToken);
  }
  return refreshAccessToken(row.accessToken);
}

/**
 * 행을 잠그고(SELECT … FOR UPDATE) 갱신합니다 — 동시에 들어온 요청 중 하나만 갱신하도록.
 * 갱신에 실패하면 예외를 던지고 기존 토큰은 그대로 둡니다.
 */
async function refreshAccessToken(staleAccessToken: string): Promise<string> {
  return prisma.$transaction(
    async (tx) => {
      const locked = await lockRow(tx);
      // 잠금을 기다리는 사이 다른 요청이 이미 갱신했다면 그 토큰을 씁니다.
      if (locked.accessToken !== staleAccessToken) return decryptSecret(locked.accessToken);

      const previousRefreshToken = decryptSecret(locked.refreshToken);
      const fresh = await requestRefresh(previousRefreshToken);
      await tx.agentAuth.update({
        where: { id: AUTH_ID },
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
    SELECT "accessToken", "refreshToken" FROM "AgentAuth" WHERE "id" = ${AUTH_ID} FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new Error("에이전트 토큰이 사라졌어요. `npm run agent:auth` 로 다시 넣어 주세요.");
  return row;
}

interface RefreshResult extends ExpiryHint {
  access_token: string;
  refresh_token?: string;
}

async function requestRefresh(refreshToken: string): Promise<RefreshResult> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch {
    // 원인 객체에 요청 본문이 실릴 수 있으므로 그대로 올리지 않습니다.
    throw new Error("토큰 갱신 요청을 보내지 못했어요 (네트워크 오류이거나 시간이 초과됐어요).");
  }

  if (!res.ok) {
    const code = await oauthErrorCode(res);
    throw new Error(
      `토큰 갱신에 실패했어요 (HTTP ${res.status}${code ? ` · ${code}` : ""}). ` +
        "`npm run agent:auth` 로 토큰을 다시 넣어 주세요."
    );
  }

  const body = (await res.json().catch(() => null)) as Partial<RefreshResult> | null;
  if (!body || typeof body.access_token !== "string" || !body.access_token) {
    throw new Error("토큰 갱신 응답에 access_token 이 없어요.");
  }
  return {
    access_token: body.access_token,
    refresh_token: typeof body.refresh_token === "string" ? body.refresh_token : undefined,
    expires_in: typeof body.expires_in === "number" ? body.expires_in : undefined,
    expires_at: typeof body.expires_at === "number" ? body.expires_at : undefined,
  };
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
