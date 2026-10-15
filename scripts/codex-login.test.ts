import { describe, it, expect, beforeAll } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { waitForCallbackOnServer } from "./codex-login";
import { normalizeAuthFile } from "./agent-auth";

beforeAll(() => { process.env.AUTH_SECRET = "test-secret-for-codex-login"; });

// 실제 로그인은 돌리지 않습니다 — 로컬 콜백 서버와 토큰 파일 정리만 검증합니다.
// PKCE·콜백 해석·토큰 교환·account_id 는 관리자 화면과 같이 쓰므로 lib/agent/oauth.test.ts 로 옮겼습니다.

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
