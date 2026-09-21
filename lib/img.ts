// 큰 사진을 화면 크기에 맞게 줄여서 보낸다.
//
// 왜 필요했나: 홈 히어로에 붙인 스티커 한 장이 **2,208KB** 였다(운영에서 폰 폭으로 실측).
// 홈에서 받는 이미지가 그것 하나뿐인데, 폰으로 홈을 열 때마다 2.2MB 를 내려받았다.
// 원본은 그대로 두고 **화면에는 줄인 것**을 보낸다 — 가족이 고른 방향이다.
//
// 왜 `next/image` 컴포넌트가 아닌가: 스티커는 드래그로 위치·크기를 잡는 물건이라
// DB 에 **가로 px 만** 있고 세로는 사진의 비율을 따른다. `next/image` 는 width+height 를
// 요구하고(`fill` 은 부모에 높이가 있어야 한다), 감싸는 요소가 하나 더 생겨 드래그 좌표
// 계산이 어긋난다. 그래서 `<img>` 는 그대로 두고 **주소만** 최적화 주소로 바꾼다.

/**
 * 최적화가 받아 주는 가로 크기. **`next.config.ts` 가 이 값을 그대로 가져다 쓴다** —
 * 여기에 없는 `w` 로 부르면 최적화가 400 을 준다. 두 곳이 어긋나지 않게 한 곳에 둔다.
 */
export const IMAGE_WIDTHS = [96, 128, 256, 384, 640, 750, 828, 1080, 1200] as const;

/** 우리 사진이 있는 곳. 여기 없는 주소는 최적화가 거절한다(남의 서버를 대신 퍼 나르지 않게). */
export const IMAGE_HOSTS = ["**.public.blob.vercel-storage.com"] as const;

const QUALITY = 75;

/** 요청한 크기 이상에서 가장 작은 것. 더 큰 것이 없으면 제일 큰 것. */
export function pickWidth(want: number): number {
  return IMAGE_WIDTHS.find((w) => w >= want) ?? IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1];
}

/** 최적화를 태울 수 있는 주소인가. 우리 저장소의 사진만 태운다. */
export function canOptimize(url: string): boolean {
  if (!url) return false;
  // 로컬 업로드(`/uploads/…`)는 같은 출처라 그대로 된다. `//` 로 시작하는 것은 남의 서버다.
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false; // data: URL, 빈 값, 이상한 글자
  }
}

/**
 * 화면에 뜰 가로 크기(CSS px)를 주면 그 크기에 맞게 줄여 주는 주소를 돌려준다.
 *
 * **못 태우는 주소는 있는 그대로 돌려준다.** 줄이려다 사진이 안 뜨는 쪽이 훨씬 나쁘다.
 */
export function sized(url: string, cssWidth: number, dpr = 1): string {
  if (!canOptimize(url)) return url;
  const w = pickWidth(Math.max(1, Math.round(cssWidth * dpr)));
  return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=${QUALITY}`;
}

/**
 * 1배·2배 두 벌. 고해상도 화면은 2배를 받고 보통 화면은 1배만 받는다 —
 * 무조건 2배를 보내면 줄인 보람이 절반으로 준다.
 */
export function sizedSrcSet(url: string, cssWidth: number): string | undefined {
  if (!canOptimize(url)) return undefined;
  return `${sized(url, cssWidth, 1)} 1x, ${sized(url, cssWidth, 2)} 2x`;
}
