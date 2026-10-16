import { describe, it, expect, vi, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { encryptSecret, openPending } from "@/lib/agent/crypto";
import { TokenExchangeError, type TokenResponse } from "@/lib/agent/oauth";
import type { CodexAuthFile } from "@/lib/agent/auth";
import {
  startConnect,
  finishConnect,
  PENDING_TTL_MS,
  PENDING_COOKIE,
  PENDING_COOKIE_PATH,
  pendingCookieBase,
  pendingCookieSet,
  type FinishDeps,
  type FinishResult,
} from "@/lib/agent/connect";
import { ALLOW_ACCOUNT_CHANGE_LABEL, START_LABEL } from "@/lib/agent/connect-copy";

beforeAll(() => { process.env.AUTH_SECRET = "test-secret-for-agent-connect"; });

// 실제 로그인은 돌리지 않는다 — 교환·저장은 가짜를 끼우고, 쿠키 덩어리는 진짜 봉인을 쓴다.

const NOW = Date.parse("2026-10-16T09:00:00+09:00");

// 새면 안 되는 것들. 결과 어디에도(문구·필드) 나타나면 안 된다.
const ACCESS = "ACCESS-SENTINEL";
const REFRESH = "REFRESH-SENTINEL-리프레시";
const CODE = "CODE-SENTINEL-1";

function jwt(claims: Record<string, unknown>): string {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o), "utf8").toString("base64url");
  return `${part({ alg: "none" })}.${part(claims)}.${ACCESS}`;
}
function tokenFor(accountId: string | null): TokenResponse {
  const claims: Record<string, unknown> = { exp: Math.floor(NOW / 1000) + 864000 };
  if (accountId) claims["https://api.openai.com/auth"] = { chatgpt_account_id: accountId };
  return { access_token: jwt(claims), refresh_token: REFRESH, expires_in: 864000 };
}

/** 지금 막 시작한 연결 하나: 쿠키 덩어리와 그 안의 state·verifier. */
function started(at = NOW) {
  const { url, pending } = startConnect(at);
  const inside = JSON.parse(openPending(pending)) as { state: string; verifier: string; exp: number };
  return { url, pending, ...inside };
}
function callback(state: string, extra = `code=${CODE}`) {
  return `http://localhost:1455/auth/callback?${extra}&state=${state}`;
}
function deps(over: Partial<FinishDeps> = {}) {
  const exchange = vi.fn(async (_code: string, _verifier: string) => tokenFor("acct-NEW"));
  const save = vi.fn(async (_data: CodexAuthFile) => {});
  const log = vi.fn((_line: string) => {});
  return { exchange, save, log, now: () => NOW, ...over } as FinishDeps & {
    exchange: typeof exchange;
    save: typeof save;
    log: typeof log;
  };
}

/** 결과 어디에도, 서버 로그 줄에도 비밀이 없다. 시나리오마다 부른다. */
function expectNoSecrets(result: FinishResult, verifier: string, log?: { mock: { calls: unknown[][] } }) {
  const texts = [JSON.stringify(result), ...(log?.mock.calls.map((c) => JSON.stringify(c)) ?? [])];
  for (const text of texts) {
    for (const secret of [ACCESS, REFRESH, CODE, verifier]) {
      expect(text, `비밀(${secret.slice(0, 6)}…)이 실렸다`).not.toContain(secret);
    }
  }
}

/**
 * 화면 문구에 **터미널 말투**가 없다. 이 문장들은 가족 관리자가 폰에서 읽는다 —
 * "state"·"code"·"HTTP 400"·"이 실행에서" 는 무엇을 하라는 건지 알려 주지 않는다.
 */
function expectWebCopy(message: string) {
  expect(message).not.toMatch(/이 실행|state|code|HTTP|토큰 교환|access_denied|\d{3}/);
}

describe("시작 (startConnect)", () => {
  it("인증 주소에 challenge 와 state 가 있고, 쿠키 덩어리를 열면 같은 state 다", () => {
    const { url, state, verifier, exp } = started();
    const q = new URL(url).searchParams;
    expect(q.get("state")).toBe(state);
    // challenge 는 쿠키 속 verifier 의 S256 이어야 교환이 성공한다.
    expect(q.get("code_challenge")).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(exp).toBe(NOW + PENDING_TTL_MS);
  });

  it("쿠키 덩어리에 verifier 가 평문으로 남지 않는다", () => {
    const { pending, verifier } = started();
    expect(pending).not.toContain(verifier);
  });

  it("15분이다", () => {
    expect(PENDING_TTL_MS).toBe(15 * 60 * 1000);
  });
});

