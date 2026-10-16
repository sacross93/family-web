import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { generateKeyPair, exportPKCS8, jwtVerify, decodeProtectedHeader } from "jose";
import { getAccessToken, _resetTokenCache, GcalError, type GcalDeps } from "@/lib/gcal/auth";
import type { GcalConfig } from "@/lib/gcal/config";

// 진짜 키·진짜 구글은 쓰지 않는다. 키는 시험 안에서 만들고, fetch 는 가짜다.
type On = Extract<GcalConfig, { enabled: true }>;

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const EMAIL = "sync@podong-test.iam.gserviceaccount.com";

let cfg: On;
let publicKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  publicKey = pair.publicKey;
  cfg = { enabled: true, calendarId: "family@example.com", clientEmail: EMAIL, privateKey: await exportPKCS8(pair.privateKey) };
});

beforeEach(() => _resetTokenCache());

interface Seen {
  url: string;
  method: string;
  contentType: string | null;
  body: URLSearchParams;
}

/** 토큰 끝점 흉내. 받은 요청을 적어 두고 `reply` 로 답한다. */
function fakeToken(reply: (n: number) => Response) {
  const seen: Seen[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    seen.push({
      url: String(input),
      method: init?.method ?? "GET",
      contentType: new Headers(init?.headers).get("content-type"),
      body: new URLSearchParams(String(init?.body ?? "")),
    });
    return reply(seen.length);
  };
  return { fetch, seen };
}

