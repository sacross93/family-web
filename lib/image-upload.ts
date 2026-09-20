// 올리기 전에 브라우저에서 사진을 줄인다.
//
// 왜: 배포본 홈이 한 번 열릴 때마다 **2.2MB 짜리 스티커 사진 한 장**을 받고 있었다.
// 화면에서는 150px 로 그려지는 꾸미기 사진이다. 폰 카메라 원본은 대개 4000px·3~5MB 라,
// 아무것도 안 하면 앨범 한 장 올릴 때마다 그만큼이 저장되고 볼 때마다 그만큼을 받는다.
//
// 왜 브라우저에서: 사진이 이미 거기 있고, `sharp` 같은 의존성이 늘지 않고,
// 저장소(개발=public/uploads, 운영=Blob)를 되읽는 갈래를 만들지 않아도 된다.
// (`components/agent/image-attach.ts` 가 모델에게 보낼 사본에 쓰는 것과 같은 방식이다.)

/** 쓰임새별 긴 변 상한. 쓰는 쪽에서 고른다 — 추억과 장식은 다른 잣대다. */
export const MAX_EDGE = {
  /** 앨범 사진·글 속 사진. 추억이라 넉넉히 남긴다(폰 화면의 4배 이상). */
  photo: 2000,
  /** 브랜드·홈 큰 그림. 화면에서 최대 200px 남짓이다. */
  brand: 800,
  /** 꾸미기 스티커. 화면에서 최대 300px 이다. */
  sticker: 600,
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

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}

/** 여러 장. 한 장이 실패해도 나머지는 줄여서 올린다. */
export async function shrinkAllForUpload(files: File[], maxEdge: number): Promise<File[]> {
  return Promise.all(files.map((f) => shrinkForUpload(f, maxEdge).catch(() => f)));
}
