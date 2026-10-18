import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { generateKeyPair, exportPKCS8 } from "jose";
import type { GEvent } from "@/lib/gcal/client";
import { _resetTokenCache } from "@/lib/gcal/auth";
import { seoulMidnight } from "@/lib/gcal/map";

// 진짜 DB·진짜 구글은 타지 않는다.
// - DB: 상태가 **변하는** 가짜(표 셋을 배열로). 잠금이 잡혔다 풀리고, 연결이 생겼다 고쳐지고, 일정을 지우면
//   FK(SetNull)처럼 연결의 eventId 가 비워진다 — 이게 없으면 묘비 시험이 아무것도 증명하지 못한다.
//   구현하지 않은 where 모양을 만나면 **던진다**(조용히 [] 를 돌려주는 가짜는 거짓말을 한다).
// - 구글: 상태가 있는 가짜 캘린더 하나. 토큰 요청까지 **모든** fetch 를 센다("fetch 0회" 를 재려고).
// - 진짜 fetch 는 막아 둔다 — deps 를 빠뜨린 호출이 있으면 여기서 크게 터진다.

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const clock = { ms: Date.parse("2026-10-16T03:00:00.000Z") }; // 한국 10/16 12:00
  const tables: Record<string, Row[]> = { calendarEvent: [], googleEventLink: [], googleSyncState: [] };
  const writes: string[] = [];
  /** "모델.작업" → 한 번 던지게(실패 주입). 값이 true 면 계속 던진다. */
  const failOnce: Record<string, boolean | "always"> = {};
  /** 작업 하나가 시작될 때 부른다 — "그 사이 다른 요청이 무엇을 했다" 를 흉내 내는 자리 */
  const hooks: { beforeOp: ((model: string, op: string, args: unknown) => void) | null } = { beforeOp: null };
  let seq = 0;

  const DEFAULTS: Record<string, () => Row> = {
    calendarEvent: () => ({
      description: null, end: null, allDay: false, color: "lavender", location: null, googleEventId: null, source: "local",
    }),
    googleEventLink: () => ({ eventId: null, readOnly: null, pendingPush: false, pendingDelete: false }),
    googleSyncState: () => ({ calendarId: null, initialDoneAt: null, lastSyncAt: null, lastError: null, lockedUntil: null }),
  };
  const UNIQUE: Record<string, string[]> = {
    calendarEvent: ["id"],
    googleEventLink: ["id", "eventId", "googleEventId"],
    googleSyncState: ["id"],
  };
  const tick = () => new Date(++clock.ms);

  const err = (code: string, msg: string) => Object.assign(new Error(msg), { code, name: "PrismaClientKnownRequestError" });

  function eq(a: unknown, b: unknown): boolean {
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    return a === b;
  }
  function match(row: Row, where: Row | undefined): boolean {
    for (const [k, cond] of Object.entries(where ?? {})) {
      if (k === "OR") {
        if (!(cond as Row[]).some((w) => match(row, w))) return false;
        continue;
      }
      if (k === "AND") {
        if (!(cond as Row[]).every((w) => match(row, w))) return false;
        continue;
      }
      if (!(k in row)) throw new Error(`가짜 prisma: 없는 칸 ${k}`);
      const v = row[k];
      if (cond === null || typeof cond !== "object" || cond instanceof Date) {
        if (!eq(v, cond)) return false;
        continue;
      }
      for (const [op, arg] of Object.entries(cond as Row)) {
        if (op === "not") {
          if (eq(v, arg)) return false;
        } else if (op === "lt") {
          if (!(v instanceof Date && arg instanceof Date && v.getTime() < arg.getTime())) return false;
        } else if (op === "in") {
          if (!(arg as unknown[]).some((a) => eq(v, a))) return false;
        } else {
          throw new Error(`가짜 prisma: 모르는 조건 ${k}.${op}`);
        }
      }
    }
    return true;
  }
  function pick(row: Row, select?: Record<string, boolean>): Row {
    if (!select) return { ...row };
    const out: Row = {};
    for (const k of Object.keys(select)) {
      if (!(k in row)) throw new Error(`가짜 prisma: 없는 칸 select ${k}`);
      out[k] = row[k];
    }
    return out;
  }
  function plain(data: Row, model: string): Row {
    for (const [k, v] of Object.entries(data)) {
      if (v !== null && typeof v === "object" && !(v instanceof Date)) throw new Error(`가짜 prisma: ${model}.${k} 의 모양을 모른다`);
    }
    return data;
  }
  function checkUnique(model: string, row: Row, except?: Row) {
    for (const k of UNIQUE[model]) {
      if (row[k] == null) continue;
      if (tables[model].some((r) => r !== except && eq(r[k], row[k]))) throw err("P2002", `Unique constraint failed on ${k}`);
    }
  }
  function checkFk(model: string, row: Row) {
    if (model === "googleEventLink" && row.eventId != null && !tables.calendarEvent.some((e) => e.id === row.eventId)) {
      throw err("P2003", "Foreign key constraint failed");
    }
  }
  function maybeFail(model: string, op: string, args?: unknown) {
    hooks.beforeOp?.(model, op, args);
    const key = `${model}.${op}`;
    if (failOnce[key]) {
      if (failOnce[key] !== "always") delete failOnce[key];
      throw err("P1001", `가짜 DB 오류 ${key}`);
    }
  }

  function insert(model: string, data: Row): Row {
    const now = tick();
    const row: Row = {
      ...DEFAULTS[model](),
      id: model === "googleSyncState" ? "main" : `${model}-${++seq}`,
      ...(model === "googleSyncState" ? {} : { createdAt: now }),
      updatedAt: now,
      ...plain(data, model),
    };
    checkUnique(model, row);
    checkFk(model, row);
    tables[model].push(row);
    return row;
  }

  function api(model: string) {
    const rows = () => tables[model];
    const one = (where: Row) => rows().find((r) => match(r, where));
    return {
      findUnique: async (a: { where: Row; select?: Record<string, boolean> }) => {
        maybeFail(model, "findUnique");
        const r = one(a.where);
        return r ? pick(r, a.select) : null;
      },
      findFirst: async (a: { where?: Row; select?: Record<string, boolean> } = {}) => {
        maybeFail(model, "findFirst");
        const r = rows().find((x) => match(x, a.where));
        return r ? pick(r, a.select) : null;
      },
      findMany: async (a: { where?: Row; select?: Record<string, boolean>; orderBy?: unknown } = {}) => {
        maybeFail(model, "findMany");
        return rows().filter((r) => match(r, a.where)).map((r) => pick(r, a.select));
      },
      count: async (a: { where?: Row } = {}) => {
        maybeFail(model, "count");
        return rows().filter((r) => match(r, a.where)).length;
      },
      create: async (a: { data: Row }) => {
        maybeFail(model, "create");
        writes.push(`${model}.create`);
        const { googleLink, ...data } = a.data as Row & { googleLink?: { create: Row } };
        if (googleLink) {
          if (model !== "calendarEvent" || !googleLink.create) throw new Error("가짜 prisma: 모르는 중첩 쓰기");
          // 한 문장 = 한 트랜잭션: 연결이 유일키에 걸리면 일정도 안 생긴다
          const probe = { ...DEFAULTS.googleEventLink(), id: "probe", ...googleLink.create, eventId: "probe-event" };
          checkUnique("googleEventLink", { ...probe, eventId: null, id: null });
          const ev = insert(model, data);
          insert("googleEventLink", { ...googleLink.create, eventId: ev.id });
          return { ...ev };
        }
        return { ...insert(model, data) };
      },
      update: async (a: { where: Row; data: Row }) => {
        maybeFail(model, "update");
        writes.push(`${model}.update`);
        const r = one(a.where);
        if (!r) throw err("P2025", "Record to update not found.");
        const next = { ...r, updatedAt: tick(), ...plain(a.data, model) };
        checkUnique(model, next, r);
        checkFk(model, next);
        Object.assign(r, next);
        return { ...r };
      },
      updateMany: async (a: { where?: Row; data: Row }) => {
        maybeFail(model, "updateMany", a);
        writes.push(`${model}.updateMany`);
        const hit = rows().filter((r) => match(r, a.where));
        for (const r of hit) Object.assign(r, { updatedAt: tick(), ...plain(a.data, model) });
        return { count: hit.length };
      },
      upsert: async (a: { where: Row; create: Row; update: Row }) => {
        maybeFail(model, "upsert");
        const r = one(a.where);
        if (r) {
          if (Object.keys(a.update).length) {
            writes.push(`${model}.update`);
            Object.assign(r, { updatedAt: tick(), ...plain(a.update, model) });
          }
          return { ...r };
        }
        writes.push(`${model}.create`);
        return { ...insert(model, a.create) };
      },
      deleteMany: async (a: { where?: Row } = {}) => {
        maybeFail(model, "deleteMany");
        writes.push(`${model}.deleteMany`);
        const hit = rows().filter((r) => match(r, a.where));
        tables[model] = rows().filter((r) => !hit.includes(r));
        if (model === "calendarEvent") {
          // FK onDelete: SetNull — 일정이 지워지면 연결의 eventId 가 빈다
          for (const l of tables.googleEventLink) if (hit.some((e) => e.id === l.eventId)) l.eventId = null;
        }
        return { count: hit.length };
      },
    };
  }

  const models: Record<string, ReturnType<typeof api>> = {
    calendarEvent: api("calendarEvent"),
    googleEventLink: api("googleEventLink"),
    googleSyncState: api("googleSyncState"),
  };
  const client = new Proxy(
    {} as typeof models & { $transaction: (arg: unknown) => Promise<unknown> },
    {
      get(_t, name: string) {
        if (name === "$transaction") {
          return async (arg: unknown) =>
            Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(client);
        }
        if (name in models) return models[name];
        throw new Error(`가짜 prisma: 모르는 모델 ${name}`);
      },
    },
  );

  function reset() {
    for (const k of Object.keys(tables)) tables[k] = [];
    writes.length = 0;
    for (const k of Object.keys(failOnce)) delete failOnce[k];
    hooks.beforeOp = null;
    clock.ms = Date.parse("2026-10-16T03:00:00.000Z");
    seq = 0;
  }

  return { clock, tables, writes, failOnce, hooks, client, reset, tick };
});