describe("마치기 (finishConnect) — 교환 전에 멈추는 것", () => {
  it("쿠키가 없으면 처음부터 — 누를 버튼을 그 이름으로 말한다", async () => {
    const d = deps();
    const r = await finishConnect(
      { url: callback("아무거나"), pending: undefined, allowAccountChange: false, current: null },
      d
    );
    expect(r.kind).toBe("bad_request");
    expect(r.restart).toBe(true);
    expect(r.message).toContain(`'${START_LABEL}'`);
    expectWebCopy(r.message);
    expect(d.exchange).not.toHaveBeenCalled();
  });

  it("쿠키가 깨졌거나 토큰 열쇠로 잠긴 것이면 처음부터", async () => {
    for (const pending of ["망가진값", "a:b:c", encryptSecret(JSON.stringify({ state: "s", verifier: "v", exp: NOW * 2 }))]) {
      const d = deps();
      const r = await finishConnect({ url: callback("s"), pending, allowAccountChange: false, current: null }, d);
      expect(r.kind).toBe("bad_request");
      expect(r.restart).toBe(true);
      expect(d.exchange).not.toHaveBeenCalled();
    }
  });

  it("15분이 지났으면 처음부터 — 교환하지 않는다", async () => {
    const s = started(NOW - PENDING_TTL_MS - 1);
    const d = deps();
    const r = await finishConnect({ url: callback(s.state), pending: s.pending, allowAccountChange: false, current: null }, d);
    expect(r.kind).toBe("bad_request");
    expect(r.restart).toBe(true);
    expect(d.exchange).not.toHaveBeenCalled();
    expectNoSecrets(r, s.verifier);
  });

  // 문장이 "새로 시작" 이라고 하면 화면도 그렇게 움직여야 한다(restart).
  it("다른 로그인의 주소(state 다름)면 새로 시작하라고 — 교환하지 않는다", async () => {
    const s = started();
    const d = deps();
    const r = await finishConnect({ url: callback("다른state"), pending: s.pending, allowAccountChange: false, current: null }, d);
    expect(r.kind).toBe("bad_request");
    expect(r.restart).toBe(true);
    expect(r.message).toContain("이번에 연 로그인 주소가 아니에요");
    expect(r.message).toContain(`'${START_LABEL}'`);
    expectWebCopy(r.message);
    expect(d.exchange).not.toHaveBeenCalled();
    expectNoSecrets(r, s.verifier);
  });

  // 잘못 붙여넣은 것은 진행 중인 연결을 죽이지 않는다 — 맞는 주소를 다시 붙여넣으면 된다.
  it("콜백 주소가 아닌 것(엉뚱한 글자·로그인 주소 자체)이면 붙여넣을 것을 알려 주고 쿠키는 남긴다", async () => {
    const s = started();
    for (const url of ["아무 글자", "http://[", s.url /* 'ChatGPT 로그인 열기' 주소를 붙여넣음 */, callback(s.state, "x=1")]) {
      const d = deps();
      const r = await finishConnect({ url, pending: s.pending, allowAccountChange: false, current: null }, d);
      expect(r.kind, url).toBe("bad_request");
      expect(r.restart, url).toBe(false);
      expect(r.message).toContain("로그인을 마친 탭");
      expectWebCopy(r.message);
      expect(d.exchange).not.toHaveBeenCalled();
    }
  });

  it("로그인이 취소된 콜백이면 취소됐다고 — 코드는 보이지 않는다", async () => {
    const s = started();
    const d = deps();
    const r = await finishConnect(
      { url: callback(s.state, "error=access_denied"), pending: s.pending, allowAccountChange: false, current: null },
      d
    );
    expect(r.kind).toBe("bad_request");
    expect(r.restart).toBe(true);
    expect(r.message).toContain("취소");
    expect(r.message).toContain(`'${START_LABEL}'`);
    expectWebCopy(r.message);
    expect(d.exchange).not.toHaveBeenCalled();
  });

  it("빈 주소는 붙여넣어 달라고 한다", async () => {
    const s = started();
    const d = deps();
    const r = await finishConnect({ url: "   ", pending: s.pending, allowAccountChange: false, current: null }, d);
    expect(r.kind).toBe("bad_request");
    expect(r.restart).toBe(false);
    expect(r.message).toContain("붙여넣어");
    expect(d.exchange).not.toHaveBeenCalled();
  });
});

