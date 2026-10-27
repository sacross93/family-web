// 사진 올리기 — 화면의 **유일한** 길. `/api/upload` 를 직접 부르지 말 것.
//
// 두 가지를 여기서 정한다.
//
// 1) 무엇을 올리나 — 부르는 쪽이 고른다.
//    - `ORIGINAL`: **원본 그대로**(바이트 하나 안 바꾼다). 앨범 사진·꾸미기 스티커·포동이에게 붙인 사진.
//      화면에는 `lib/img.ts` 가 줄인 것을 보내므로 저장은 원본이어도 된다.
//      **예외 하나 — HEIC/HEIF**: 크롬·안드로이드는 HEIC 를 못 그리고 최적화도 못 읽는다. 브라우저가
//      읽을 수 있으면(사파리) 같은 해상도의 JPEG(품질 0.92)로 바꿔 올리고, 못 읽으면 그대로 올린다.
//      (그래서 아이폰에서 올린 HEIC 사진은 **파일에서** 촬영 정보가 빠진다 — 앨범은 올리기 전에 원본에서
//      찍은 날을 읽어 따로 적어 둔다, `lib/photo-date-client.ts`. 크기는 줄이지 않는다.)
//    - `{ maxEdge }`: 줄여서. 글 속 사진(2000)·브랜드/홈 그림(800). 투명은 지킨다(`lib/image-upload.ts`).
//
// 2) 어느 길로 올리나 — 서버에 GET 으로 한 번 묻고 기억한다.
//    - 운영(Blob 토큰 있음): 브라우저가 **Blob 에 바로** 올린다. Vercel 함수는 본문 4.5MB 가 끝이라
//      (413, 못 바꾼다) 폰 원본(3~12MB)을 함수로 못 보낸다. `/api/upload/token` 은 표만 내준다.
//    - 로컬: `/api/upload` POST 로 **한 장씩**(public/uploads). 여러 장을 한 요청에 담으면 proxy 의
//      본문 상한(next.config `proxyClientMaxBodySize`)에 걸려 조용히 잘린다.
//
// 3) 저장 공간이 차면(서버 문지기, `lib/upload-guard.ts`) 두 길 다 507 `STORAGE_FULL` 을 받는다 →
//    `UploadError("STORAGE_FULL")`. 화면은 `uploadErrorMessage(e)` 로 "저장 공간이 거의 찼어요" 를 띄운다.

import { shrinkForUpload } from "@/lib/image-upload";
import { extFor, isUploadPath } from "@/lib/upload-kinds";

export type UploadMode = { keep: "original" } | { maxEdge: number };

/** 원본 그대로 저장. */
export const ORIGINAL: UploadMode = { keep: "original" };

// **조각 올리기(multipart)는 쓰지 않는다.** 조각 하나하나·시작·마무리가 저마다 Blob 의 "고급 요청" 이라
// 한 장에 여러 건을 태운다 — Hobby 는 월 2천 건이고 넘으면 저장소 전체가 멈춘다(`lib/blob-budget.ts`).
// 한 번에 올리기(PUT 한 번 = 고급 요청 한 건)로 충분하다: `@vercel/blob` 2.6.1 의 타입은 표의
// `maximumSizeInBytes` 상한을 "최대 5TB" 로만 적고(create-folder-*.d.ts), 조각 올리기는 "큰 파일에 쓰라"
// 는 권고일 뿐 한 번에 올리기에 따로 작은 크기 제한을 두지 않는다(client.d.ts `multipart` 설명. README 도
// 서버 올리기의 4.5MB 말고는 제한을 말하지 않는다). 우리 한 장 상한은 50MB 다.

/** 거절의 종류. 화면은 `uploadErrorMessage` 로 문구를 고른다. */
export class UploadError extends Error {
  constructor(public readonly code: "STORAGE_FULL" | "FAILED") {
    super(code === "STORAGE_FULL" ? "storage full" : "upload failed");
    this.name = "UploadError";
  }
}

export const isStorageFull = (e: unknown) => e instanceof UploadError && e.code === "STORAGE_FULL";