vi.mock("@/lib/prisma", () => ({ prisma: h.client }));

import {
  runSync,
  gcalStatus,
  previewInitial,
  readOnlyReason,
  afterSiteCreate,
  afterSiteUpdate,
  beforeSiteDelete,
  afterSiteDelete,
  READONLY_MESSAGE,
  googleIdFor,
  type SyncOutcome,
} from "@/lib/gcal/sync";

// ─────────────────────────────────────────────
// 가짜 구글
// ─────────────────────────────────────────────

const TOKEN = "ya29.SECRET-access-token-0123456789";
const CAL = "family@example.com";
const DAY = 86_400_000;
const TOKEN_URL = "https://oauth2.googleapis.com/token";

let privateKey = "";
beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = await exportPKCS8(pair.privateKey);
});

interface GCall {
  kind: "token" | "list" | "get" | "insert" | "patch" | "delete";
  id?: string;
  url: URL;
  body: Record<string, unknown> | undefined;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** 구글 오류 본문 — 최악을 흉내 내 message 들에 토큰을 되돌려 준다 */
const googleError = (status: number, reason = "backendError") =>
  json(status, {
    error: { code: status, message: `Bearer ${TOKEN}`, errors: [{ reason, message: `Bearer ${TOKEN}` }], status: "INTERNAL" },
  });

function startOf(e: GEvent): number | null {
  if (e.start?.date) return seoulMidnight(e.start.date).getTime();
  if (e.start?.dateTime) return new Date(e.start.dateTime).getTime();
  return null;
}

function fakeGoogle(opts: { pageSize?: number; fail?: (c: GCall) => Response | undefined } = {}) {
  const events = new Map<string, GEvent>();
  const calls: GCall[] = [];
  let n = 0;
  const stamp = () => new Date(++h.clock.ms).toISOString();

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    if (url.href === TOKEN_URL) {
      const c: GCall = { kind: "token", url, body: undefined };
      calls.push(c);
      return opts.fail?.(c) ?? json(200, { access_token: TOKEN, expires_in: 3600 });
    }
    const m = url.pathname.match(/\/calendars\/[^/]+\/events(?:\/([^/]+))?$/);
    if (!m) throw new Error(`가짜 구글: 모르는 주소 ${url.href}`);
    const id = m[1] ? decodeURIComponent(m[1]) : undefined;
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    const kind: GCall["kind"] =
      method === "GET" ? (id ? "get" : "list") : method === "POST" ? "insert" : method === "PATCH" ? "patch" : "delete";
    const c: GCall = { kind, id, url, body };
    calls.push(c);
    const injected = opts.fail?.(c);
    if (injected) return injected;

    if (kind === "list") {
      const min = Date.parse(url.searchParams.get("timeMin")!);
      const max = Date.parse(url.searchParams.get("timeMax")!);
      const all = [...events.values()].filter((e) => {
        const s = startOf(e);
        return s === null || (s >= min && s < max); // 취소된 것(시작 없음)은 언제나 온다
      });
      const size = opts.pageSize ?? 250;
      const from = Number(url.searchParams.get("pageToken") ?? 0);
      const items = all.slice(from, from + size);
      const next = from + size < all.length ? { nextPageToken: String(from + size) } : {};
      return json(200, { items, ...next });
    }
    if (kind === "get") {
      const e = events.get(id!);
      return e ? json(200, e) : googleError(404, "notFound");
    }
    if (kind === "insert") {
      // 진짜 구글처럼: id 를 주면 그 id 로, 이미 있으면(지운 것 포함) 409
      const want = typeof body?.id === "string" ? body.id : `g-new-${++n}`;
      if (events.has(want)) return googleError(409, "duplicate");
      const e = { ...(body as object), id: want, status: "confirmed", updated: stamp() } as GEvent;
      events.set(e.id, e);
      return json(200, e);
    }
    if (kind === "patch") {
      const e = events.get(id!);
      if (!e) return googleError(404, "notFound");
      const next = { ...e, ...(body as object), updated: stamp() } as GEvent;
      events.set(e.id, next);
      return json(200, next);
    }
    if (!events.has(id!)) return googleError(410, "deleted");
    events.delete(id!);
    return new Response(null, { status: 204 });
  };

  const writes = () => calls.filter((c) => c.kind === "insert" || c.kind === "patch" || c.kind === "delete");
  return { events, calls, fetch, writes, put: (e: GEvent) => events.set(e.id, e) };
}

// ─────────────────────────────────────────────
// 만드는 도우미
// ─────────────────────────────────────────────

const now = () => new Date(h.clock.ms);
const at = (iso: string) => new Date(iso);
const deps = (g: ReturnType<typeof fakeGoogle>) => ({ fetch: g.fetch, now: () => h.clock.ms });

function seedState(over: Record<string, unknown> = {}) {
  h.tables.googleSyncState.push({
    id: "main",
    calendarId: CAL,
    initialDoneAt: new Date(h.clock.ms - 10 * DAY),
    lastSyncAt: null,
    lastError: null,
    lockedUntil: null,
    updatedAt: now(),
    ...over,
  });
}

function seedEvent(id: string, over: Record<string, unknown> = {}) {
  const row = {
    id,
    title: id,
    description: null,
    start: at("2026-10-20T01:00:00.000Z"), // 10/20 10:00 KST
    end: at("2026-10-20T02:00:00.000Z"),
    allDay: false,
    color: "rose",
    location: null,
    googleEventId: null,
    source: "local",
    createdAt: new Date(h.clock.ms - 20 * DAY),
    updatedAt: new Date(h.clock.ms - 5 * DAY),
    ...over,
  };
  h.tables.calendarEvent.push(row);
  return row;
}

function seedLink(id: string, eventId: string | null, googleEventId: string, over: Record<string, unknown> = {}) {
  const row = {
    id,
    eventId,
    googleEventId,
    googleUpdated: at("2026-10-10T00:00:00.000Z"),
    siteSyncedAt: new Date(h.clock.ms - 5 * DAY), // seedEvent 의 updatedAt 과 같다 = 안 바뀜
    readOnly: null,
    pendingPush: false,
    pendingDelete: false,
    createdAt: new Date(h.clock.ms - 20 * DAY),
    updatedAt: new Date(h.clock.ms - 5 * DAY),
    ...over,
  };
  h.tables.googleEventLink.push(row);
  return row;
}

function gev(id: string, over: Partial<GEvent> = {}): GEvent {
  return {
    id,
    status: "confirmed",
    updated: "2026-10-10T00:00:00.000Z",
    summary: id,
    start: { dateTime: "2026-10-20T10:00:00+09:00", timeZone: "Asia/Seoul" },
    end: { dateTime: "2026-10-20T11:00:00+09:00", timeZone: "Asia/Seoul" },
    ...over,
  };
}