describe("마치기 — 교환 뒤", () => {
  it("교환 실패는 upstream_error — HTTP 숫자 없이, 짧은 코드만 괄호로", async () => {
    const s = started();
    const d = deps({
      exchange: vi.fn(async () => {
        throw new TokenExchangeError("토큰 교환에 실패했어요 (HTTP 400 · invalid_grant).", "invalid_grant");
      }),
    });
    const r = await finishConnect({ url: callback(s.state), pending: s.pending, allowAccountChange: false, current: null }, d);
    expect(r.kind).toBe("upstream_error");
    expect(r.message).toBe(`ChatGPT 에서 연결을 받아 오지 못했어요 (invalid_grant). '${START_LABEL}'를 눌러 처음부터 해 주세요.`);
    expect(r.restart).toBe(true);
    expect(d.save).not.toHaveBeenCalled();
    // 서버 로그에는 우리가 거른 문구만(이미 안전하다).
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining("invalid_grant"));
    expectNoSecrets(r, s.verifier, d.log);
  });

  it("코드가 없는 교환 실패는 괄호 없이", async () => {
    const s = started();
    const d = deps({
      exchange: vi.fn(async () => {
        throw new TokenExchangeError("토큰 교환 요청을 보내지 못했어요 (네트워크 오류이거나 시간이 초과됐어요).");
      }),
    });
    const r = await finishConnect({ url: callback(s.state), pending: s.pending, allowAccountChange: false, current: null }, d);
    expect(r.message).toBe(`ChatGPT 에서 연결을 받아 오지 못했어요. '${START_LABEL}'를 눌러 처음부터 해 주세요.`);
  });

  it("모르는 예외는 문구를 버린다 — 화면에도 서버 로그에도 이름만", async () => {
    const s = started();
    const d = deps({
      exchange: vi.fn(async () => {
        throw new TypeError(`본문: code=${CODE}&code_verifier=${s.verifier} → ${ACCESS}`);
      }),
    });
    const r = await finishConnect({ url: callback(s.state), pending: s.pending, allowAccountChange: false, current: null }, d);
    expect(r.kind).toBe("upstream_error");
    expectWebCopy(r.message);
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining("TypeError"));
    expectNoSecrets(r, s.verifier, d.log);
  });

  it("교환에는 쿠키 속 verifier 와 주소의 code 가 간다", async () => {
    const s = started();
    const d = deps();
    await finishConnect({ url: callback(s.state), pending: s.pending, allowAccountChange: false, current: null }, d);
    expect(d.exchange).toHaveBeenCalledWith(CODE, s.verifier);
  });

  it("다른 계정인데 허락이 없으면 account_changed — 저장하지 않는다", async () => {
    const s = started();
    const d = deps();
    const r = await finishConnect(
      { url: callback(s.state), pending: s.pending, allowAccountChange: false, current: { accountId: "acct-OLD" } },
      d
    );
    expect(r.kind).toBe("account_changed");
    expect(r.restart).toBe(true);
    expect(d.save).not.toHaveBeenCalled();
    // 체크칸과 버튼을 **그 이름으로** 부른다 — 화면의 글자와 달라지면 어디를 누르라는 건지 모른다.
    expect(r.message).toContain(`'${ALLOW_ACCOUNT_CHANGE_LABEL}'`);
    expect(r.message).toContain(`'${START_LABEL}'`);
    expectWebCopy(r.message);
    expectNoSecrets(r, s.verifier);
  });

  it("다른 계정이어도 허락했으면 저장한다", async () => {
    const s = started();
    const d = deps();
    const r = await finishConnect(
      { url: callback(s.state), pending: s.pending, allowAccountChange: true, current: { accountId: "acct-OLD" } },
      d
    );
    expect(r.kind).toBe("ok");
    expect(d.save).toHaveBeenCalledTimes(1);
    expect(d.save.mock.calls[0][0].account_id).toBe("acct-NEW");
  });

  it("같은 계정이면 저장한다 — provider·account_id·토큰을 그대로", async () => {
    const s = started();
    const d = deps({ exchange: vi.fn(async () => tokenFor("acct-SAME")) });
    const r = await finishConnect(
      { url: callback(s.state), pending: s.pending, allowAccountChange: false, current: { accountId: "acct-SAME" } },
      d
    );
    expect(r).toMatchObject({ kind: "ok", accountId: "acct-SAME", restart: true });
    expect(d.save).toHaveBeenCalledWith({
      access_token: tokenFor("acct-SAME").access_token,
      refresh_token: REFRESH,
      expires_in: 864000,
      expires_at: undefined,
      account_id: "acct-SAME",
      provider: "openai-codex",
    });
    expect(d.log).not.toHaveBeenCalled();
    expectNoSecrets(r, s.verifier);
  });

  it("저장된 것이 없으면 그냥 저장한다", async () => {
    const s = started();
    const d = deps();
    const r = await finishConnect({ url: callback(s.state), pending: s.pending, allowAccountChange: false, current: null }, d);
    expect(r).toMatchObject({ kind: "ok", accountId: "acct-NEW" });
    expect(d.save.mock.calls[0][0]).toMatchObject({ provider: "openai-codex", account_id: "acct-NEW" });
  });

  // 터미널 로그인과 같은 규칙: 비교할 수 없으면 막지 않는다(막으면 그 계정은 영영 못 잇는다).
  it("어느 한쪽 계정을 모르면 막지 않는다", async () => {
    for (const [current, fresh] of [
      [{ accountId: null }, "acct-NEW"],
      [{ accountId: "acct-OLD" }, null],
    ] as const) {
      const s = started();
      const d = deps({ exchange: vi.fn(async () => tokenFor(fresh)) });
      const r = await finishConnect({ url: callback(s.state), pending: s.pending, allowAccountChange: false, current }, d);
      expect(r.kind).toBe("ok");
      expect(d.save).toHaveBeenCalledTimes(1);
    }
  });

  it("저장이 실패하면 server_error — 예외 문구는 버리고, 로그에는 이름과 프리즈마 코드만", async () => {
    const s = started();
    const failure = Object.assign(new Error(`Invalid data: accessToken ${ACCESS} refresh ${REFRESH}`), {
      name: "PrismaClientKnownRequestError",
      code: "P2021",
    });
    const d = deps({
      save: vi.fn(async () => {
        throw failure;
      }),
    });
    const r = await finishConnect({ url: callback(s.state), pending: s.pending, allowAccountChange: false, current: null }, d);
    expect(r.kind).toBe("server_error");
    expect(r.restart).toBe(true);
    expect(r.message).toContain(`'${START_LABEL}'`);
    expectWebCopy(r.message);
    expect(d.log).toHaveBeenCalledWith(expect.stringMatching(/PrismaClientKnownRequestError.*P2021/));
    expectNoSecrets(r, s.verifier, d.log);
  });
});

