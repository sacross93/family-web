// 올리기 전에 브라우저에서 사진을 줄인다 — **글 속 사진과 브랜드·홈 그림에만.**
//
// 앨범 사진과 꾸미기 스티커는 여기를 거치지 않는다. 가족이 고른 방향이다: **원본 그대로 저장**하고
// (바이트 하나 안 바꾼다), 화면에는 `lib/img.ts` 가 줄인 것을 보낸다. 올리는 길은 `lib/upload-client.ts`.
//
// 여기서 줄이는 것들도 **투명은 지킨다.** 예전에는 무엇이든 JPEG 로 다시 눌러서 투명 PNG 의
// 빈 곳이 검게(불투명하게) 칠해졌다. 이제 투명을 담을 수 있는 형식(PNG·WebP·AVIF)은 PNG 로,
// 나머지만 JPEG 로 다시 쓴다. 픽셀을 훑지 않고 **형식만 보고** 정한다(큰 사진을 훑으면 느리다).
//
// 바뀐 점 하나: PNG 는 PNG 로 다시 써도 잘 안 줄어서, "줄인 게 원본보다 크면 원본" 규칙에
// 자주 걸린다 — 그러면 **원래 해상도 원본**이 그대로 올라간다. 투명을 깨는 것보다 낫다.
//
// 왜 브라우저에서: 사진이 이미 거기 있고, `sharp` 같은 의존성이 늘지 않고,
// 저장소(개발=public/uploads, 운영=Blob)를 되읽는 갈래를 만들지 않아도 된다.
// (`components/agent/image-attach.ts` 가 모델에게 보낼 사본에 쓰는 것과 같은 방식이다.)

/** 쓰임새별 긴 변 상한. 쓰는 쪽에서 고른다. */
export const MAX_EDGE = {
  /** 글 속 사진(게시판·계획·아기 일기). 폰 화면의 4배 이상. */
  photo: 2000,
  /** 브랜드·홈 큰 그림. 화면에서 최대 200px 남짓이다. */
  brand: 800,
} as const;

/** JPEG 품질. 0.82 아래로 내리면 사람 얼굴에 얼룩이 보이기 시작한다. */
const QUALITY = 0.82;

/**
 * 줄인 뒤 크기. 원본이 이미 작으면 **늘리지 않는다**.
 * 캔버스가 없는 곳에서도 확인할 수 있게 따로 뺐다(vitest).
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height };
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/**
 * 손대면 안 되는 사진.
 * - GIF: 캔버스에 그리면 **움직임이 사라진다**.
 * - SVG: 그림이 아니라 그리는 방법이라, 픽셀로 바꾸면 되레 커지고 흐려진다.
 */
export function keepAsIs(type: string): boolean {
  return type === "image/gif" || type === "image/svg+xml";
}

/**
 * 다시 쓸 형식. 투명을 담을 수 있는 형식이면 PNG(투명 보존), 아니면 JPEG.
 * 사진에 실제로 투명한 곳이 있는지는 보지 않는다 — 형식만 본다.
 */
export function outputTypeFor(inputType: string): "image/png" | "image/jpeg" {
  return inputType === "image/png" || inputType === "image/webp" || inputType === "image/avif"
    ? "image/png"
    : "image/jpeg";
}

/** 실제로 나온 형식의 확장자. 브라우저가 요청한 형식 대신 PNG 로 돌려줄 수도 있다. */
export function extForEncoded(type: string): string {
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  return ".jpg";
}

/**
 * 올리기 좋은 크기로 줄인 파일. 브라우저에서만 쓴다.
 *
 * **못 줄이면 원본을 그대로 돌려준다.** 사진을 못 올리는 것보다 큰 걸 올리는 게 낫다 —
 * HEIC 처럼 브라우저가 못 읽는 형식, 캔버스가 막힌 환경이 실제로 있다.
 * 줄인 게 원본보다 크면(이미 잘 눌린 사진) 그것도 원본을 쓴다.
 */
export async function shrinkForUpload(file: File, maxEdge: number): Promise<File> {
  if (!file.type.startsWith("image/") || keepAsIs(file.type)) return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // 브라우저가 못 읽는 형식 — 서버로 그대로 보낸다.
  }

  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
    if (width === bitmap.width && height === bitmap.height && file.size < 900_000) {
      return file; // 이미 충분히 작다. 다시 눌러 봐야 화질만 깎인다.
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const want = outputTypeFor(file.type);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, want, want === "image/jpeg" ? QUALITY : undefined),
    );
    if (!blob || blob.size >= file.size) return file;

    // 형식·확장자는 **실제로 나온 것**으로 붙인다(요청한 것이 아니라).
    const type = blob.type || want;
    const name = file.name.replace(/\.[^.]+$/, "") + extForEncoded(type);
    return new File([blob], name, { type, lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