/** 화면에 띄울 한 줄. 저장 공간이 찼으면 그 말을, 아니면 흔한 실패 문구를. */
export function uploadErrorMessage(e: unknown): string {
  if (isStorageFull(e)) {
    return "저장 공간이 거의 찼어요. 관리자에게 알려 주세요 — 관리자 화면의 「사진 저장 공간」에서 볼 수 있어요.";
  }
  return "사진을 못 올렸어요. 잠시 후 다시 시도해 주세요.";
}

/** 서버 응답에서 거절 종류를 읽는다. */
async function failure(res: Response): Promise<UploadError> {
  const body = (await res.json().catch(() => null)) as { code?: unknown } | null;
  return new UploadError(res.status === 507 || body?.code === "STORAGE_FULL" ? "STORAGE_FULL" : "FAILED");
}

let transport: Promise<boolean> | null = null;

/** 브라우저가 Blob 에 바로 올리는가. 한 번 묻고 기억한다(실패하면 다음에 다시 묻는다). */
function directToBlob(): Promise<boolean> {
  transport ??= fetch("/api/upload")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: { direct?: unknown }) => j?.direct === true)
    .catch(() => {
      transport = null;
      return false;
    });
  return transport;
}

/** `crypto.randomUUID` 는 https·localhost 에서만 있다(`dev:lan` 의 http 주소엔 없다). */
function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function isHeic(file: File): boolean {
  return /^image\/hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

/**
 * 원본 저장의 유일한 예외: HEIC → 같은 해상도 JPEG. 못 바꾸면 HEIC 그대로.
 * (아이폰 48MP 사진처럼 캔버스 한도를 넘으면 `toBlob` 이 빈손으로 돌아온다 — 그때도 그대로.)
 */
async function heicToJpeg(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // 크롬·안드로이드 — 못 읽는다. 그대로 올린다.
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
    if (!blob || blob.type !== "image/jpeg") return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}

async function prepare(file: File, mode: UploadMode): Promise<File> {
  if ("keep" in mode) return heicToJpeg(file);
  return shrinkForUpload(file, mode.maxEdge).catch(() => file);
}

/** 사진 한 장을 올리고 저장된 주소를 돌려준다. 실패하면 `UploadError` 를 던진다(저장 공간이 찼으면 STORAGE_FULL). */
export async function uploadImage(file: File, mode: UploadMode): Promise<string> {
  const body = await prepare(file, mode);

  if (await directToBlob()) {
    const pathname = `uploads/${uuid()}${extFor(body.name, body.type)}`;
    if (!isUploadPath(pathname)) throw new UploadError("FAILED");
    // 표는 직접 받는다(`upload()` 를 쓰지 않는다) — `upload()` 는 표 라우트가 거절하면 상태 코드를 버리고
    // "Failed to retrieve the client token" 만 던져, 저장 공간이 찬 것(507)을 알 수 없다. 하는 일은 같다:
    // 표를 받고 → 그 표로 `put` 한 번.
    const res = await fetch("/api/upload/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "blob.generate-client-token",
        // 크기는 서버의 저장 공간 판단에 쓴다(서버는 믿지 않고 표의 상한으로 다시 막는다).
        payload: { pathname, clientPayload: JSON.stringify({ size: body.size }), multipart: false },
      }),
    }).catch(() => null);
    if (!res) throw new UploadError("FAILED");
    if (!res.ok) throw await failure(res);
    const { clientToken } = (await res.json().catch(() => ({}))) as { clientToken?: unknown };
    if (typeof clientToken !== "string" || !clientToken) throw new UploadError("FAILED");
    // Blob SDK 는 이 길(운영)에서만 받는다 — 꾸미기 표면이 셸 안에 있어 정적으로 넣으면 모든 화면이 싣는다.
    const { put } = await import("@vercel/blob/client");
    try {
      const blob = await put(pathname, body, {
        access: "public",
        token: clientToken,
        contentType: body.type || undefined,
      });
      return blob.url;
    } catch {
      throw new UploadError("FAILED");
    }
  }

  const form = new FormData();
  form.append("file", body);
  const res = await fetch("/api/upload", { method: "POST", body: form }).catch(() => null);
  if (!res) throw new UploadError("FAILED");
  if (!res.ok) throw await failure(res);
  const json = (await res.json().catch(() => ({}))) as { urls?: unknown };
  const url = Array.isArray(json.urls) ? json.urls[0] : null;
  if (typeof url !== "string" || !url) throw new UploadError("FAILED");
  return url;
}