const state = () => h.tables.googleSyncState[0] as Record<string, unknown>;
const link = (id: string) => h.tables.googleEventLink.find((l) => l.id === id) as Record<string, unknown> | undefined;
const linkOf = (eventId: string) =>
  h.tables.googleEventLink.find((l) => l.eventId === eventId) as Record<string, unknown> | undefined;
const event = (id: string) => h.tables.calendarEvent.find((e) => e.id === id) as Record<string, unknown> | undefined;

function enable() {
  vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", JSON.stringify({ client_email: "sync@podong-test.iam.gserviceaccount.com", private_key: privateKey }));
  vi.stubEnv("GOOGLE_CALENDAR_ID", CAL);
}

beforeEach(() => {
  h.reset();
  _resetTokenCache();
  enable();
  vi.stubGlobal("fetch", () => {
    throw new Error("진짜 fetch 를 부르면 안 된다 — deps.fetch 를 빠뜨린 곳이 있다");
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────
// 시험
// ─────────────────────────────────────────────

describe("runSync — 돌지 않는 경우", () => {
  it("꺼짐(환경변수 없음) → disabled, fetch 0회, DB 도 안 건드린다", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", "");
    vi.stubEnv("GOOGLE_CALENDAR_ID", "");
    const g = fakeGoogle();
    expect(await runSync({ deps: deps(g), force: true })).toEqual({ ran: false, reason: "disabled" });
    expect(g.calls).toHaveLength(0);
    expect(h.writes).toEqual([]);
  });

  it("키를 못 읽어도 disabled — 던지지 않는다", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", "{not json");
    const g = fakeGoogle();
    expect(await runSync({ deps: deps(g) })).toEqual({ ran: false, reason: "disabled" });
    expect(g.calls).toHaveLength(0);
  });

  it("initialDoneAt 이 비어 있고 initial 이 아니면 → not_started, fetch 0회(force 여도)", async () => {
    seedState({ initialDoneAt: null });
    seedEvent("견본"); // 시드의 가짜 일정 — 진짜 캘린더로 가면 안 된다
    const g = fakeGoogle();
    expect(await runSync({ deps: deps(g) })).toEqual({ ran: false, reason: "not_started" });
    expect(await runSync({ deps: deps(g), force: true })).toEqual({ ran: false, reason: "not_started" });
    expect(g.calls).toHaveLength(0);
    expect(state().lockedUntil).toBeNull();
  });

  it("상태 행이 아직 없어도(처음 켠 날) not_started — 행을 만들고 캘린더 ID 를 적는다, fetch 0회", async () => {
    const g = fakeGoogle();
    expect(await runSync({ deps: deps(g) })).toEqual({ ran: false, reason: "not_started" });
    expect(g.calls).toHaveLength(0);
    expect(state()).toMatchObject({ id: "main", calendarId: CAL, initialDoneAt: null });
  });

  /**
   * 훅 셋이 각각 **가드만 없으면 구글을 부를** 모양: 만들기는 연결 없는 새 일정, 고치기는 연결된 일정(사이트가 바뀜),
   * 지우기는 연결된 일정의 묘비. 가드 상태에서 0회인지 본 뒤, 같은 훅을 가드를 푼 상태에서 다시 불러 **실제로 부르는지**
   * 확인한다(대조군) — 아무것도 안 하는 훅이라서 0회인 것이 아님을 시험 안에서 증명한다.
   */
  async function hookScene() {
    seedEvent("new", { createdAt: now(), updatedAt: now() });
    seedEvent("edited", { title: "고친 제목", updatedAt: now() });
    seedLink("l-edit", "edited", "g-edit");
    seedEvent("gone");
    seedLink("l-gone", "gone", "g-gone");
    const g = fakeGoogle();
    g.put(gev("g-edit"));
    g.put(gev("g-gone"));
    const tomb = await beforeSiteDelete("gone");
    await h.client.calendarEvent.deleteMany({ where: { id: "gone" } });
    const run = async () => {
      await afterSiteCreate("new", deps(g));
      await afterSiteUpdate("edited", deps(g));
      await afterSiteDelete(tomb, deps(g));
    };
    return { g, run };
  }

  it("처음 맞추기 전에는 쓰기 훅 셋도 fetch 0회(연결이 남아 있어도) — 처음 맞추기를 마치면 같은 훅이 부른다", async () => {
    seedState({ initialDoneAt: null });
    const { g, run } = await hookScene();
    await run();
    expect(g.calls).toHaveLength(0);
    // 묘비는 남는다 — 처음 맞추기가 돌면 그때 지운다
    expect(link("l-gone")).toMatchObject({ eventId: null, pendingDelete: true });
    expect(linkOf("new")).toBeUndefined();

    // 대조군: 같은 상태에서 처음 맞추기만 마친 것으로 바꾸면 셋 다 구글을 부른다
    state().initialDoneAt = new Date(h.clock.ms - DAY);
    await run();
    expect(g.calls.filter((c) => c.kind === "insert").map((c) => c.id ?? c.body?.id)).toEqual([googleIdFor("new")]);
    expect(g.calls.filter((c) => c.kind === "patch").map((c) => c.id)).toEqual(["g-edit"]);
    expect(g.calls.filter((c) => c.kind === "delete").map((c) => c.id)).toEqual(["g-gone"]);
  });

  it("꺼져 있으면 쓰기 훅 셋도 fetch 0회 — 켜면 같은 훅이 부른다", async () => {
    vi.stubEnv("GOOGLE_CALENDAR_ID", "");
    seedState();
    const { g, run } = await hookScene();
    await run();
    expect(g.calls).toHaveLength(0);

    enable(); // 대조군
    await run();
    expect(g.calls.filter((c) => c.kind === "insert")).toHaveLength(1);
    expect(g.calls.filter((c) => c.kind === "patch")).toHaveLength(1);
    expect(g.calls.filter((c) => c.kind === "delete")).toHaveLength(1);
  });

  it("다른 캘린더로 맞췄던 상태면(바뀐 뒤 아직 안 돎) 쓰기 훅 셋도 fetch 0회", async () => {
    seedState({ calendarId: "old@example.com" });
    const { g, run } = await hookScene();
    await run();
    expect(g.calls).toHaveLength(0);
  });

  it("60초 안에 다시 부르면 throttled(fetch 0회), force 면 돈다, 61초 뒤면 돈다", async () => {
    seedState();
    const g = fakeGoogle();
    expect(await runSync({ deps: deps(g) })).toEqual({ ran: true, changed: 0, error: null });
    const after1 = g.calls.length;
    h.clock.ms += 30_000;
    expect(await runSync({ deps: deps(g) })).toEqual({ ran: false, reason: "throttled" });
    expect(g.calls.length).toBe(after1);
    expect((await runSync({ deps: deps(g), force: true })).ran).toBe(true);
    h.clock.ms += 61_000;
    expect((await runSync({ deps: deps(g) })).ran).toBe(true);
  });

  it("잠금 중이면 locked(fetch 0회, 잠금을 건드리지 않는다), 잠금이 지나면 돈다", async () => {
    const until = new Date(h.clock.ms + 10_000);
    seedState({ lockedUntil: until });
    const g = fakeGoogle();
    expect(await runSync({ deps: deps(g), force: true })).toEqual({ ran: false, reason: "locked" });
    expect(g.calls).toHaveLength(0);
    expect((state().lockedUntil as Date).getTime()).toBe(until.getTime());
    h.clock.ms += 11_000;
    expect((await runSync({ deps: deps(g), force: true })).ran).toBe(true);
    expect(state().lockedUntil).toBeNull();
  });

  it("잠금은 60초 — 실행 상한(20초)보다 넉넉하다", async () => {
    seedState();
    let seen: Date | null = null;
    const g = fakeGoogle({
      fail: (c) => {
        if (c.kind === "list") seen = state().lockedUntil as Date;
        return undefined;
      },
    });
    const startedAt = h.clock.ms;
    await runSync({ deps: deps(g), force: true });
    expect(seen).not.toBeNull();
    expect(seen!.getTime() - startedAt).toBe(60_000);
  });

  it("실행 도중 잠금을 다른 요청이 새로 잡았으면(우리 잠금이 지났다) 끝날 때 남의 잠금을 풀지 않는다", async () => {
    seedState();
    const theirs = new Date(h.clock.ms + 120_000);
    const g = fakeGoogle({
      fail: (c) => {
        if (c.kind === "list") state().lockedUntil = theirs; // 느린 실행 사이 다른 요청이 잠금을 잡았다
        return undefined;
      },
    });
    await runSync({ deps: deps(g), force: true });
    expect((state().lockedUntil as Date).getTime()).toBe(theirs.getTime());
  });

  it("잠금을 잡은 뒤 상태를 다시 읽는다 — 그 사이 앞사람이 처음 맞추기를 끝냈으면 또 하지 않는다", async () => {
    seedState({ initialDoneAt: null });
    seedEvent("old", { title: "옛 일정", start: at("2026-11-01T01:00:00.000Z") }); // 오늘 이후·연결 없음 → 처음 맞추기면 보낸다
    const doneBySomeoneElse = new Date(h.clock.ms - 1000);
    // 잠금을 잡는 그 순간까지 앞사람의 처음 맞추기가 끝나 있었다(우리가 처음 읽은 값은 낡았다)
    h.hooks.beforeOp = (model, op, args) => {
      const where = (args as { where?: { OR?: unknown } } | undefined)?.where;
      if (model === "googleSyncState" && op === "updateMany" && where?.OR) {
        state().initialDoneAt = doneBySomeoneElse;
        h.hooks.beforeOp = null;
      }
    };
    const g = fakeGoogle();
    expect(await runSync({ initial: true, force: true, deps: deps(g) })).toEqual({ ran: true, changed: 0, error: null });
    expect(g.writes()).toHaveLength(0); // 처음 맞추기가 아니라 평소 동기화로 돌았다
    expect((state().initialDoneAt as Date).getTime()).toBe(doneBySomeoneElse.getTime());
  });

  it("대상 캘린더가 바뀌면 연결을 전부 지우고 initialDoneAt 을 비운다 → not_started, fetch 0회", async () => {
    seedState({ calendarId: "old@example.com" });
    seedEvent("e1");
    seedLink("l1", "e1", "g1");
    const g = fakeGoogle();
    expect(await runSync({ deps: deps(g) })).toEqual({ ran: false, reason: "not_started" });
    expect(g.calls).toHaveLength(0);
    expect(h.tables.googleEventLink).toHaveLength(0);
    expect(event("e1")).toBeDefined(); // 사이트 일정은 그대로
    expect(state()).toMatchObject({ calendarId: CAL, initialDoneAt: null });
  });
});

describe("runSync — 목록을 끝까지 못 읽으면", () => {
  it("2쪽째 500 → 사이트 일정 삭제 0 · 구글 쓰기 0 · lastError 기록 · 잠금 해제", async () => {
    seedState();
    seedEvent("e1");
    seedEvent("e2");
    seedLink("l1", "e1", "g1");
    seedLink("l2", "e2", "g2");
    const g = fakeGoogle({ pageSize: 1, fail: (c) => (c.kind === "list" && c.url.searchParams.has("pageToken") ? googleError(500) : undefined) });
    g.put(gev("g1"));
    g.put(gev("g2"));

    const out = await runSync({ deps: deps(g), force: true });
    expect(out.ran).toBe(true);
    const { error, changed } = out as Extract<SyncOutcome, { ran: true }>;
    expect(changed).toBe(0);
    expect(error).toMatch(/실패|읽지/);
    expect(h.tables.calendarEvent.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(h.tables.googleEventLink).toHaveLength(2);
    expect(g.writes()).toHaveLength(0);
    expect(g.calls.filter((c) => c.kind === "get")).toHaveLength(0); // recheck 도 없다
    expect(state().lastError).toBe(error);
    expect(state().lockedUntil).toBeNull();
    // 실패도 "마지막 시도" 다 — 구글이 아픈 동안 화면을 열 때마다 두드리지 않게
    expect((state().lastSyncAt as Date).getTime()).toBeGreaterThan(0);
  });

  it("연결이 끊겨도(네트워크) 같다 — 지우기 0, 잠금 해제", async () => {
    seedState();
    seedEvent("e1");
    seedLink("l1", "e1", "g1");
    const g = fakeGoogle({
      fail: (c) => {
        if (c.kind === "list") throw new Error("socket hang up");
        return undefined;
      },
    });
    const out = (await runSync({ deps: deps(g), force: true })) as Extract<SyncOutcome, { ran: true }>;
    expect(out.error).toBeTruthy();
    expect(event("e1")).toBeDefined();
    expect(state().lockedUntil).toBeNull();
  });

  it("DB 가 던져도 runSync 는 던지지 않는다 — 잠금은 풀린다", async () => {
    seedState();
    h.failOnce["calendarEvent.findMany"] = true;
    const g = fakeGoogle();
    const out = (await runSync({ deps: deps(g), force: true })) as Extract<SyncOutcome, { ran: true }>;
    expect(out.ran).toBe(true);
    expect(out.error).toBeTruthy();
    expect(out.error).not.toContain("가짜 DB"); // 예외 문구를 그대로 싣지 않는다
    expect(state().lockedUntil).toBeNull();
  });

  it("창은 오늘(서울) 자정 기준 90일 전 ~ 366일 뒤 자정", async () => {
    seedState();
    const g = fakeGoogle();
    await runSync({ deps: deps(g), force: true });
    const list = g.calls.find((c) => c.kind === "list")!;
    const today = seoulMidnight("2026-10-16").getTime();
    expect(Date.parse(list.url.searchParams.get("timeMin")!)).toBe(today - 90 * DAY);
    expect(Date.parse(list.url.searchParams.get("timeMax")!)).toBe(today + 366 * DAY);
  });
});

describe("처음 맞추기 (initial)", () => {
  /** 오늘(10/16 KST) 기준: 앞으로 짝 없음 1 · 앞으로 짝 있음 1 · 지난 짝 있음 1 · 지난 짝 없음 1 / 구글 남는 것 2 · 취소 1 */
  function scene(opts: Parameters<typeof fakeGoogle>[0] = {}) {
    seedState({ initialDoneAt: null });
    seedEvent("s-future", { title: "치과", start: at("2026-10-17T01:00:00.000Z"), end: null });
    seedEvent("s-match", { title: " 가족 모임 ", start: at("2026-10-19T15:00:00.000Z"), end: null, allDay: true }); // 10/20 종일(KST 자정)
    seedEvent("s-past-match", { title: "지난 생일", start: at("2026-10-05T03:00:00.000Z") });
    seedEvent("s-past", { title: "지난 일", start: at("2026-10-01T03:00:00.000Z") });
    const g = fakeGoogle(opts);
    g.put(gev("g-match", { summary: "가족 모임", start: { date: "2026-10-20" }, end: { date: "2026-10-21" } }));
    g.put(gev("g-past", { summary: "지난 생일", start: { dateTime: "2026-10-05T09:00:00+09:00" }, end: { dateTime: "2026-10-05T10:00:00+09:00" } }));
    g.put(gev("g-meet", { summary: "회의", start: { dateTime: "2026-10-22T14:00:00+09:00" }, end: { dateTime: "2026-10-22T15:00:00+09:00" } }));
    g.put(gev("g-run_20261023", { summary: "운동", recurringEventId: "g-run", start: { dateTime: "2026-10-23T07:00:00+09:00" }, end: { dateTime: "2026-10-23T08:00:00+09:00" } }));
    g.put({ id: "g-gone", status: "cancelled", updated: "2026-10-12T00:00:00.000Z" });
    return g;
  }

  it("미리보기 숫자 = 실제 실행의 보내기·잇기·가져오기 수, 미리보기는 아무것도 쓰지 않는다", async () => {
    const g = scene();
    const preview = await previewInitial(deps(g));
    expect(preview).toEqual({ toPush: 1, toLink: 2, toImport: 2 });
    expect(h.writes).toEqual([]); // 상태 행조차 쓰지 않는다
    expect(g.writes()).toHaveLength(0);
    expect(h.tables.googleEventLink).toHaveLength(0);

    const runAt = h.clock.ms;
    const out = await runSync({ initial: true, force: true, deps: deps(g) });
    expect(out).toEqual({ ran: true, changed: 5, error: null });

    const inserts = g.calls.filter((c) => c.kind === "insert");
    expect(inserts).toHaveLength(1); // = toPush
    expect(inserts[0].body?.summary).toBe("치과");
    const imported = h.tables.calendarEvent.filter((e) => e.source === "google");
    expect(imported.map((e) => e.title).sort()).toEqual(["운동", "회의"]); // = toImport
    const linkedExisting = ["s-match", "s-past-match"].filter((id) => linkOf(id));
    expect(linkedExisting).toHaveLength(2); // = toLink
    expect(linkOf("s-past")).toBeUndefined(); // 짝 없는 지난 일정은 사이트에만
    expect(g.calls.filter((c) => c.kind === "patch" || c.kind === "delete")).toHaveLength(0);

    // 실행 "시작" 시각으로 적는다 — 실행 도중에 만들어진 일정도 다음 동기화가 보내게
    expect((state().initialDoneAt as Date).getTime()).toBe(runAt);
    expect(state().calendarId).toBe(CAL);
    // 반복 회차는 readOnly 로 이어진다
    const run = h.tables.calendarEvent.find((e) => e.title === "운동")!;
    expect(linkOf(run.id as string)?.readOnly).toBe("recurring");
  });

  it("처음 맞추기 뒤 다시 맞춰도 아무것도 다시 일어나지 않는다(siteSyncedAt·googleUpdated 를 제대로 적었다)", async () => {
    const g = scene();
    await runSync({ initial: true, force: true, deps: deps(g) });
    const before = g.calls.length;
    h.clock.ms += 120_000;
    expect(await runSync({ deps: deps(g) })).toEqual({ ran: true, changed: 0, error: null });
    expect(g.calls.slice(before).filter((c) => c.kind !== "list" && c.kind !== "token")).toHaveLength(0);
  });

  it("잇기는 내용을 옮기지 않는다 — 사이트 일정은 그대로, 구글에도 쓰지 않는다", async () => {
    const g = scene();
    await runSync({ initial: true, force: true, deps: deps(g) });
    expect(event("s-match")).toMatchObject({ title: " 가족 모임 ", allDay: true, color: "rose" });
    expect(linkOf("s-match")).toMatchObject({ googleEventId: "g-match", readOnly: null, pendingPush: false });
  });

  it("보내기가 하나라도 실패하면 initialDoneAt 을 적지 않는다 — 다시 누르면 남은 것만 한다", async () => {
    let failInsert = true;
    const g = scene({ fail: (c) => (failInsert && c.kind === "insert" ? googleError(500) : undefined) });
    const out = (await runSync({ initial: true, force: true, deps: deps(g) })) as Extract<SyncOutcome, { ran: true }>;
    expect(out.changed).toBe(4);
    expect(out.error).toMatch(/1개/);
    expect(out.error).toMatch(/처음 맞추기/);
    expect(state().initialDoneAt).toBeNull();
    expect(h.tables.googleEventLink).toHaveLength(4); // 이은 것·가져온 것은 남는다

    // 처음 맞추기 전이니 자동 동기화·훅은 여전히 아무것도 안 한다
    expect(await runSync({ deps: deps(g) })).toEqual({ ran: false, reason: "not_started" });
    expect(await previewInitial(deps(g))).toEqual({ toPush: 1, toLink: 0, toImport: 0 });

    failInsert = false;
    expect(await runSync({ initial: true, force: true, deps: deps(g) })).toEqual({ ran: true, changed: 1, error: null });
    expect(state().initialDoneAt).not.toBeNull();
    expect(h.tables.calendarEvent.filter((e) => e.source === "google")).toHaveLength(2); // 두 번 가져오지 않았다
  });

  it("이미 처음 맞추기를 했으면 initial 은 평소 동기화로 돈다 — initialDoneAt 을 옮기지 않는다", async () => {
    const done = new Date(h.clock.ms - 10 * DAY);
    seedState({ initialDoneAt: done });
    seedEvent("old-local", { title: "옛 일정", start: at("2026-11-01T01:00:00.000Z"), createdAt: new Date(done.getTime() - DAY) });
    const g = fakeGoogle();
    expect(await runSync({ initial: true, force: true, deps: deps(g) })).toEqual({ ran: true, changed: 0, error: null });
    expect(g.writes()).toHaveLength(0); // 처음 맞추기 전에 있던 연결 없는 일정을 이제 와서 보내지 않는다
    expect((state().initialDoneAt as Date).getTime()).toBe(done.getTime());
  });

  it("미리보기는 상태 행이 없어도 만들지 않는다(읽기만)", async () => {
    const g = fakeGoogle();
    g.put(gev("g1"));
    expect(await previewInitial(deps(g))).toEqual({ toPush: 0, toLink: 0, toImport: 1 });
    expect(h.tables.googleSyncState).toHaveLength(0);
    expect(h.writes).toEqual([]);
  });

  it("짝이 반복 회차면 readOnly 로 잇는다 — 그 뒤 사이트에서 고치기·지우기는 409 대상", async () => {
    seedState({ initialDoneAt: null });
    seedEvent("s-run", { title: "운동", start: at("2026-10-22T22:00:00.000Z") }); // 10/23 07:00 KST
    const g = fakeGoogle();
    g.put(gev("g-run_20261023", { summary: "운동", recurringEventId: "g-run", start: { dateTime: "2026-10-23T07:00:00+09:00" }, end: { dateTime: "2026-10-23T08:00:00+09:00" } }));
    expect(await runSync({ initial: true, force: true, deps: deps(g) })).toEqual({ ran: true, changed: 1, error: null });
    expect(linkOf("s-run")).toMatchObject({ googleEventId: "g-run_20261023", readOnly: "recurring" });
    expect(await readOnlyReason("s-run")).toBe("recurring");
  });

  it("미리보기 — 꺼져 있으면 error, 목록 실패면 error(비밀 없음)", async () => {
    vi.stubEnv("GOOGLE_CALENDAR_ID", "");
    expect(await previewInitial(deps(fakeGoogle()))).toHaveProperty("error");
    enable();
    const g = fakeGoogle({ fail: (c) => (c.kind === "list" ? googleError(403, "forbidden") : undefined) });
    const p = (await previewInitial(deps(g))) as { error: string };
    expect(p.error).toContain("캘린더를 열 수 없어요");
    expect(JSON.stringify(p)).not.toContain(TOKEN);
  });
});

describe("runSync — 실행", () => {
  it("recheck: 목록에 없고 get 이 404 → 사이트 일정과 연결을 지운다", async () => {
    seedState();
    seedEvent("e1");
    seedLink("l1", "e1", "g-series_1"); // 반복 시리즈를 통째로 지우면 회차가 "취소됨" 없이 사라진다
    const g = fakeGoogle();
    const out = await runSync({ deps: deps(g), force: true });
    expect(out).toEqual({ ran: true, changed: 1, error: null });
    expect(g.calls.filter((c) => c.kind === "get").map((c) => c.id)).toEqual(["g-series_1"]);
    expect(event("e1")).toBeUndefined();
    expect(link("l1")).toBeUndefined(); // 고아 연결을 남기지 않는다
  });

  it("recheck: get 이 살아 있음(창 밖으로 옮겨짐) → 그 내용으로 사이트를 고친다", async () => {
    seedState();
    seedEvent("e1", { title: "여행" });
    seedLink("l1", "e1", "g1");
    const g = fakeGoogle();
    g.put(gev("g1", {
      summary: "여행(연기)",
      updated: "2026-10-15T00:00:00.000Z",
      start: { dateTime: "2028-01-05T10:00:00+09:00" },
      end: { dateTime: "2028-01-05T11:00:00+09:00" },
    }));
    const out = await runSync({ deps: deps(g), force: true });
    expect(out).toEqual({ ran: true, changed: 1, error: null });
    expect(event("e1")).toMatchObject({ title: "여행(연기)", start: at("2028-01-05T01:00:00.000Z") });
    expect((link("l1")!.googleUpdated as Date).toISOString()).toBe("2026-10-15T00:00:00.000Z");
    expect((link("l1")!.siteSyncedAt as Date).getTime()).toBe((event("e1")!.updatedAt as Date).getTime());
  });

  it("recheck: get 이 실패(공유가 풀림 403) → 지우지 않는다", async () => {
    seedState();
    seedEvent("e1");
    seedLink("l1", "e1", "g1");
    const g = fakeGoogle({ fail: (c) => (c.kind === "get" ? googleError(403, "forbidden") : undefined) });
    const out = (await runSync({ deps: deps(g), force: true })) as Extract<SyncOutcome, { ran: true }>;
    expect(out.changed).toBe(0);
    expect(out.error).toContain("캘린더를 열 수 없어요");
    expect(event("e1")).toBeDefined();
    expect(link("l1")).toBeDefined();
  });

  it("구글에서 cancelled → 사이트 일정과 연결을 지운다", async () => {
    seedState();
    seedEvent("e1");
    seedLink("l1", "e1", "g1");
    const g = fakeGoogle();
    g.put({ id: "g1", status: "cancelled", updated: "2026-10-15T00:00:00.000Z" });
    expect(await runSync({ deps: deps(g), force: true })).toEqual({ ran: true, changed: 1, error: null });
    expect(event("e1")).toBeUndefined();
    expect(link("l1")).toBeUndefined();
  });

  it("한 건 실패(patch 500) → 그 연결만 pendingPush, 나머지는 진행, changed 는 성공한 수", async () => {
    seedState();
    const edited = new Date(h.clock.ms - DAY);
    seedEvent("e1", { title: "고친 일정1", updatedAt: edited });
    seedEvent("e2", { title: "고친 일정2", updatedAt: edited });
    seedLink("l1", "e1", "g1");
    seedLink("l2", "e2", "g2");
    const g = fakeGoogle({ fail: (c) => (c.kind === "patch" && c.id === "g1" ? googleError(500) : undefined) });
    g.put(gev("g1"));
    g.put(gev("g2"));
    g.put(gev("g-new", { summary: "구글에서 새로" }));

    const out = (await runSync({ deps: deps(g), force: true })) as Extract<SyncOutcome, { ran: true }>;
    expect(out.changed).toBe(2); // g2 보내기 + g-new 가져오기
    expect(out.error).toMatch(/1개/);
    expect(link("l1")).toMatchObject({ pendingPush: true });
    expect(link("l2")).toMatchObject({ pendingPush: false });
    expect(g.events.get("g2")?.summary).toBe("고친 일정2");
    expect((link("l2")!.googleUpdated as Date).toISOString()).toBe(g.events.get("g2")!.updated);
    expect((link("l2")!.siteSyncedAt as Date).getTime()).toBe(edited.getTime());
    expect(h.tables.calendarEvent.some((e) => e.title === "구글에서 새로" && e.source === "google")).toBe(true);
    expect(state().lastError).toBe(out.error);
  });

  it("구글만 바뀜 → 사이트로, 연결의 두 시각을 새로 적어 다음 동기화가 다시 하지 않는다", async () => {
    seedState();
    seedEvent("e1", { title: "옛 제목" });
    seedLink("l1", "e1", "g1");
    const g = fakeGoogle();
    g.put(gev("g1", { summary: "새 제목", updated: "2026-10-15T00:00:00.000Z", colorId: "2" }));
    expect(await runSync({ deps: deps(g), force: true })).toEqual({ ran: true, changed: 1, error: null });
    expect(event("e1")).toMatchObject({ title: "새 제목", color: "mint" });
    expect((link("l1")!.siteSyncedAt as Date).getTime()).toBe((event("e1")!.updatedAt as Date).getTime());
    h.clock.ms += 61_000;
    expect(await runSync({ deps: deps(g) })).toEqual({ ran: true, changed: 0, error: null });
    expect(g.writes()).toHaveLength(0);
  });

  it("사이트만 바뀜 → 구글로, 다음 동기화가 다시 보내지 않는다", async () => {
    seedState();
    seedEvent("e1", { title: "사이트에서 고침", updatedAt: new Date(h.clock.ms - DAY) });
    seedLink("l1", "e1", "g1", { pendingPush: true });
    const g = fakeGoogle();
    g.put(gev("g1"));
    expect(await runSync({ deps: deps(g), force: true })).toEqual({ ran: true, changed: 1, error: null });
    expect(g.events.get("g1")?.summary).toBe("사이트에서 고침");
    expect(link("l1")).toMatchObject({ pendingPush: false });
    h.clock.ms += 61_000;
    await runSync({ deps: deps(g) });
    expect(g.writes()).toHaveLength(1);
  });

  it("묘비(pendingDelete) → 구글에서 지우고 연결을 없앤다", async () => {
    seedState();
    seedLink("l1", null, "g1", { pendingDelete: true });
    const g = fakeGoogle();
    g.put(gev("g1"));
    expect(await runSync({ deps: deps(g), force: true })).toEqual({ ran: true, changed: 1, error: null });
    expect(g.events.has("g1")).toBe(false);
    expect(link("l1")).toBeUndefined();
  });

  it("처음 맞추기 뒤 사이트에서 만들었는데 못 보낸 것 → 보낸다(pushNew)", async () => {
    seedState();
    seedEvent("e-new", { title: "새 일정", createdAt: new Date(h.clock.ms - DAY) });
    const g = fakeGoogle();
    expect(await runSync({ deps: deps(g), force: true })).toEqual({ ran: true, changed: 1, error: null });
    const ins = g.calls.filter((c) => c.kind === "insert");
    expect(ins).toHaveLength(1);
    const made = g.events.get(googleIdFor("e-new"))!;
    expect(linkOf("e-new")).toMatchObject({ googleEventId: googleIdFor("e-new"), pendingPush: false });
    expect((linkOf("e-new")!.googleUpdated as Date).toISOString()).toBe(made.updated);
  });
});

describe("쓰기 훅", () => {
  it("만들기 → 구글에 만들고 연결(siteSyncedAt = 일정 updatedAt, googleUpdated = 응답 updated)", async () => {
    seedState();
    const ev = seedEvent("e1", { title: "치과", createdAt: now(), updatedAt: now(), color: "rose" });
    const g = fakeGoogle();
    await afterSiteCreate("e1", deps(g));
    const ins = g.calls.filter((c) => c.kind === "insert");
    expect(ins).toHaveLength(1);
    expect(ins[0].body).toMatchObject({
      id: googleIdFor("e1"), // 구글 일정 id 는 사이트 일정 id 에서 나온다
      summary: "치과",
      colorId: "4",
      start: { dateTime: "2026-10-20T01:00:00.000Z", timeZone: "Asia/Seoul" },
      end: { dateTime: "2026-10-20T02:00:00.000Z", timeZone: "Asia/Seoul" },
    });
    const made = g.events.get(googleIdFor("e1"))!;
    const l = linkOf("e1")!;
    expect(l.googleEventId).toBe(googleIdFor("e1"));
    expect((l.siteSyncedAt as Date).getTime()).toBe(ev.updatedAt.getTime());
    expect((l.googleUpdated as Date).toISOString()).toBe(made.updated);

    // 다음 동기화가 같은 것을 또 보내지 않는다
    expect(await runSync({ deps: deps(g), force: true })).toEqual({ ran: true, changed: 0, error: null });
    expect(g.writes()).toHaveLength(1);
  });

  it("만들기 — 구글 실패는 삼킨다(연결 없음), 다음 동기화가 보낸다", async () => {
    seedState();
    seedEvent("e1", { createdAt: now() });
    const g = fakeGoogle({ fail: (c) => (c.kind === "insert" ? googleError(500) : undefined) });
    await expect(afterSiteCreate("e1", deps(g))).resolves.toBeUndefined();
    expect(linkOf("e1")).toBeUndefined();
  });

  it("만들기 — 연결을 못 남겨도 사이트 일정이 그대로면 구글 일정을 거두지 않는다, 다음 동기화가 그 id 로 잇는다", async () => {
    seedState();
    seedEvent("e1", { createdAt: now() });
    h.failOnce["googleEventLink.create"] = true;
    const g = fakeGoogle();
    await afterSiteCreate("e1", deps(g));
    expect(g.calls.filter((c) => c.kind === "delete")).toHaveLength(0);
    expect(g.events.has(googleIdFor("e1"))).toBe(true);
    expect(linkOf("e1")).toBeUndefined();

    expect(await runSync({ deps: deps(g), force: true })).toMatchObject({ ran: true, error: null });
    expect(linkOf("e1")?.googleEventId).toBe(googleIdFor("e1"));
    expect(g.events.size).toBe(1); // 둘이 되지 않았다
    expect(h.tables.calendarEvent).toHaveLength(1);
  });

  it("만들기 — 그 사이 사이트 일정이 지워졌으면 방금 만든 구글 일정을 거둔다", async () => {
    seedState();
    seedEvent("e1", { createdAt: now() });
    // 구글에 만드는 동안 다른 사람이 사이트에서 지웠다(연결이 아직 없어 묘비도 없다)
    const g = fakeGoogle({
      fail: (c) => {
        if (c.kind === "insert") h.tables.calendarEvent = [];
        return undefined;
      },
    });
    await afterSiteCreate("e1", deps(g));
    expect(g.calls.filter((c) => c.kind === "delete").map((c) => c.id)).toEqual([googleIdFor("e1")]);
    expect(g.events.size).toBe(0);
  });

  it("만들기 — 다른 쪽이 먼저 같은 id 로 만들고 이었으면 거두지 않고 끝낸다", async () => {
    seedState();
    seedEvent("e1", { createdAt: now() });
    const id = googleIdFor("e1");
    // 훅이 보내는 사이 다른 기기의 동기화가 같은 일정을 먼저 보내고 이었다
    const g = fakeGoogle({
      fail: (c) => {
        if (c.kind === "insert" && !g.events.has(id)) {
          g.put(gev(id, { summary: "e1", updated: new Date(++h.clock.ms).toISOString() }));
          seedLink("l-other", "e1", id);
        }
        return undefined;
      },
    });
    await afterSiteCreate("e1", deps(g));
    expect(g.calls.filter((c) => c.kind === "delete")).toHaveLength(0);
    expect(g.events.size).toBe(1);
    expect(h.tables.googleEventLink).toHaveLength(1);
  });

  it("동기화의 pushNew 도 같다 — 다른 쪽(만들기 훅)이 먼저 이었으면 실패로 세지 않는다", async () => {
    seedState();
    seedEvent("e1", { createdAt: new Date(h.clock.ms - DAY) });
    const id = googleIdFor("e1");
    const g = fakeGoogle({
      fail: (c) => {
        if (c.kind === "insert" && !g.events.has(id)) {
          g.put(gev(id, { summary: "e1", updated: new Date(++h.clock.ms).toISOString() }));
          seedLink("l-hook", "e1", id);
        }
        return undefined;
      },
    });
    expect(await runSync({ deps: deps(g), force: true })).toEqual({ ran: true, changed: 0, error: null });
    expect(g.events.size).toBe(1);
    expect(g.calls.filter((c) => c.kind === "delete")).toHaveLength(0);
  });

  it("만들기 — 409(그 id 가 이미 있음) → 그 일정을 읽어 잇는다, 둘을 만들지 않는다", async () => {
    seedState();
    seedEvent("e1", { createdAt: now() });
    const id = googleIdFor("e1");
    const g = fakeGoogle();
    g.put(gev(id, { summary: "e1" })); // 지난번 만들기가 들어갔는데 응답을 못 받았다
    await afterSiteCreate("e1", deps(g));
    expect(g.calls.filter((c) => c.kind === "insert")).toHaveLength(1);
    expect(g.calls.filter((c) => c.kind === "get").map((c) => c.id)).toEqual([id]);
    expect(g.events.size).toBe(1);
    // 그 사이 어느 쪽이 고쳤는지 모른다 — 다음 동기화가 나중 것을 고르게 옛 시각으로 잇는다
    expect(linkOf("e1")).toMatchObject({ googleEventId: id, siteSyncedAt: new Date(0), googleUpdated: new Date(0) });
  });

  it("만들기 — 409 인데 구글에서 지운 것(cancelled) → 잇지 않고 그 건만 실패", async () => {
    seedState();
    seedEvent("e1", { createdAt: new Date(h.clock.ms - DAY) });
    const id = googleIdFor("e1");
    const g = fakeGoogle();
    g.put({ id, status: "cancelled", updated: "2026-10-15T00:00:00.000Z" });
    await afterSiteCreate("e1", deps(g));
    expect(linkOf("e1")).toBeUndefined();
    const out = (await runSync({ deps: deps(g), force: true })) as Extract<SyncOutcome, { ran: true }>;
    expect(out.error).toMatch(/1개/);
    expect(out.error).toContain("지운 일정");
    expect(linkOf("e1")).toBeUndefined();
    expect(h.tables.calendarEvent).toHaveLength(1);
  });

  it("만들기 — 이미 이어져 있으면 다시 보내지 않는다", async () => {
    seedState();
    seedEvent("e1");
    seedLink("l1", "e1", "g1");
    const g = fakeGoogle();
    await afterSiteCreate("e1", deps(g));
    expect(g.writes()).toHaveLength(0);
  });

  it("고치기 → 구글 patch, 연결의 두 시각 갱신", async () => {
    seedState();
    const ev = seedEvent("e1", { title: "고친 제목", updatedAt: now() });
    seedLink("l1", "e1", "g1");
    const g = fakeGoogle();
    g.put(gev("g1"));
    await afterSiteUpdate("e1", deps(g));
    expect(g.events.get("g1")?.summary).toBe("고친 제목");
    expect(link("l1")).toMatchObject({ pendingPush: false });
    expect((link("l1")!.siteSyncedAt as Date).getTime()).toBe(ev.updatedAt.getTime());
    expect((link("l1")!.googleUpdated as Date).toISOString()).toBe(g.events.get("g1")!.updated);
  });

  it("고치기 실패(500) → pendingPush, 던지지 않는다", async () => {
    seedState();
    seedEvent("e1", { updatedAt: now() });
    seedLink("l1", "e1", "g1");
    const g = fakeGoogle({ fail: (c) => (c.kind === "patch" ? googleError(500) : undefined) });
    g.put(gev("g1"));
    await expect(afterSiteUpdate("e1", deps(g))).resolves.toBeUndefined();
    expect(link("l1")).toMatchObject({ pendingPush: true });
  });

  it("고치기 — readOnly 연결은 구글에 아무것도 보내지 않는다(pendingPush 도 세우지 않는다)", async () => {
    seedState();
    seedEvent("e1", { updatedAt: now() });
    seedLink("l1", "e1", "g1_20261020", { readOnly: "recurring" });
    const g = fakeGoogle();
    await afterSiteUpdate("e1", deps(g));
    expect(g.calls).toHaveLength(0);
    expect(link("l1")).toMatchObject({ pendingPush: false });
  });

  it("지우기 → 묘비를 먼저 세우고, 구글 삭제가 되면 연결까지 없앤다", async () => {
    seedState();
    seedEvent("e1");
    seedLink("l1", "e1", "g1");
    const g = fakeGoogle();
    g.put(gev("g1"));
    const tomb = await beforeSiteDelete("e1");
    expect(tomb).toEqual({ linkId: "l1", googleEventId: "g1" });
    // 사이트 일정이 지워지기 **전에** 이미 묘비 — 이 사이에 함수가 죽어도 구글 일정이 고아로 남지 않는다
    expect(link("l1")).toMatchObject({ pendingDelete: true, eventId: "e1" });
    await h.client.calendarEvent.deleteMany({ where: { id: "e1" } });
    await afterSiteDelete(tomb, deps(g));
    expect(g.calls.filter((c) => c.kind === "delete").map((c) => c.id)).toEqual(["g1"]);
    expect(link("l1")).toBeUndefined();

    // 두 번째 지우기: 연결이 없으니 null, 아무것도 안 한다
    expect(await beforeSiteDelete("e1")).toBeNull();
    await afterSiteDelete(null, deps(g));
    expect(g.calls.filter((c) => c.kind === "delete")).toHaveLength(1);
  });

  it("지우기 실패(500) → 묘비(eventId null, pendingDelete), 다음 동기화가 지운다", async () => {
    seedState();
    seedEvent("e1");
    seedLink("l1", "e1", "g1");
    let down = true;
    const g = fakeGoogle({ fail: (c) => (down && c.kind === "delete" ? googleError(503) : undefined) });
    g.put(gev("g1"));
    const tomb = await beforeSiteDelete("e1");
    await h.client.calendarEvent.deleteMany({ where: { id: "e1" } });
    await expect(afterSiteDelete(tomb, deps(g))).resolves.toBeUndefined();
    expect(link("l1")).toMatchObject({ eventId: null, pendingDelete: true });
    expect(g.events.has("g1")).toBe(true);

    down = false;
    expect(await runSync({ deps: deps(g), force: true })).toEqual({ ran: true, changed: 1, error: null });
    expect(g.events.has("g1")).toBe(false);
    expect(link("l1")).toBeUndefined();
    // 지운 일정을 사이트에 다시 만들지 않았다
    expect(h.tables.calendarEvent).toHaveLength(0);
  });

  it("연결 없는 일정 지우기 → null, DB 쓰기 없음", async () => {
    seedEvent("e1");
    expect(await beforeSiteDelete("e1")).toBeNull();
    expect(h.writes).toEqual([]);
  });
});

describe("구글 일정 id — 응답을 못 받은 만들기", () => {
  it("googleIdFor 는 구글 규칙(base32hex a–v·0–9, 5~1024자)에 맞고 늘 같은 값이다", () => {
    for (const id of ["e1", "cmabc123xyz", "가족 모임", ""]) {
      const g = googleIdFor(id);
      expect(g).toMatch(/^[a-v0-9]{5,1024}$/);
      expect(googleIdFor(id)).toBe(g);
    }
    expect(googleIdFor("e1")).not.toBe(googleIdFor("e2"));
    // 값을 박아 둔다 — 식이 바뀌면 이미 보낸 일정과 짝을 못 찾는다
    expect(googleIdFor("abc")).toBe("pdba7816bf8f01cfea414140de5dae2223b00361a3");
  });

  it("구글엔 들어갔는데 응답이 끊김 → 다음 동기화가 그 id 로 잇는다(사이트에도 구글에도 둘이 생기지 않는다)", async () => {
    seedState();
    seedEvent("e1", { title: "치과", createdAt: now(), updatedAt: now() });
    let cut = true;
    const g = fakeGoogle({
      fail: (c) => {
        if (cut && c.kind === "insert") {
          // 구글은 받아서 만들었는데 응답이 돌아오지 않았다
          g.put({ ...(c.body as object), id: c.body!.id as string, status: "confirmed", updated: new Date(++h.clock.ms).toISOString() } as GEvent);
          throw new Error("socket hang up");
        }
        return undefined;
      },
    });
    await afterSiteCreate("e1", deps(g));
    expect(linkOf("e1")).toBeUndefined();
    cut = false;

    expect(await runSync({ deps: deps(g), force: true })).toEqual({ ran: true, changed: 1, error: null });
    expect(g.calls.filter((c) => c.kind === "insert")).toHaveLength(1); // 다시 보내지 않았다(pushNew 없음)
    expect(h.tables.calendarEvent).toHaveLength(1); // 사이트로 가져오지 않았다(createSite 없음)
    expect(g.events.size).toBe(1);
    expect(linkOf("e1")?.googleEventId).toBe(googleIdFor("e1"));

    // 다음 동기화가 나중 것으로 한 번 맞추고, 그다음은 조용하다
    h.clock.ms += 61_000;
    await runSync({ deps: deps(g) });
    h.clock.ms += 61_000;
    const before = g.writes().length;
    expect(await runSync({ deps: deps(g) })).toEqual({ ran: true, changed: 0, error: null });
    expect(g.writes().length).toBe(before);
    expect(h.tables.calendarEvent).toHaveLength(1);
  });

  it("미리보기도 되찾을 짝을 '이을 일정' 으로 센다(실제와 같은 수)", async () => {
    seedState({ initialDoneAt: null });
    seedEvent("e1", { title: "치과", start: at("2026-10-25T01:00:00.000Z") });
    const g = fakeGoogle();
    g.put(gev(googleIdFor("e1"), { summary: "제목을 구글에서 바꿈", start: { dateTime: "2026-10-26T10:00:00+09:00" } }));
    expect(await previewInitial(deps(g))).toEqual({ toPush: 0, toLink: 1, toImport: 0 });
    expect(await runSync({ initial: true, force: true, deps: deps(g) })).toEqual({ ran: true, changed: 1, error: null });
    expect(g.writes()).toHaveLength(0);
    expect(h.tables.calendarEvent).toHaveLength(1);
  });
});

describe("readOnlyReason · gcalStatus", () => {
  it("연결의 readOnly 를 돌려준다 — 없거나 모르는 값이면 null", async () => {
    seedEvent("e1");
    seedEvent("e2");
    seedEvent("e3");
    seedEvent("e4");
    seedLink("l1", "e1", "g1_1", { readOnly: "recurring" });
    seedLink("l2", "e2", "g2", { readOnly: "multiday" });
    seedLink("l3", "e3", "g3");
    expect(await readOnlyReason("e1")).toBe("recurring");
    expect(await readOnlyReason("e2")).toBe("multiday");
    expect(await readOnlyReason("e3")).toBeNull();
    expect(await readOnlyReason("e4")).toBeNull();
    expect(await readOnlyReason("없는 일정")).toBeNull();
  });

  it("409 문구는 전역 문구 그대로", () => {
    expect(READONLY_MESSAGE).toBe("구글에서 반복되는(또는 여러 날) 일정이라 구글 캘린더에서 고쳐 주세요.");
  });

  it("상태 — 켜짐·캘린더·시각·연결 수·대기 수 (DB 쓰기 없음)", async () => {
    const done = at("2026-10-01T00:00:00.000Z");
    seedState({ initialDoneAt: done, lastSyncAt: at("2026-10-16T02:00:00.000Z"), lastError: "구글 캘린더 요청이 실패했어요 (500)" });
    seedEvent("e1");
    seedEvent("e2");
    seedLink("l1", "e1", "g1");
    seedLink("l2", "e2", "g2", { pendingPush: true });
    seedLink("l3", null, "g3", { pendingDelete: true });
    expect(await gcalStatus()).toEqual({
      config: "on",
      calendarId: CAL,
      initialDoneAt: "2026-10-01T00:00:00.000Z",
      lastSyncAt: "2026-10-16T02:00:00.000Z",
      lastError: "구글 캘린더 요청이 실패했어요 (500)",
      linked: 2,
      pending: 2,
    });
    expect(h.writes).toEqual([]);
  });

  it("상태 — 꺼짐이면 이유와 calendarId null, 상태 행이 없어도 던지지 않는다", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", "{nope");
    expect(await gcalStatus()).toEqual({
      config: "bad_key", calendarId: null, initialDoneAt: null, lastSyncAt: null, lastError: null, linked: 0, pending: 0,
    });
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", "");
    expect((await gcalStatus()).config).toBe("missing");
  });

  it("상태 — 캘린더가 바뀌었으면(아직 맞추기 전) initialDoneAt 을 비워 보인다", async () => {
    seedState({ calendarId: "old@example.com" });
    expect((await gcalStatus()).initialDoneAt).toBeNull();
  });
});

describe("비밀", () => {
  it("결과·lastError·로그 어디에도 토큰·키·Bearer 가 없다", async () => {
    const logs: string[] = [];
    for (const m of ["error", "warn", "log", "info"] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
        logs.push(a.map((x) => (x instanceof Error ? `${x.name} ${x.message} ${x.stack}` : typeof x === "string" ? x : JSON.stringify(x))).join(" "));
      });
    }
    seedState();
    seedEvent("e1", { updatedAt: new Date(h.clock.ms - DAY) });
    seedEvent("e2", { createdAt: new Date(h.clock.ms - DAY) });
    seedLink("l1", "e1", "g1");
    seedLink("l9", null, "g9", { pendingDelete: true });
    const g = fakeGoogle({
      fail: (c) => (c.kind === "patch" || c.kind === "insert" || c.kind === "delete" ? googleError(500) : undefined),
    });
    g.put(gev("g1"));
    g.put(gev("g9"));
    const outs: unknown[] = [];
    outs.push(await runSync({ deps: deps(g), force: true }));
    await afterSiteUpdate("e1", deps(g));
    await afterSiteCreate("e2", deps(g));
    // 토큰 끝점이 키 조각을 본문에 되돌려 주는 최악의 경우
    _resetTokenCache();
    const g2 = fakeGoogle({
      fail: (c) => (c.kind === "token" ? json(400, { error: "invalid_grant", error_description: privateKey }) : undefined),
    });
    outs.push(await runSync({ deps: deps(g2), force: true }));
    outs.push(await previewInitial(deps(g2)));

    const keyBody = privateKey.split("\n")[1];
    const everything = [JSON.stringify(outs), String(state().lastError), ...logs].join("\n");
    expect(everything).not.toContain(TOKEN);
    expect(everything).not.toContain("Bearer");
    expect(everything).not.toContain("PRIVATE KEY");
    expect(everything).not.toContain(keyBody);
    // 카나리아 — 실제로 실패가 일어났고 무언가가 기록됐다(아무것도 안 해서 통과한 것이 아니다)
    expect(logs.length).toBeGreaterThan(0);
    expect(String(state().lastError)).toContain("구글");
  });
});
