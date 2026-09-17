import { describe, it, expect, vi, beforeAll } from "vitest";
import {
  createPkce,
  buildAuthorizeUrl,
  readCallback,
  exchangeCode,
  extractAccountId,
} from "./codex-login";
import { normalizeAuthFile } from "./agent-auth";

beforeAll(() => { process.env.AUTH_SECRET = "test-secret-for-codex-login"; });

// 실제 로그인은 돌리지 않습니다 — 순수 함수와 주입한 fetch 로만 검증합니다.

describe("PKCE · 인증 주소", () => {
  it("verifier 에서 S256 challenge 를 만든다", () => {
    const { verifier, challenge, state } = createPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/); // sha256 → 32바이트 → 43자
    expect(state).toMatch(/^[0-9a-f]{32}$/); // 16바이트 hex
    expect(challenge).not.toBe(verifier);
  });

  it("매번 다른 값이 나온다", () => {
    expect(createPkce().verifier).not.toBe(createPkce().verifier);
  });

  it("인증 주소에 필요한 파라미터가 모두 있다", () => {
    const url = new URL(buildAuthorizeUrl("챌린지", "스테이트"));
    expect(url.origin + url.pathname).toBe("https://auth.openai.com/oauth/authorize");
    const q = url.searchParams;
    expect(q.get("response_type")).toBe("code");
    expect(q.get("client_id")).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
    expect(q.get("redirect_uri")).toBe("http://localhost:1455/auth/callback");
    expect(q.get("scope")).toBe("openid profile email offline_access");
    expect(q.get("code_challenge")).toBe("챌린지");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("state")).toBe("스테이트");
    expect(q.get("id_token_add_organizations")).toBe("true");
    expect(q.get("codex_cli_simplified_flow")).toBe("true");
    expect(q.get("originator")).toBe("python-cli");
  });
});

describe("콜백 해석", () => {
  const STATE = "0123456789abcdef0123456789abcdef";

  it("전체 주소에서 code 를 꺼낸다", () => {
    expect(readCallback(`http://localhost:1455/auth/callback?code=CODE-1&state=${STATE}`, STATE)).toBe("CODE-1");
  });

  it("경로만 붙여넣어도 받는다", () => {
    expect(readCallback(`/auth/callback?code=CODE-2&state=${STATE}`, STATE)).toBe("CODE-2");
  });

  it("state 가 다르면 거부한다", () => {
    expect(() => readCallback(`/auth/callback?code=CODE&state=다른값`, STATE)).toThrow(/state 가 일치하지 않아요/);
  });

  it("state 가 없으면 거부한다", () => {
    expect(() => readCallback(`/auth/callback?code=CODE`, STATE)).toThrow(/state 가 일치하지 않아요/);
  });

  it("code 가 없으면 거부한다", () => {
    expect(() => readCallback(`/auth/callback?state=${STATE}`, STATE)).toThrow(/code 가 없어요/);
  });

  it("사용자가 거부하면 그 사유를 알려준다", () => {
    expect(() => readCallback(`/auth/callback?error=access_denied&state=${STATE}`, STATE)).toThrow(/access_denied/);
  });
});

describe("토큰 교환", () => {
  function ok(body: Record<string, unknown>): Response {
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }

  it("form-encoded 로 보내고 필요한 필드를 담는다", async () => {
    const f = vi.fn(async () => ok({ access_token: "액세스", refresh_token: "리프레시", expires_in: 864000 }));
    const r = await exchangeCode("CODE-1", "VERIFIER-1", f as unknown as typeof fetch);

    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://auth.openai.com/oauth/token");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const body = new URLSearchParams(String(init.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_id")).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
    expect(body.get("code")).toBe("CODE-1");
    expect(body.get("code_verifier")).toBe("VERIFIER-1");
    expect(body.get("redirect_uri")).toBe("http://localhost:1455/auth/callback");

    expect(r.access_token).toBe("액세스");
    expect(r.refresh_token).toBe("리프레시");
    expect(r.expires_in).toBe(864000);
  });

  it("실패하면 상태 코드만 담아 던진다 (본문·토큰 미포함)", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    const err = await exchangeCode("CODE", "VERIFIER", f as unknown as typeof fetch).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/400.*invalid_grant/);
    expect((err as Error).message).not.toContain("VERIFIER");
  });

  it("토큰이 빠진 응답은 예외", async () => {
    const f = vi.fn(async () => ok({ token_type: "Bearer" }));
    await expect(exchangeCode("CODE", "VERIFIER", f as unknown as typeof fetch)).rejects.toThrow(/access_token/);
  });
});

describe("account_id 추출", () => {
  function jwt(claims: Record<string, unknown>): string {
    const part = (o: unknown) => Buffer.from(JSON.stringify(o), "utf8").toString("base64url");
    return `${part({ alg: "none" })}.${part(claims)}.서명`;
  }

  it("https://api.openai.com/auth 안의 chatgpt_account_id 를 쓴다", () => {
    const token = jwt({ "https://api.openai.com/auth": { chatgpt_account_id: "계정-1" } });
    expect(extractAccountId(token)).toBe("계정-1");
  });

  it("없으면 최상위 account_id 로 넘어간다", () => {
    expect(extractAccountId(jwt({ account_id: "계정-2" }))).toBe("계정-2");
  });

  it("JWT 가 아니면 null", () => {
    expect(extractAccountId("그냥문자열")).toBeNull();
    expect(extractAccountId("a.b.c")).toBeNull();
  });
});

describe("토큰 파일 형식 normalize", () => {
  it("평평한 구조를 그대로 받는다", () => {
    const r = normalizeAuthFile({
      access_token: "액세스",
      refresh_token: "리프레시",
      expires_at: 1790489710,
      account_id: "계정",
      provider: "openai-codex",
    });
    expect(r.access_token).toBe("액세스");
    expect(r.refresh_token).toBe("리프레시");
    expect(r.expires_at).toBe(1790489710);
    expect(r.account_id).toBe("계정");
  });

  it("~/.codex/auth.json 의 중첩 구조도 받는다", () => {
    const r = normalizeAuthFile({
      OPENAI_API_KEY: null,
      tokens: { id_token: "아이디", access_token: "액세스", refresh_token: "리프레시", account_id: "계정" },
      last_refresh: "2026-09-17T00:00:00Z",
    });
    expect(r.access_token).toBe("액세스");
    expect(r.refresh_token).toBe("리프레시");
    expect(r.account_id).toBe("계정");
    // 중첩 구조에는 만료 정보가 없습니다 → saveAuth 가 JWT exp 를 씁니다.
    expect(r.expires_at).toBeUndefined();
    expect(r.expires_in).toBeUndefined();
  });

  it("둘 다 아니면 무엇을 해야 하는지 알려준다", () => {
    expect(() => normalizeAuthFile({ hello: "world" })).toThrow(/agent:login/);
    expect(() => normalizeAuthFile(null)).toThrow(/JSON 객체가 아니에요/);
  });

  it("tokens 안이 비어 있으면 거부한다", () => {
    expect(() => normalizeAuthFile({ tokens: { id_token: "아이디" } })).toThrow(/access_token/);
  });
});
