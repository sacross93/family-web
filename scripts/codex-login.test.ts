import { describe, it, expect, vi, beforeAll } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createPkce,
  buildAuthorizeUrl,
  readCallback,
  exchangeCode,
  extractAccountId,
  waitForCallbackOnServer,
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

  // 빈 문자열도 string 이라 타입 검사만으로는 통과합니다. 그대로 저장하면 쓰던 토큰이 죽습니다.
  it("빈 문자열 토큰은 거부한다 (기존 토큰을 덮어쓰지 못하게)", async () => {
    const empty = vi.fn(async () => ok({ access_token: "", refresh_token: "" }));
    await expect(exchangeCode("CODE", "V", empty as unknown as typeof fetch)).rejects.toThrow(/access_token/);

    const halfEmpty = vi.fn(async () => ok({ access_token: "액세스", refresh_token: "" }));
    await expect(exchangeCode("CODE", "V", halfEmpty as unknown as typeof fetch)).rejects.toThrow(/refresh_token/);
  });

  it("네트워크 오류 메시지에 code_verifier 가 실리지 않는다", async () => {
    const f = vi.fn(async () => { throw new Error("보내려던 본문: code_verifier=VERIFIER-비밀"); });
    const err = await exchangeCode("CODE", "VERIFIER-비밀", f as unknown as typeof fetch).catch((e: unknown) => e as Error);
    expect((err as Error).message).toMatch(/네트워크 오류/);
    expect((err as Error).message).not.toContain("VERIFIER-비밀");
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

describe("콜백 서버", () => {
  const STATE = "aaaabbbbccccddddaaaabbbbccccdddd";

  /** 임시 포트로 서버를 띄우고 실제 포트를 알려줍니다. */
  function start(state: string) {
    let announce!: (port: number) => void;
    const port = new Promise<number>((r) => { announce = r; });
    const code = waitForCallbackOnServer(state, 0, announce);
    // 거부는 아래에서 단언하지만, 그 전에 거부가 나면 "미처리 거부" 경고가 뜨므로 미리 붙여 둡니다.
    code.catch(() => {});
    return { port, code };
  }

  it("state 가 안 맞는 요청은 400 을 주고 계속 기다린다", async () => {
    const { port, code } = start(STATE);
    const p = await port;

    // 남이 보낸 요청(state 없음) — 여기서 로그인이 끝나 버리면 안 됩니다.
    const stray = await fetch(`http://127.0.0.1:${p}/auth/callback?error=access_denied`);
    expect(stray.status).toBe(400);

    // 서버가 아직 살아 있어야 진짜 콜백을 받을 수 있습니다.
    const real = await fetch(`http://127.0.0.1:${p}/auth/callback?code=CODE-9&state=${STATE}`);
    expect(real.status).toBe(200);
    await expect(code).resolves.toBe("CODE-9");
  });

  it("state 가 맞는 거부 응답은 로그인을 끝낸다", async () => {
    const { port, code } = start(STATE);
    const p = await port;
    const res = await fetch(`http://127.0.0.1:${p}/auth/callback?error=access_denied&state=${STATE}`);
    expect(res.status).toBe(400);
    await expect(code).rejects.toThrow(/access_denied/);
  });

  it("콜백 경로가 아니면 404", async () => {
    const { port, code } = start(STATE);
    const p = await port;
    const res = await fetch(`http://127.0.0.1:${p}/무관한경로`);
    expect(res.status).toBe(404);
    // 정리
    await fetch(`http://127.0.0.1:${p}/auth/callback?code=CODE&state=${STATE}`);
    await code;
  });

  it("완료 페이지는 사유를 HTML 이스케이프한다", async () => {
    const { port, code } = start(STATE);
    const p = await port;
    const res = await fetch(`http://127.0.0.1:${p}/auth/callback?error=<script>`);
    const html = await res.text();
    expect(html).not.toContain("<script>");
    await fetch(`http://127.0.0.1:${p}/auth/callback?code=CODE&state=${STATE}`);
    await code;
  });

  it("포트를 못 잡으면 그 사실을 알린다", async () => {
    const blocker = createServer();
    await new Promise<void>((r) => blocker.listen(0, "127.0.0.1", r));
    const taken = (blocker.address() as AddressInfo).port;
    try {
      await expect(waitForCallbackOnServer(STATE, taken)).rejects.toThrow(
        new RegExp(`포트 ${taken} 를 열지 못했어요`)
      );
    } finally {
      blocker.close();
    }
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
