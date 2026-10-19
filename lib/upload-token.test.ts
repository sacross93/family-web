import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getPayloadFromClientToken } from "@vercel/blob/client";
import { extFor, isUploadPath } from "@/lib/upload-kinds";
import { uploadKind, safeBasename } from "@/lib/uploads";
import { canOptimize } from "@/lib/img";

/**
 * 운영의 직접 올리기(브라우저 → Blob) 표 발급. 로컬엔 Blob 토큰이 없어 끝까지는 못 밟는다 —
 * 여기서는 **표에 무엇이 실리는지**를 본다: 로그인·경로·꼬리 없음·완료 알림 없음.
 */
const user = vi.hoisted(() => ({ current: null as null | { id: string } }));
vi.mock("@/lib/current-user", () => ({ getCurrentUser: async () => user.current }));

// 저장 공간 기억(BlobUsage 표) 대신 — 사용량·예약을 시험이 정한다.
const store = vi.hoisted(() => ({
  bytes: 0,
  fail: false,
  reserveOk: true,
  reserved: [] as number[],
}));
vi.mock("@/lib/blob-usage", () => ({
  currentLimit: () => 1_000_000_000,
  getUsage: async () => {
    if (store.fail) throw new Error("no table");
    return { bytes: store.bytes, count: 0, measuredAt: new Date() };
  },
  reserveUsage: async (n: number) => {
    store.reserved.push(n);
    return store.reserveOk;
  },
}));

const UUID = "0f8e1c2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const GOOD = `uploads/${UUID}.png`;
// 모양만 맞춘 가짜 읽기·쓰기 토큰(`vercel_blob_rw_<가게>_<비밀>`). 네트워크는 안 탄다 — 서명만 한다.
const FAKE_RW = "vercel_blob_rw_teststore123_secretsecretsecret";

function req(body: unknown) {
  return new Request("http://localhost:3000/api/upload/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const tokenEvent = (pathname: string, clientPayload: string | null = null) => ({
  type: "blob.generate-client-token",
  payload: { pathname, clientPayload, multipart: false },
});
const sized = (size: unknown) => JSON.stringify({ size });

async function post(body: unknown) {
  const { POST } = await import("@/app/api/upload/token/route");
  return POST(req(body));
}

