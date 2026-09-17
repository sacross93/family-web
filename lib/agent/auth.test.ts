import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { requestRefresh, getAccessToken, saveAuth, type RefreshResult } from "@/lib/agent/auth";
import { decryptSecret } from "@/lib/agent/crypto";
import { prisma } from "@/lib/prisma";

beforeAll(() => { process.env.AUTH_SECRET = "test-secret-for-agent-auth"; });

// 갱신 본문 형식(JSON/form)은 실제 갱신 시점까지 확인할 수 없어 둘 다 시도합니다.
// 여기서는 fetch 를 주입해 그 순서와 형식을 고정합니다 — 실제 네트워크는 타지 않습니다.

const TOKEN = "refresh-token-테스트";

function ok(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function fail(status: number, body: Record<string, unknown> = { error: "invalid_request" }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function callOf(f: ReturnType<typeof vi.fn>, i: number) {
  const init = f.mock.calls[i][1] as RequestInit;
  const headers = init.headers as Record<string, string>;
  return { url: f.mock.calls[i][0] as string, contentType: headers["Content-Type"], body: String(init.body) };
}

afterEach(() => { vi.restoreAllMocks(); });

describe("토큰 갱신 — 본문 형식", () => {
  it("먼저 JSON 으로 보내고, 성공하면 form 을 시도하지 않는다", async () => {
    const f = vi.fn(async () => ok({ access_token: "새-access", refresh_token: "새-refresh" }));
    const r = await requestRefresh(TOKEN, f as unknown as typeof fetch);

    expect(f).toHaveBeenCalledTimes(1);
    const first = callOf(f, 0);
    expect(first.url).toBe("https://auth.openai.com/oauth/token");
    expect(first.contentType).toBe("application/json");
    expect(JSON.parse(first.body)).toEqual({
      client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
      grant_type: "refresh_token",
      refresh_token: TOKEN,
    });
    expect(r.access_token).toBe("새-access");
    expect(r.refresh_token).toBe("새-refresh");
  });

  it("JSON 이 400 이면 form-encoded 로 1회 재시도해 성공한다", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(fail(400, { error: "unsupported_content_type" }))
      .mockResolvedValueOnce(ok({ access_token: "새-access", expires_in: 3600 }));

    const r = await requestRefresh(TOKEN, f as unknown as typeof fetch);

    expect(f).toHaveBeenCalledTimes(2);
    expect(callOf(f, 0).contentType).toBe("application/json");

    const second = callOf(f, 1);
    expect(second.contentType).toBe("application/x-www-form-urlencoded");
    const form = new URLSearchParams(second.body);
    expect(form.get("client_id")).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe(TOKEN);
    expect(r.access_token).toBe("새-access");
    expect(r.expires_in).toBe(3600);
  });

  it("두 형식 모두 실패하면 예외 (HTTP 상태와 코드만 담는다)", async () => {
    // 토큰이 죽었다는 코드(invalid_grant 등)가 아니어야 2차 시도까지 갑니다.
    const f = vi.fn(async () => fail(400, { error: "unsupported_content_type" }));
    await expect(requestRefresh(TOKEN, f as unknown as typeof fetch)).rejects.toThrow(
      /400.*unsupported_content_type/
    );
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("5xx 는 형식 문제가 아니므로 재시도하지 않는다", async () => {
    const f = vi.fn(async () => fail(503, { error: "server_error" }));
    await expect(requestRefresh(TOKEN, f as unknown as typeof fetch)).rejects.toThrow(/503/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("네트워크 오류도 재시도하지 않고, 메시지에 원인 객체를 싣지 않는다", async () => {
    const f = vi.fn(async () => { throw new Error(`보내려던 본문: ${TOKEN}`); });
    await expect(requestRefresh(TOKEN, f as unknown as typeof fetch)).rejects.toThrow(/네트워크 오류/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("200 이지만 access_token 이 없으면 예외", async () => {
    const f = vi.fn(async () => ok({ token_type: "Bearer" }));
    await expect(requestRefresh(TOKEN, f as unknown as typeof fetch)).rejects.toThrow(/access_token/);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("토큰 갱신 — 비밀 비노출", () => {
  it("성공 로그에는 형식 이름만 남고 토큰은 남지 않는다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = vi
      .fn()
      .mockResolvedValueOnce(fail(400))
      .mockResolvedValueOnce(ok({ access_token: "새-access", refresh_token: "새-refresh" }));

    await requestRefresh(TOKEN, f as unknown as typeof fetch);

    expect(warn).toHaveBeenCalledTimes(1);
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toBe("refresh: form ok");
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain("새-access");
    expect(logged).not.toContain("새-refresh");
  });

  it("실패 메시지에 토큰이 들어가지 않는다", async () => {
    const f = vi.fn(async () => fail(401, { error: "invalid_grant" }));
    const err = await requestRefresh(TOKEN, f as unknown as typeof fetch).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain(TOKEN);
  });

  it("invalid_grant 는 토큰이 죽은 것이므로 form 재시도를 건너뛴다", async () => {
    const f = vi.fn(async () => fail(400, { error: "invalid_grant" }));
    await expect(requestRefresh(TOKEN, f as unknown as typeof fetch)).rejects.toThrow(/invalid_grant/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("invalid_client 도 마찬가지로 건너뛴다", async () => {
    const f = vi.fn(async () => fail(401, { error: "invalid_client" }));
    await expect(requestRefresh(TOKEN, f as unknown as typeof fetch)).rejects.toThrow(/invalid_client/);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────
// 여기부터는 로컬 Postgres 의 AgentAuth 싱글턴 행을 실제로 씁니다.
// 갱신 HTTP 는 주입한 스텁으로 대체하므로 네트워크는 타지 않습니다.
// ⚠️ 실제 토큰 행을 보존하기 위해 시작 전에 원본을 떠 두고 각 테스트 뒤·전체 종료 뒤 되돌립니다.
// ─────────────────────────────────────────────────────────────
describe("토큰 저장소 — 저장·갱신·롤백", () => {
  type Snapshot = {
    provider: string;
    accessToken: string;
    refreshToken: string;
    accountId: string | null;
    expiresAt: Date;
  };

  let backup: Snapshot | null = null;

  async function currentRow(): Promise<Snapshot> {
    const r = await prisma.agentAuth.findUnique({ where: { id: "main" } });
    if (!r) throw new Error("테스트 준비 실패: AgentAuth 행이 없습니다.");
    return {
      provider: r.provider,
      accessToken: r.accessToken,
      refreshToken: r.refreshToken,
      accountId: r.accountId,
      expiresAt: r.expiresAt,
    };
  }

  async function restore() {
    if (backup) {
      await prisma.agentAuth.upsert({
        where: { id: "main" },
        update: backup,
        create: { id: "main", ...backup },
      });
    } else {
      await prisma.agentAuth.deleteMany({ where: { id: "main" } });
    }
  }

  /** 갱신 창(2일) 밖에 있는 더미 토큰을 넣습니다. */
  async function seed(refreshToken = "refresh-A") {
    await saveAuth({
      access_token: "access-A",
      refresh_token: refreshToken,
      expires_in: 30 * 24 * 60 * 60,
      account_id: "test-account",
      provider: "openai-codex",
    });
  }

  beforeAll(async () => {
    const existing = await prisma.agentAuth.findUnique({ where: { id: "main" } });
    backup = existing
      ? {
          provider: existing.provider,
          accessToken: existing.accessToken,
          refreshToken: existing.refreshToken,
          accountId: existing.accountId,
          expiresAt: existing.expiresAt,
        }
      : null;
  });

  beforeEach(async () => { await seed(); });
  afterEach(async () => { await restore(); });
  afterAll(async () => { await restore(); });

  it("저장하면 평문이 아니라 암호문이 들어간다", async () => {
    const row = await currentRow();
    expect(row.accessToken).not.toBe("access-A");
    expect(row.refreshToken).not.toBe("refresh-A");
    expect(decryptSecret(row.accessToken)).toBe("access-A");
    expect(decryptSecret(row.refreshToken)).toBe("refresh-A");
  });

  it("만료가 멀면 갱신하지 않고 저장된 토큰을 돌려준다", async () => {
    const refresh = vi.fn(async () => { throw new Error("갱신하면 안 됩니다"); });
    await expect(getAccessToken(false, refresh)).resolves.toBe("access-A");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("force=true 면 만료가 멀어도 갱신한다", async () => {
    const refresh = vi.fn(async (): Promise<RefreshResult> => ({ access_token: "access-B", expires_in: 3600 }));
    await expect(getAccessToken(true, refresh)).resolves.toBe("access-B");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("새 refresh_token 이 오면 행의 암호문이 바뀌고 새 값으로 복호화된다", async () => {
    const before = await currentRow();
    const refresh = vi.fn(async (): Promise<RefreshResult> => ({
      access_token: "access-B",
      refresh_token: "refresh-B",
      expires_in: 3600,
    }));

    await expect(getAccessToken(true, refresh)).resolves.toBe("access-B");

    // 갱신 함수에는 **기존** refresh_token 이 넘어가야 한다.
    expect(refresh).toHaveBeenCalledWith("refresh-A");

    const after = await currentRow();
    expect(after.refreshToken).not.toBe(before.refreshToken);
    expect(decryptSecret(after.refreshToken)).toBe("refresh-B");
    expect(decryptSecret(after.accessToken)).toBe("access-B");
    expect(after.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("새 refresh_token 이 없으면 기존 것을 유지한다", async () => {
    const refresh = vi.fn(async (): Promise<RefreshResult> => ({ access_token: "access-B", expires_in: 3600 }));
    await getAccessToken(true, refresh);

    const after = await currentRow();
    expect(decryptSecret(after.refreshToken)).toBe("refresh-A");
    expect(decryptSecret(after.accessToken)).toBe("access-B");
  });

  it("갱신이 실패하면 예외를 던지고 행은 그대로다 (트랜잭션 롤백)", async () => {
    const before = await currentRow();
    const refresh = vi.fn(async () => { throw new Error("갱신 실패"); });

    await expect(getAccessToken(true, refresh)).rejects.toThrow("갱신 실패");

    const after = await currentRow();
    expect(after.accessToken).toBe(before.accessToken);
    expect(after.refreshToken).toBe(before.refreshToken);
    expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime());
  });

  it("AUTH_SECRET 이 바뀌어 복호화가 안 되면 안내 문구로 바꿔 던진다", async () => {
    const keep = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "완전히-다른-비밀";
    try {
      await expect(getAccessToken(false)).rejects.toThrow(/AUTH_SECRET 이 바뀌었다면/);
    } finally {
      process.env.AUTH_SECRET = keep;
    }
  });
});
