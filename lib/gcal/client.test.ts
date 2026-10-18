import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { generateKeyPair, exportPKCS8 } from "jose";
import {
  listWindow,
  getEvent,
  insertEvent,
  patchEvent,
  deleteEvent,
  GcalError,
  type GEvent,
} from "@/lib/gcal/client";
import { _resetTokenCache } from "@/lib/gcal/auth";
import type { GcalConfig } from "@/lib/gcal/config";

// 진짜 구글은 부르지 않는다 — 토큰 끝점과 캘린더 끝점을 가짜 fetch 하나가 주소로 나눠 답한다.
type On = Extract<GcalConfig, { enabled: true }>;

const TOKEN = "ya29.SECRET-access-token-0123456789";
const CAL = "family@example.com";
const BASE = "https://www.googleapis.com/calendar/v3/calendars/family%40example.com/events";

let cfg: On;
beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  cfg = {
    enabled: true,
    calendarId: CAL,
    clientEmail: "sync@podong-test.iam.gserviceaccount.com",
    privateKey: await exportPKCS8(pair.privateKey),
  };
});
beforeEach(() => _resetTokenCache());
afterEach(() => vi.useRealTimers());

interface Call {
  url: URL;
  method: string;
  auth: string | null;
  body: unknown;
  signal: AbortSignal | undefined;
}