describe("직접 올리기 표 — /api/upload/token", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.BLOB_READ_WRITE_TOKEN;
    process.env.BLOB_READ_WRITE_TOKEN = FAKE_RW;
    user.current = { id: "u1" };
    Object.assign(store, { bytes: 0, fail: false, reserveOk: true, reserved: [] });
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = saved;
  });

  it("로그인한 가족에게 표를 준다 — 경로 그대로, 무작위 꼬리 없이, 완료 알림 없이", async () => {
    const res = await post(tokenEvent(GOOD));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.type).toBe("blob.generate-client-token");
    const p = getPayloadFromClientToken(json.clientToken) as unknown as Record<string, unknown>;
    expect(p.pathname).toBe(GOOD);
    expect(p.addRandomSuffix).toBe(false);
    expect(p.maximumSizeInBytes).toBe(50 * 1024 * 1024);
    expect(p.allowedContentTypes).toEqual(["image/*"]);
    // 완료 알림이 실리면 Vercel 이 쿠키 없이 이 라우트를 다시 부른다 → proxy 401.
    expect(p.onUploadCompleted).toBeUndefined();
  });

  it("로그인이 없으면 표를 안 준다", async () => {
    user.current = null;
    const res = await post(tokenEvent(GOOD));
    expect(res.status).toBe(401);
    expect(JSON.stringify(await res.json())).not.toContain("clientToken");
  });

  it("우리 규칙 밖의 경로는 안 된다", async () => {
    for (const bad of [
      "uploads/../.env",
      `uploads/${UUID}.png/x`,
      `other/${UUID}.png`,
      "uploads/abc.png",
      `uploads/${UUID}`,
      `uploads/${UUID}.toolongext`,
      `/uploads/${UUID}.png`,
    ]) {
      const res = await post(tokenEvent(bad));
      expect(res.status, bad).toBe(400);
    }
  });

  it("완료 알림 같은 다른 요청은 받지 않는다", async () => {
    const res = await post({ type: "blob.upload-completed", payload: {} });
    expect(res.status).toBe(400);
  });

  it("저장 공간이 막는 선(90%)을 넘기면 507 STORAGE_FULL — 표를 안 준다, 예약도 안 한다", async () => {
    store.bytes = 900_000_000 - 1_000_000; // 1MB 남음
    const res = await post(tokenEvent(GOOD, sized(2_000_000)));
    expect(res.status).toBe(507);
    const json = await res.json();
    expect(json.code).toBe("STORAGE_FULL");
    expect(json.clientToken).toBeUndefined();
    expect(store.reserved).toEqual([]);
  });

  it("이미 막혔으면 크기를 안 알려 줘도 거절", async () => {
    store.bytes = 900_000_000;
    expect((await post(tokenEvent(GOOD))).status).toBe(507);
  });

  it("허락하면 그 크기를 예약하고, 표의 상한은 남은 양까지", async () => {
    store.bytes = 900_000_000 - 10_000_000; // 10MB 남음
    const res = await post(tokenEvent(GOOD, sized(3_000_000)));
    expect(res.status).toBe(200);
    expect(store.reserved).toEqual([3_000_000]);
    const p = getPayloadFromClientToken((await res.json()).clientToken) as unknown as Record<string, unknown>;
    expect(p.maximumSizeInBytes).toBe(10_000_000);
  });

  it("크기를 속이거나 빼먹으면 0 으로 보되 — 표의 상한이 남은 양으로 막는다", async () => {
    store.bytes = 900_000_000 - 7_000_000;
    for (const payload of ["not json", sized(-1), sized("big"), null]) {
      store.reserved = [];
      const res = await post(tokenEvent(GOOD, payload));
      expect(res.status, String(payload)).toBe(200);
      expect(store.reserved).toEqual([0]);
      const p = getPayloadFromClientToken((await res.json()).clientToken) as unknown as Record<string, unknown>;
      expect(p.maximumSizeInBytes).toBe(7_000_000);
    }
  });

  it("판단과 예약 사이에 다른 사람이 채웠으면(예약 실패) 거절", async () => {
    store.reserveOk = false;
    expect((await post(tokenEvent(GOOD, sized(1000)))).status).toBe(507);
  });

  it("사용량을 못 재면 막지 않는다 — 한 장 상한은 그대로", async () => {
    store.fail = true;
    const res = await post(tokenEvent(GOOD, sized(1000)));
    expect(res.status).toBe(200);
    const p = getPayloadFromClientToken((await res.json()).clientToken) as unknown as Record<string, unknown>;
    expect(p.maximumSizeInBytes).toBe(50 * 1024 * 1024);
  });

  it("경로가 틀리면 예약하지 않는다", async () => {
    expect((await post(tokenEvent("uploads/x.png", sized(1000)))).status).toBe(400);
    expect(store.reserved).toEqual([]);
  });

  it("Blob 토큰이 없는 곳(로컬)에서는 이 길이 없다", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const res = await post(tokenEvent(GOOD));
    expect(res.status).toBe(404);
  });
});

describe("직접 올린 주소를 다른 곳들이 알아본다", () => {
  // 직접 올리기가 만들 주소의 모양. 무작위 꼬리가 붙으면 이 모양이 깨진다.
  const url = `https://teststore123.public.blob.vercel-storage.com/${GOOD}`;

  it("경로 규칙", () => {
    expect(isUploadPath(GOOD)).toBe(true);
    expect(isUploadPath(`uploads/${UUID}${extFor("IMG_0001.HEIC", "image/heic")}`)).toBe(true);
    // 이름이 이상해도 형식에서 확장자를 얻어 규칙을 지킨다.
    expect(isUploadPath(`uploads/${UUID}${extFor("사진.사진", "image/png")}`)).toBe(true);
    expect(isUploadPath(`uploads/${UUID}${extFor("noext", "")}`)).toBe(true);
  });

  it("지우기(uploadKind·safeBasename)", () => {
    expect(uploadKind(url)).toBe("blob");
    expect(safeBasename(url)).toBe(`${UUID}.png`);
  });

  it("줄여 보내기(canOptimize)", () => {
    expect(canOptimize(url)).toBe(true);
  });

  it("포동이의 사진 주소 허용(ownImageUrl 과 같은 조건)", () => {
    // app/api/agent/route.ts: https + hostname.endsWith(".blob.vercel-storage.com")
    const u = new URL(url);
    expect(u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com")).toBe(true);
  });
});

describe("extFor", () => {
  it("이름의 확장자를 소문자로", () => {
    expect(extFor("a.JPG", "image/jpeg")).toBe(".jpg");
    expect(extFor("a.b.webp", "image/webp")).toBe(".webp");
  });
  it("이름이 이상하면 형식에서", () => {
    expect(extFor("a.jpg~", "image/jpeg")).toBe(".jpg");
    expect(extFor("", "image/heif")).toBe(".heif");
    expect(extFor(undefined, "image/svg+xml")).toBe(".svg");
  });
  it("아무것도 모르면 .jpg", () => {
    expect(extFor("x", "image/x-unknown")).toBe(".jpg");
  });
});
