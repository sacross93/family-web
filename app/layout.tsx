import type { Metadata, Viewport } from "next";
import { Jua } from "next/font/google";
import "./pretendard.css";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/current-user";
import { getSiteConfig, getNav } from "@/lib/site";
import { agentConfig } from "@/lib/agent/config";

// Pretendard(본문)는 `app/pretendard.css` 의 구간별 @font-face 로 불러온다 —
// next/font/local 은 한 파일만 받을 수 있어 2.0MB 를 통째로 내려받게 된다.
//
// 제목은 **주아**(둥글고 도톰한 한글). 이 사이트는 아기를 기다리는 집이고,
// 가족이 바란 결이 "아기자기한 핑크 파스텔" 이다. 굵기가 하나뿐이라 큰 제목에만 쓴다 —
// 본문·목록의 작은 글자는 Pretendard 그대로다(`.font-num` 도 마찬가지).
//
// `preload: false` 인 이유: next/font 는 요청한 subset 의 파일을 전부 미리 받게 거는데,
// 한글 글꼴은 구간(unicode-range)이 100개쯤이라 첫 화면에서 1MB 넘게 받는다.
// 미리 받기만 끄면 브라우저가 **그 화면에 쓰인 글자가 든 구간만** 받는다(실측 1,441KB → 89KB).
const display = Jua({
  subsets: ["latin"],
  variable: "--font-display-face",
  weight: "400",
  display: "swap",
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
  // 폰 상태바 색 = 상단바 색. globals.css 의 `--color-chrome`(연한 로즈)을 **손으로 베낀
  // 값**이다 — Viewport 는 CSS 변수를 못 읽는다. 틀 색을 바꾸면 여기도 같이 고칠 것
  // (이 줄이 옛 진한 자두 `#362c4e` 로 남아 있어서 폰 상태바만 혼자 진했다).
  themeColor: "#fad9e6",
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
      className={`${display.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <AppShell user={user} site={site} nav={nav} agentEnabled={agentConfig().enabled}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