const ok = (token: string, expiresIn = 3600) =>
  new Response(JSON.stringify({ access_token: token, expires_in: expiresIn, token_type: "Bearer" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("getAccessToken", () => {
  it("assertion 은 RS256 으로 서명되고 클레임이 맞다(iss·aud·scope·exp-iat=3600)", async () => {
    const t0 = Date.UTC(2026, 9, 16, 3, 0, 0);
    const f = fakeToken(() => ok("tok-1"));
    const deps: GcalDeps = { fetch: f.fetch, now: () => t0 };

    expect(await getAccessToken(cfg, deps)).toBe("tok-1");
    expect(f.seen).toHaveLength(1);
    const req = f.seen[0];
    expect(req.url).toBe(TOKEN_URL);
    expect(req.method).toBe("POST");
    expect(req.contentType).toBe("application/x-www-form-urlencoded");
    expect(req.body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");

    const assertion = req.body.get("assertion");
    expect(assertion).toBeTruthy();
    expect(decodeProtectedHeader(assertion!).alg).toBe("RS256");
    // 공개키로 검증 — 서명이 진짜 이 키로 된 것인지까지 본다. 시각은 주입한 t0 기준.
    const { payload } = await jwtVerify(assertion!, publicKey, {
      issuer: EMAIL,
      audience: TOKEN_URL,
      currentDate: new Date(t0),
    });
    expect(payload.scope).toBe(SCOPE);
    expect(payload.iat).toBe(Math.floor(t0 / 1000));
    expect(payload.exp! - payload.iat!).toBe(3600);
  });

  it("두 번째 호출은 fetch 를 부르지 않는다(메모리 캐시)", async () => {
    const t0 = Date.UTC(2026, 9, 16, 3, 0, 0);
    const f = fakeToken((n) => ok(`tok-${n}`));
    expect(await getAccessToken(cfg, { fetch: f.fetch, now: () => t0 })).toBe("tok-1");
    expect(await getAccessToken(cfg, { fetch: f.fetch, now: () => t0 + 10 * 60_000 })).toBe("tok-1");
    expect(f.seen).toHaveLength(1);
  });

  it("만료 1분 전이면 다시 받는다(그 직전까지는 캐시)", async () => {
    const t0 = Date.UTC(2026, 9, 16, 3, 0, 0);
    const exp = t0 + 3600 * 1000;
    const f = fakeToken((n) => ok(`tok-${n}`));
    await getAccessToken(cfg, { fetch: f.fetch, now: () => t0 });
    // 만료 1분 1초 전 → 아직 캐시
    expect(await getAccessToken(cfg, { fetch: f.fetch, now: () => exp - 61_000 })).toBe("tok-1");
    expect(f.seen).toHaveLength(1);
    // 만료 정확히 1분 전 → 새로 받는다
    expect(await getAccessToken(cfg, { fetch: f.fetch, now: () => exp - 60_000 })).toBe("tok-2");
    expect(f.seen).toHaveLength(2);
  });

  it("다른 서비스 계정이면 캐시를 쓰지 않는다", async () => {
    const t0 = Date.UTC(2026, 9, 16, 3, 0, 0);
    const f = fakeToken((n) => ok(`tok-${n}`));
    await getAccessToken(cfg, { fetch: f.fetch, now: () => t0 });
    const other = { ...cfg, clientEmail: "other@podong-test.iam.gserviceaccount.com" };
    expect(await getAccessToken(other, { fetch: f.fetch, now: () => t0 })).toBe("tok-2");
  });

  it("토큰 응답 실패 → GcalError, message 에 키·assertion 없음(구글이 본문에 되돌려 줘도)", async () => {
    let assertion = "";
    const fetch: typeof globalThis.fetch = async (_input, init) => {
      assertion = new URLSearchParams(String(init?.body)).get("assertion") ?? "";
      // 구글 오류 본문이 비밀을 되돌려 주는 최악의 경우를 흉내
      return new Response(
        JSON.stringify({ error: "invalid_grant", error_description: `Invalid JWT: ${assertion} ${cfg.privateKey}` }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    };
    const err = await getAccessToken(cfg, { fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GcalError);
    const g = err as GcalError;
    expect(g.status).toBe(400);
    expect(g.code).toBe("invalid_grant");
    expect(assertion.length).toBeGreaterThan(100); // 카나리아: 정말 assertion 을 보냈다
    const shown = `${g.message} ${String(g)} ${JSON.stringify(g)} ${g.stack ?? ""}`;
    expect(shown).not.toContain(assertion);
    expect(shown).not.toContain(assertion.slice(0, 40));
    expect(shown).not.toContain("PRIVATE KEY");
    expect(shown).not.toContain(cfg.privateKey.split("\n")[1].slice(0, 30));
  });

  it("오류 코드는 짧은 영숫자만 — 아니면 null", async () => {
    const fetch: typeof globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "Bearer ya29.leaked-token" }), { status: 401 });
    const err = (await getAccessToken(cfg, { fetch }).catch((e: unknown) => e)) as GcalError;
    expect(err).toBeInstanceOf(GcalError);
    expect(err.code).toBeNull();
    expect(err.message).not.toMatch(/Bearer|ya29/);
  });

  it("성공 응답인데 access_token 이 없으면 GcalError", async () => {
    const fetch: typeof globalThis.fetch = async () => new Response(JSON.stringify({ nope: 1 }), { status: 200 });
    const err = await getAccessToken(cfg, { fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GcalError);
  });

  it("키를 읽지 못하면 fetch 없이 GcalError(bad_key), 키 글자 없음", async () => {
    const broken = { ...cfg, privateKey: "-----BEGIN PRIVATE KEY-----\nAAAAnot-base64!!\n-----END PRIVATE KEY-----\n" };
    let calls = 0;
    const fetch: typeof globalThis.fetch = async () => {
      calls++;
      return ok("never");
    };
    const err = (await getAccessToken(broken, { fetch }).catch((e: unknown) => e)) as GcalError;
    expect(err).toBeInstanceOf(GcalError);
    expect(err.code).toBe("bad_key");
    expect(err.message).not.toContain("AAAAnot-base64");
    expect(calls).toBe(0);
  });

  it("fetch 자체가 던지면(네트워크) GcalError, 원래 오류 문구를 싣지 않는다", async () => {
    const fetch: typeof globalThis.fetch = async () => {
      throw new TypeError("fetch failed: secret-detail");
    };
    const err = (await getAccessToken(cfg, { fetch }).catch((e: unknown) => e)) as GcalError;
    expect(err).toBeInstanceOf(GcalError);
    expect(err.code).toBe("network");
    expect(err.message).not.toContain("secret-detail");
  });
});
