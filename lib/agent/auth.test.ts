import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { requestRefresh } from "@/lib/agent/auth";

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
    const f = vi.fn(async () => fail(400, { error: "invalid_grant" }));
    await expect(requestRefresh(TOKEN, f as unknown as typeof fetch)).rejects.toThrow(/400.*invalid_grant/);
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
});
