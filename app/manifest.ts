import type { MetadataRoute } from "next";
import { getSiteConfig } from "@/lib/site";

// 사이트 이름을 DB 에서 읽으므로 캐시하지 않는다(매니페스트는 기본이 정적 라우트다).
export const dynamic = "force-dynamic";

/**
 * 홈 화면에 추가했을 때 쓰이는 정보.
 *
 * 없으면 폰이 알아서 짐작한다 — 이름은 주소나 `<title>` 에서 대충 가져오고, 브라우저
 * 주소창이 그대로 남는다. 가족이 매일 폰에서 여는 사이트라 이 한 파일이 꽤 크게 다르다.
 *
 * 이름은 `SiteConfig` 에서 가져온다. 가족이 `/admin` 에서 사이트 이름을 바꾸면
 * 홈 화면 아이콘 밑의 글자도 같이 바뀐다 — 여기 손으로 적어 두면 거기서부터 갈라진다.
 *
 * 색 두 개는 `app/globals.css` 의 토큰을 **손으로 베낀 값**이다(매니페스트는 CSS 변수를
 * 못 읽는다. `layout.tsx` 의 `themeColor` 와 같은 사정). `lib/design-doc.test.ts` 가
 * 셋이 어긋나지 않는지 본다.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const site = await getSiteConfig();
  return {
    name: `${site.siteName} · ${site.tagline}`,
    short_name: site.siteName,
    description: `사진, 계획, 캘린더, 할일을 함께 나누는 ${site.siteName} 가족만의 공간 🏡`,
    lang: "ko",
    start_url: "/",
    scope: "/",
    // 주소창 없이 앱처럼 열린다. 가족만 쓰는 사이트라 주소를 보여 줄 이유가 없다.
    display: "standalone",
    background_color: "#ffffff", // --color-paper (바탕은 흰색이다)
    theme_color: "#f6cedd", // --color-chrome
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // 같은 그림을 `maskable` 로도 올린다 — 집이 가운데 62%×56% 안이라 안쪽 80% 원에
      // 안 잘린다. (규격은 `"any maskable"` 한 줄도 되지만 Next 의 타입이 하나만 받는다.)
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
