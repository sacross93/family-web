import type { Metadata, Viewport } from "next";
import { Fredoka } from "next/font/google";
import "./pretendard.css";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/current-user";
import { getSiteConfig, getNav } from "@/lib/site";
import { agentConfig } from "@/lib/agent/config";

// Pretendard 는 `app/pretendard.css` 의 구간별 @font-face 로 불러온다 —
// next/font/local 은 한 파일만 받을 수 있어 2.0MB 를 통째로 내려받게 된다.
// 이름은 globals.css 의 --font-pretendard 가 가리킨다.

const fredoka = Fredoka({
  subsets: ["latin"],
  variable: "--font-fredoka",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteConfig();
  return {
    title: `${site.siteName} · ${site.tagline}`,
    description: `사진, 계획, 캘린더, 할일을 함께 나누는 ${site.siteName} 가족만의 공간 🏡`,
  };
}

export const viewport: Viewport = {
  themeColor: "#fbfaf7",
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
      className={`${fredoka.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <AppShell user={user} site={site} nav={nav} agentEnabled={agentConfig().enabled}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