/** 캘린더 요청만 `handler` 로 넘긴다(토큰 요청은 알아서 답한다). */
function fake(handler: (c: Call, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.href === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: TOKEN, expires_in: 3600 }), { status: 200 });
    }
    const c: Call = {
      url,
      method: init?.method ?? "GET",
      auth: new Headers(init?.headers).get("authorization"),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      signal: init?.signal ?? undefined,
    };
    calls.push(c);
    return handler(c, calls.length);
  };
  return { fetch, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function ev(id: string, over: Partial<GEvent> = {}): GEvent {
  return {
    id,
    status: "confirmed",
    updated: "2026-10-16T00:00:00.000Z",
    summary: id,
    start: { dateTime: "2026-10-20T10:00:00+09:00" },
    end: { dateTime: "2026-10-20T11:00:00+09:00" },
    ...over,
  };
}

/** 구글 오류 본문 — 최악의 경우를 흉내 내 message 들에 토큰을 되돌려 준다. */
const googleError = (status: number, reason: string) =>
  json(status, {
    error: {
      code: status,
      message: `Request had Bearer ${TOKEN}`,
      errors: [{ domain: "global", reason, message: `Bearer ${TOKEN}` }],
      status: "SOME_STATUS",
    },
  });

/** 오류가 밖으로 보일 수 있는 모든 모양에 비밀이 없는지 */
function expectNoSecret(e: GcalError) {
  const shown = `${e.message} ${String(e)} ${JSON.stringify(e)} ${e.stack ?? ""}`;
  expect(shown).not.toContain("Bearer");
  expect(shown).not.toContain(TOKEN);
  expect(shown).not.toContain("ya29");
}

const MIN = new Date("2026-07-18T00:00:00.000Z");
const MAX = new Date("2027-10-16T00:00:00.000Z");

describe("listWindow", () => {
  it("2쪽 페이지를 끝까지 이어 붙이고, 쿼리·인증 머리가 맞다", async () => {
    const f = fake((c) => {
      const page = c.url.searchParams.get("pageToken");
      if (!page) return json(200, { items: [ev("a"), ev("b")], nextPageToken: "p2" });
      if (page === "p2") return json(200, { items: [ev("c")] });
      return json(400, {});
    });
    const items = await listWindow(cfg, MIN, MAX, { fetch: f.fetch });
    expect(items.map((g) => g.id)).toEqual(["a", "b", "c"]);
    expect(f.calls).toHaveLength(2);

    const first = f.calls[0];
    expect(first.method).toBe("GET");
    expect(`${first.url.origin}${first.url.pathname}`).toBe(BASE);
    expect(first.auth).toBe(`Bearer ${TOKEN}`);
    const q = first.url.searchParams;
    expect(q.get("singleEvents")).toBe("true");
    expect(q.get("showDeleted")).toBe("true");
    expect(q.get("maxResults")).toBe("250");
    expect(q.get("timeMin")).toBe(MIN.toISOString());
    expect(q.get("timeMax")).toBe(MAX.toISOString());
    expect(q.get("pageToken")).toBeNull();
    expect(f.calls[1].url.searchParams.get("pageToken")).toBe("p2");
  });

  it("2쪽째 500 → 던진다(부분 결과를 돌려주지 않는다), 비밀 없음", async () => {
    const f = fake((c) =>
      c.url.searchParams.get("pageToken") ? googleError(500, "backendError") : json(200, { items: [ev("a")], nextPageToken: "p2" }),
    );
    const err = await listWindow(cfg, MIN, MAX, { fetch: f.fetch }).then(
      (v) => ({ returned: v }),
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(GcalError);
    const g = err as GcalError;
    expect(g.status).toBe(500);
    expect(g.code).toBe("backendError");
    expectNoSecret(g);
  });

  it("형식이 이상한 쪽(items 가 배열 아님 · id 없는 일정)도 던진다", async () => {
    const notArray = fake(() => json(200, { items: "nope" }));
    await expect(listWindow(cfg, MIN, MAX, { fetch: notArray.fetch })).rejects.toBeInstanceOf(GcalError);
    const noId = fake(() => json(200, { items: [{ status: "confirmed" }] }));
    await expect(listWindow(cfg, MIN, MAX, { fetch: noId.fetch })).rejects.toBeInstanceOf(GcalError);
    const notJson = fake(() => new Response("<html>oops</html>", { status: 200 }));
    await expect(listWindow(cfg, MIN, MAX, { fetch: notJson.fetch })).rejects.toBeInstanceOf(GcalError);
  });

  it("items 가 없는 쪽은 빈 쪽이다(구글은 일정이 없으면 items 를 빼고 준다)", async () => {
    const f = fake(() => json(200, {}));
    expect(await listWindow(cfg, MIN, MAX, { fetch: f.fetch })).toEqual([]);
  });

  it("다음 쪽 표시가 끝없이 이어지면 던진다(끝을 못 봤으니 완전하지 않다)", async () => {
    const f = fake((_c, n) => json(200, { items: [ev(`e${n}`)], nextPageToken: `p${n + 1}` }));
    await expect(listWindow(cfg, MIN, MAX, { fetch: f.fetch })).rejects.toBeInstanceOf(GcalError);
  });

  it("5초 넘게 답이 없으면 던진다(AbortSignal 로 끊는다)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let reached!: () => void;
    const atCalendar = new Promise<void>((r) => (reached = r));
    const f = fake(
      (c) =>
        new Promise<Response>((_resolve, reject) => {
          reached();
          // 가짜 fetch 도 진짜처럼 신호를 존중한다 — 끊기면 AbortError
          c.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    let settled = false;
    const result = listWindow(cfg, MIN, MAX, { fetch: f.fetch })
      .catch((e: unknown) => e)
      .finally(() => (settled = true));

    await atCalendar; // 캘린더 요청이 실제로 나간 뒤부터 시간을 돌린다
    expect(f.calls[0].signal).toBeDefined();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const err = await result;
    expect(err).toBeInstanceOf(GcalError);
    expect((err as GcalError).code).toBe("timeout");
    expectNoSecret(err as GcalError);
  });
});

describe("getEvent", () => {
  it("있으면 그 일정, 주소에 id 를 인코딩한다", async () => {
    const f = fake(() => json(200, ev("abc_20261020T010000Z")));
    expect((await getEvent(cfg, "abc_20261020T010000Z", { fetch: f.fetch }))?.id).toBe("abc_20261020T010000Z");
    expect(f.calls[0].url.pathname).toBe(new URL(`${BASE}/abc_20261020T010000Z`).pathname);
  });

  it("404·410 → null", async () => {
    for (const status of [404, 410]) {
      _resetTokenCache();
      const f = fake(() => googleError(status, status === 404 ? "notFound" : "deleted"));
      expect(await getEvent(cfg, "gone", { fetch: f.fetch })).toBeNull();
    }
  });

  it("그 밖의 실패는 던진다", async () => {
    const f = fake(() => googleError(503, "backendError"));
    await expect(getEvent(cfg, "x", { fetch: f.fetch })).rejects.toBeInstanceOf(GcalError);
  });
});

describe("insertEvent · patchEvent", () => {
  it("insert 는 POST, 본문 그대로", async () => {
    const f = fake((c) => json(200, { ...ev("new1"), ...(c.body as object) }));
    const body = { summary: "치과", start: { date: "2026-10-20" }, end: { date: "2026-10-21" } };
    const g = await insertEvent(cfg, body, { fetch: f.fetch });
    expect(g.id).toBe("new1");
    expect(f.calls[0].method).toBe("POST");
    expect(`${f.calls[0].url.origin}${f.calls[0].url.pathname}`).toBe(BASE);
    expect(f.calls[0].body).toEqual(body);
  });

  it("insert 에 id 를 주면 본문에 실어 보낸다 · 같은 id 가 있으면 409 GcalError", async () => {
    const f = fake((c) => json(200, { ...ev("pdabc12"), ...(c.body as object) }));
    await insertEvent(cfg, { summary: "치과", id: "pdabc12" }, { fetch: f.fetch });
    expect(f.calls[0].body).toEqual({ summary: "치과", id: "pdabc12" });
    const dup = fake(() => googleError(409, "duplicate"));
    const err = (await insertEvent(cfg, { summary: "치과", id: "pdabc12" }, { fetch: dup.fetch }).catch((e: unknown) => e)) as GcalError;
    expect(err).toBeInstanceOf(GcalError);
    expect(err.status).toBe(409);
    expect(err.code).toBe("duplicate");
  });

  it("patch 는 PATCH — 종일로 바꿀 때 dateTime 을 null 로 지운다(구글 PATCH 는 안의 필드를 합친다)", async () => {
    const f = fake(() => json(200, ev("e1")));
    await patchEvent(cfg, "e1", { summary: "치과", start: { date: "2026-10-20" }, end: { date: "2026-10-21" } }, { fetch: f.fetch });
    expect(f.calls[0].method).toBe("PATCH");
    expect(f.calls[0].url.pathname).toBe(new URL(`${BASE}/e1`).pathname);
    expect(f.calls[0].body).toEqual({
      summary: "치과",
      start: { date: "2026-10-20", dateTime: null, timeZone: null },
      end: { date: "2026-10-21", dateTime: null, timeZone: null },
    });
  });

  it("patch — 시간 일정으로 바꿀 때는 date 를 null 로 지운다", async () => {
    const f = fake(() => json(200, ev("e1")));
    const t = { dateTime: "2026-10-20T01:00:00.000Z", timeZone: "Asia/Seoul" };
    await patchEvent(cfg, "e1", { start: t, end: t }, { fetch: f.fetch });
    expect(f.calls[0].body).toEqual({ start: { ...t, date: null }, end: { ...t, date: null } });
  });

  it("403 → '캘린더를 열 수 없어요' 안내, 비밀 없음", async () => {
    const f = fake(() => googleError(403, "forbidden"));
    const err = (await insertEvent(cfg, { summary: "x" }, { fetch: f.fetch }).catch((e: unknown) => e)) as GcalError;
    expect(err).toBeInstanceOf(GcalError);
    expect(err.status).toBe(403);
    expect(err.code).toBe("forbidden");
    expect(err.message).toContain("캘린더를 열 수 없어요");
    expectNoSecret(err);
  });

  it("403 이라도 할당량이면 공유 안내가 아니다", async () => {
    const f = fake(() => googleError(403, "rateLimitExceeded"));
    const err = (await insertEvent(cfg, { summary: "x" }, { fetch: f.fetch }).catch((e: unknown) => e)) as GcalError;
    expect(err.message).not.toContain("공유");
    expect(err.message).toContain("403");
    expect(err.message).toContain("rateLimitExceeded");
  });

  it("오류 코드가 영숫자가 아니면 버린다 — reason 이 이상하면 error.status 로, 둘 다 이상하면 null", async () => {
    const f = fake(() => googleError(400, `Bearer ${TOKEN}`));
    const err = (await insertEvent(cfg, { summary: "x" }, { fetch: f.fetch }).catch((e: unknown) => e)) as GcalError;
    expect(err.code).toBe("SOME_STATUS");
    expectNoSecret(err);

    _resetTokenCache();
    const both = fake(() => json(400, { error: { errors: [{ reason: `Bearer ${TOKEN}` }], status: "has space" } }));
    const err2 = (await insertEvent(cfg, { summary: "x" }, { fetch: both.fetch }).catch((e: unknown) => e)) as GcalError;
    expect(err2.code).toBeNull();
    expect(err2.message).toBe("구글 캘린더 요청이 실패했어요 (400)");
    expectNoSecret(err2);
  });
});

describe("deleteEvent", () => {
  it("204 → 성공, DELETE 로 보낸다", async () => {
    const f = fake(() => new Response(null, { status: 204 }));
    await expect(deleteEvent(cfg, "e1", { fetch: f.fetch })).resolves.toBeUndefined();
    expect(f.calls[0].method).toBe("DELETE");
  });

  it("404·410 → 이미 없는 것 — 성공", async () => {
    for (const status of [404, 410]) {
      _resetTokenCache();
      const f = fake(() => googleError(status, "deleted"));
      await expect(deleteEvent(cfg, "e1", { fetch: f.fetch })).resolves.toBeUndefined();
    }
  });

  it("그 밖의 실패는 던진다, 비밀 없음", async () => {
    const f = fake(() => googleError(500, "backendError"));
    const err = (await deleteEvent(cfg, "e1", { fetch: f.fetch }).catch((e: unknown) => e)) as GcalError;
    expect(err).toBeInstanceOf(GcalError);
    expectNoSecret(err);
  });
});
