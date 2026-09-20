import type { Metadata, Viewport } from "next";
import { Gowun_Batang } from "next/font/google";
import "./pretendard.css";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/current-user";
import { getSiteConfig, getNav } from "@/lib/site";
import { agentConfig } from "@/lib/agent/config";

// Pretendard(본문)는 `app/pretendard.css` 의 구간별 @font-face 로 불러온다 —
// next/font/local 은 한 파일만 받을 수 있어 2.0MB 를 통째로 내려받게 된다.
//
// 제목은 **고운바탕**(한글 명조). 여기엔 아기에게 쓰는 편지가 있고, 편지는 명조로 쓴다.
// 한글 글꼴은 통째로 받으면 몇 MB 라서, 구글이 쪼개 둔 구간(unicode-range)을
// next/font 가 그대로 가져온다 — 쓰는 글자가 든 구간만 내려온다.
// 바뀌면 `npm run build` 뒤 .next/static/media 의 gowun 파일 개수를 세어 확인할 것
// (한 덩어리로 합쳐지면 몇 MB 를 통째로 받게 된다).
const gowun = Gowun_Batang({
  subsets: ["latin"],
  variable: "--font-gowun",
  weight: ["400", "700"],
  display: "swap",
  // **미리 받지 않는다.** next/font 는 요청한 subset 의 파일을 전부 `<link rel=preload>`
  // 로 걸어 두는데, 한글 글꼴은 구간이 100개쯤이라 **94개 1,441KB 를 첫 화면에서
  // 통째로 받고 있었다**(배포본 실측). 구간(unicode-range)은 그대로 남으므로,
  // 미리 받기만 끄면 브라우저가 **그 화면에 실제로 쓰인 글자가 든 구간만** 받는다.
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteConfig();
  return {
    title: `${site.siteName} · ${site.tagline}`,
    description: `사진, 계획, 캘린더, 할일을 함께 나누는 ${site.siteName} 가족만의 공간 🏡`,
  };
}

export const viewport: Viewport = {
  // 폰 상태바 색. 상단바가 진해졌으니 거기에 맞춘다(globals.css --color-chrome).
  themeColor: "#362c4e",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [user, site, nav] = await Promise.all([
    getCurrentUser(),
    getSiteConfig(),
    getNav(),
  ]);
  return (
    <html
      lang="ko"
      className={`${gowun.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <AppShell user={user} site={site} nav={nav} agentEnabled={agentConfig().enabled}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
