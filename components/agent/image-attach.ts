// 모델에게 보여줄 사본을 만든다. 원본은 건드리지 않는다 — 그건 /api/upload 로 따로 올라간다.
//
// 축소를 브라우저에서 하는 이유: 사진이 이미 여기 있고, `sharp` 같은 의존성이 늘지 않으며,
// 서버가 저장소에서 파일을 되읽을 필요도 없다(개발은 `public/uploads` 상대경로, 운영은 Blob
// 절대주소라 서버에서 되읽는 길이 두 갈래로 갈린다 — 그 갈래를 아예 만들지 않는다).

/**
 * 긴 변 상한. 이 크기면 "발리 해변 사진"인지 "영수증"인지 구분하기에 충분하고,
 * 폰 원본(약 4000px)을 그대로 보낼 때보다 토큰이 한 자릿수 배 적다.
 */
const MAX_EDGE = 768;

/** JPEG 품질. 0.75 아래로 내리면 글자가 섞인 사진에서 읽기가 나빠진다. */
const QUALITY = 0.75;

/** 긴 변이 MAX_EDGE 를 넘지 않도록 줄인 크기. 원본이 이미 작으면 그대로 둔다(늘리지 않는다). */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height };
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/** 사진 파일 → 모델에게 보낼 축소본 data URL. 브라우저에서만 쓴다. */
export async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("캔버스를 쓸 수 없어요.");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", QUALITY);
  } finally {
    bitmap.close();
  }
}