// 쿠키를 지우는 줄이 **정말 지우는지**는 Next 가 만드는 Set-Cookie 를 봐야 안다.
// 두 번 속을 뻔했다: path 를 빼면 `Path=/` 라 다른 쿠키가 되고, maxAge 를 같이 넘기면
// Next 가 그것으로 만료를 다시 15분 뒤로 잡는다(normalizeCookie). 둘 다 "지웠다" 고 보인다.
describe("쿠키 속성 (Next 가 실제로 쓰는 줄)", () => {
  function setCookieLine(apply: (res: NextResponse) => void): string {
    const res = NextResponse.json({});
    apply(res);
    return res.headers.get("set-cookie") ?? "";
  }

  it("실을 때: HttpOnly · SameSite=lax · 연결 경로에만 · 15분", () => {
    const line = setCookieLine((res) => res.cookies.set(pendingCookieSet("덩어리")));
    expect(line).toContain(`${PENDING_COOKIE}=`);
    expect(line).toContain(`Path=${PENDING_COOKIE_PATH}`);
    expect(line).toContain("HttpOnly");
    expect(line).toMatch(/SameSite=lax/i);
    expect(line).toContain("Max-Age=900");
  });

  it("지울 때: 같은 path 에 지난 만료 — Max-Age 가 없어야 한다", () => {
    const line = setCookieLine((res) => res.cookies.delete(pendingCookieBase()));
    expect(line).toContain(`Path=${PENDING_COOKIE_PATH}`);
    expect(line).toContain("Expires=Thu, 01 Jan 1970");
    expect(line).not.toContain("Max-Age");
  });

  it("마치기 라우트도 쿠키 경로 아래에 있다 — 아니면 쿠키가 실려 오지 않는다", () => {
    expect("/api/agent/connect/finish".startsWith(`${PENDING_COOKIE_PATH}/`)).toBe(true);
  });
});
