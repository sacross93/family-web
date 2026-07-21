import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Fredoka } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/current-user";

const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "45 920",
});

const fredoka = Fredoka({
  subsets: ["latin"],
  variable: "--font-fredoka",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "포동 · 우리 가족 공간",
  description: "사진, 계획, 캘린더, 할일을 함께 나누는 우리 가족만의 공간 🏡",
};

export const viewport: Viewport = {
  themeColor: "#fbfaf7",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  return (
    <html
      lang="ko"
      className={`${pretendard.variable} ${fredoka.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <AppShell user={user}>{children}</AppShell>
      </body>
    </html>
  );
}
