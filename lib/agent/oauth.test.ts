import { describe, it, expect, vi } from "vitest";
import {
  createPkce,
  buildAuthorizeUrl,
  readCallback,
  inspectCallback,
  exchangeCode,
  extractAccountId,
  TokenExchangeError,
} from "@/lib/agent/oauth";

// 실제 로그인은 돌리지 않습니다 — 순수 함수와 주입한 fetch 로만 검증합니다.
// (scripts/codex-login.test.ts 에서 옮겨 왔습니다. 터미널 로그인과 관리자 화면이 같이 씁니다.)

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

  // 관리자 화면은 터미널 문구("이 실행에서…")를 쓰지 않고 **이 코드로** 제 문장을 고른다.
  // 터미널 쪽 kind·reason 은 그대로다(위 시험들).
  it("실패마다 고정된 코드를 같이 준다", () => {
    const failure = (url: string) => {
      const r = inspectCallback(url, STATE);
      return r.kind === "ok" ? "ok" : r.failure;
    };
    expect(failure("http://[")).toBe("bad_url"); // URL 로 못 읽음
    expect(failure("아무 글자")).toBe("bad_url"); // state 가 아예 없음 — 콜백 주소가 아니다
    expect(failure(`/auth/callback?code=C`)).toBe("bad_url");
    expect(failure(`/auth/callback?code=C&state=다른값`)).toBe("state"); // 다른 로그인의 주소
    expect(failure(`/auth/callback?error=access_denied&state=${STATE}`)).toBe("denied");
    expect(failure(`/auth/callback?state=${STATE}`)).toBe("no_code");
    expect(failure(`/auth/callback?code=C&state=${STATE}`)).toBe("ok");
    // 터미널의 갈래(무시하고 계속 기다림 / 끝냄)는 그대로다.
    expect(inspectCallback("아무 글자", STATE).kind).toBe("ignore");
    expect(inspectCallback(`/auth/callback?code=C&state=다른값`, STATE).kind).toBe("ignore");
    expect(inspectCallback(`/auth/callback?state=${STATE}`, STATE).kind).toBe("denied");
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

  // 관리자 화면은 이 문구를 **화면에 그대로** 띄운다. 그래서 "우리가 거른 문구" 라는 표시가 필요하다 —
  // 그 밖의 예외(예상 못 한 것)는 화면이 일반 문구로 바꾼다(lib/agent/connect.ts).
  it("실패는 모두 TokenExchangeError — 화면에 띄워도 되는 문구라는 표시", async () => {
    const cases: Array<() => Promise<Response>> = [
      async () => { throw new Error("네트워크"); },
      async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
      async () => ok({ token_type: "Bearer" }),
    ];
    for (const impl of cases) {
      const err = await exchangeCode("CODE", "V", vi.fn(impl) as unknown as typeof fetch).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(TokenExchangeError);
      expect(err).toBeInstanceOf(Error);
    }
  });

  // 화면은 HTTP 숫자 대신 짧은 OAuth 코드만 괄호로 보인다 — 그 코드를 따로 들고 있어야 한다.
  it("OAuth 오류 코드를 따로 들고 있다 (safeCode 를 거친 것만)", async () => {
    const coded = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    const e1 = (await exchangeCode("C", "V", coded as unknown as typeof fetch).catch((e: unknown) => e)) as TokenExchangeError;
    expect(e1.oauthError).toBe("invalid_grant");

    const junk = vi.fn(async () => new Response(JSON.stringify({ error: "<script>긴 본문" }), { status: 400 }));
    const e2 = (await exchangeCode("C", "V", junk as unknown as typeof fetch).catch((e: unknown) => e)) as TokenExchangeError;
    expect(e2.oauthError).toBeNull();

    const net = vi.fn(async () => { throw new Error("x"); });
    const e3 = (await exchangeCode("C", "V", net as unknown as typeof fetch).catch((e: unknown) => e)) as TokenExchangeError;
    expect(e3.oauthError).toBeNull();
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
