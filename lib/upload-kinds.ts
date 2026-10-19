// 올린 파일의 "모양" — 어떤 형식을 받고, 저장 경로가 어떻게 생겼는가.
//
// 네 곳이 같은 답을 내야 한다: 로컬 업로드 라우트(`app/api/upload`), 운영의 직접 올리기 표 발급
// (`app/api/upload/token`), 브라우저 쪽 올리기(`lib/upload-client.ts`), 시험. 그래서 한 곳에 둔다.
// **fs·path·브라우저 API 를 import 하지 않는다** — 브라우저와 서버가 같이 읽는다.
// (`lib/uploads.ts` 는 fs 를 끌어와 브라우저가 못 읽고, `lib/img.ts` 는 next.config 가 읽어 가볍게 둔다.)

export const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/svg+xml": ".svg",
};

/**
 * 받는 형식. 로컬 라우트가 `image/*` 를 다 받으므로 운영(직접 올리기)도 똑같이 받는다 —
 * 좁히면 **로컬에선 되는 사진이 운영에서만 거절**된다. Blob 은 와일드카드를 받는다.
 */
export const ALLOWED_UPLOAD_TYPES = ["image/*"] as const;

/** 운영에서 한 장의 상한. 폰 원본은 3~12MB, 넉넉히. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * 저장 경로. `uploads/<uuid><확장자>` — **무작위 꼬리 없이.**
 * 이 모양에 기대는 곳이 셋 있다: 포동이의 사진 주소 허용(`app/api/agent/route.ts` ownImageUrl),
 * 줄여 보내기(`lib/img.ts` canOptimize), 지우기(`lib/uploads.ts` uploadKind·safeBasename).
 */
export const UPLOAD_PATH_RE = /^uploads\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

const EXT_RE = /^\.[a-z0-9]{2,5}$/;

/**
 * 파일 확장자. 이름에 있는 것을 먼저 쓰고(소문자로), 이름이 이상하면 형식에서, 그것도 없으면 `.jpg`.
 * 이름에서 온 확장자가 경로 규칙에 안 맞으면(`.jpg~`, 한글 등) 형식 쪽으로 넘어간다 —
 * 그래야 직접 올리기의 경로 검사(`UPLOAD_PATH_RE`)를 늘 통과한다.
 */
export function extFor(name: string | undefined, type: string | undefined): string {
  const m = /\.[^./\\]+$/.exec(name ?? "");
  const fromName = m ? m[0].toLowerCase() : "";
  if (EXT_RE.test(fromName)) return fromName;
  return EXT_BY_TYPE[type ?? ""] ?? ".jpg";
}

/** 저장 경로가 우리 규칙에 맞는가(직접 올리기 표를 내주기 전에 서버가 본다). */
export function isUploadPath(pathname: string): boolean {
  return UPLOAD_PATH_RE.test(pathname);
}
