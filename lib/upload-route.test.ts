import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 로컬 `/api/upload` POST 의 저장 공간 문지기. 운영 직접 올리기와 같은 판단(lib/upload-guard.ts)을
 * **실제 파일 크기**로 한다. 거절하면 파일을 하나도 쓰지 않는다.
 */
const store = vi.hoisted(() => ({ bytes: 0, reserved: [] as Array<[number, number]>, writes: [] as string[] }));
vi.mock("@/lib/blob-usage", () => ({
  currentLimit: () => 1_000_000, // 1MB 한도 → 900,000 바이트에서 막힌다
  getUsage: async () => ({ bytes: store.bytes, count: 0, measuredAt: new Date() }),
  reserveUsage: async (n: number, files: number) => {
    store.reserved.push([n, files]);
    return true;
  },
}));
vi.mock("fs/promises", () => ({
  writeFile: async (p: string) => {
    store.writes.push(p);
  },
}));

function req(files: File[]) {
  const fd = new FormData();
  for (const f of files) fd.append("file", f);
  return new Request("http://localhost:3000/api/upload", { method: "POST", body: fd });
}
const png = (bytes: number) => new File([new Uint8Array(bytes)], "a.png", { type: "image/png" });

async function post(files: File[]) {
  const { POST } = await import("@/app/api/upload/route");
  // NextRequest 자리에 Request 를 넘긴다 — 라우트는 formData() 만 쓴다.
  return POST(req(files) as never);
}

describe("로컬 업로드의 저장 공간 문지기", () => {
  beforeEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    Object.assign(store, { bytes: 0, reserved: [], writes: [] });
  });

  it("넉넉하면 쓰고, 실제 크기를 예약한다", async () => {
    const res = await post([png(1000)]);
    expect(res.status).toBe(200);
    expect(store.reserved).toEqual([[1000, 1]]);
    expect(store.writes).toHaveLength(1);
  });

  it("선을 넘기면 507 STORAGE_FULL — 파일을 하나도 안 쓴다", async () => {
    store.bytes = 899_500; // 500 바이트 남음
    const res = await post([png(1000)]);
    expect(res.status).toBe(507);
    expect((await res.json()).code).toBe("STORAGE_FULL");
    expect(store.writes).toEqual([]);
    expect(store.reserved).toEqual([]);
  });

  it("여러 장이면 합으로 본다", async () => {
    store.bytes = 899_000; // 1000 남음
    expect((await post([png(600), png(600)])).status).toBe(507);
    expect(store.writes).toEqual([]);
  });
});
