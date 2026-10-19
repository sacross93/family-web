import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// 일정 라우트가 구글 동기화 훅을 **어떤 순서로** 부르는지, 반복 회차·여러 날 일정을 409 로 막는지.
// 엔진(lib/gcal/sync.ts)은 따로 시험한다 — 여기서는 훅을 가짜로 바꾸고 라우트의 배선만 본다.
// 409 일 때는 DB 쓰기도 훅도 하나도 불리지 않아야 한다(= 구글에 아무 요청도 가지 않는다).

const calls = vi.hoisted(() => [] as string[]);
const ro = vi.hoisted(() => ({
  reason: null as "recurring" | "multiday" | null,
  /** beforeSiteDelete 가 돌려줄 것 — 라우트 확인 뒤 그 사이 readOnly 가 된 경우를 흉내 낸다 */
  ticket: { linkId: "l1", googleEventId: "g1" } as { linkId: string; googleEventId: string } | { readOnly: "recurring" | "multiday" } | null,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    calendarEvent: {
      create: vi.fn(async (a: { data: Record<string, unknown> }) => {
        calls.push("db.create");
        return { id: "new-1", ...a.data };
      }),
      update: vi.fn(async (a: { where: { id: string }; data: Record<string, unknown> }) => {
        calls.push("db.update");
        return { id: a.where.id, ...a.data };
      }),
      deleteMany: vi.fn(async () => {
        calls.push("db.deleteMany");
        return { count: 1 };
      }),
    },
  },
}));

vi.mock("@/lib/gcal/sync", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/gcal/sync")>();
  return {
    READONLY_MESSAGE: real.READONLY_MESSAGE,
    readOnlyReason: vi.fn(async (id: string) => {
      calls.push(`readOnlyReason:${id}`);
      return ro.reason;
    }),
    afterSiteCreate: vi.fn(async (id: string) => void calls.push(`afterSiteCreate:${id}`)),
    afterSiteUpdate: vi.fn(async (id: string) => void calls.push(`afterSiteUpdate:${id}`)),
    beforeSiteDelete: vi.fn(async (id: string) => {
      calls.push(`beforeSiteDelete:${id}`);
      return ro.ticket;
    }),
    afterSiteDelete: vi.fn(async (link: unknown) => void calls.push(`afterSiteDelete:${JSON.stringify(link)}`)),
  };
});

import { POST } from "@/app/api/events/route";
import { PATCH, DELETE } from "@/app/api/events/[id]/route";

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/events/e1", {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  calls.length = 0;
  ro.reason = null;
  ro.ticket = { linkId: "l1", googleEventId: "g1" };
});

describe("/api/events — 구글 동기화 배선", () => {
  it("POST: 저장 → afterSiteCreate(새 id) → 200(일정 그대로)", async () => {
    const res = await POST(req("POST", { title: "치과", date: "2026-10-20", startTime: "10:00" }));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe("new-1");
    expect(calls).toEqual(["db.create", "afterSiteCreate:new-1"]);
  });

  it("PATCH: readOnly 확인 → 저장 → afterSiteUpdate", async () => {
    const res = await PATCH(req("PATCH", { title: "고친 제목" }), params("e1"));
    expect(res.status).toBe(200);
    expect(calls).toEqual(["readOnlyReason:e1", "db.update", "afterSiteUpdate:e1"]);
  });

  it("DELETE: readOnly 확인 → 묘비(beforeSiteDelete) → deleteMany → afterSiteDelete(그 연결) → 200", async () => {
    const res = await DELETE(req("DELETE"), params("e1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(calls).toEqual([
      "readOnlyReason:e1",
      "beforeSiteDelete:e1",
      "db.deleteMany",
      `afterSiteDelete:${JSON.stringify({ linkId: "l1", googleEventId: "g1" })}`,
    ]);
  });

  it("DELETE: 확인은 통과했는데 묘비를 세우려는 순간 readOnly 가 됐다 → 409, 지우지 않는다", async () => {
    ro.ticket = { readOnly: "recurring" };
    const res = await DELETE(req("DELETE"), params("e1"));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "구글에서 반복되는(또는 여러 날) 일정이라 구글 캘린더에서 고쳐 주세요.",
      readOnly: "recurring",
    });
    expect(calls).toEqual(["readOnlyReason:e1", "beforeSiteDelete:e1"]); // deleteMany·afterSiteDelete 없음
  });

  it("두 번 지워도 200", async () => {
    expect((await DELETE(req("DELETE"), params("e1"))).status).toBe(200);
    expect((await DELETE(req("DELETE"), params("e1"))).status).toBe(200);
  });

  for (const reason of ["recurring", "multiday"] as const) {
    it(`readOnly(${reason}) 일정 PATCH → 409, 저장·훅 없음`, async () => {
      ro.reason = reason;
      const res = await PATCH(req("PATCH", { title: "고쳐 보기" }), params("e1"));
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: "구글에서 반복되는(또는 여러 날) 일정이라 구글 캘린더에서 고쳐 주세요.",
        readOnly: reason,
      });
      expect(calls).toEqual(["readOnlyReason:e1"]);
    });

    it(`readOnly(${reason}) 일정 DELETE → 409, 묘비·삭제·훅 없음`, async () => {
      ro.reason = reason;
      const res = await DELETE(req("DELETE"), params("e1"));
      expect(res.status).toBe(409);
      expect((await res.json()).readOnly).toBe(reason);
      expect(calls).toEqual(["readOnlyReason:e1"]);
    });
  }
});
