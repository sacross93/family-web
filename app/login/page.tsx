import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { getSiteConfig } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteConfig();
  return { title: `로그인 · ${site.siteName}` };
}

export default async function LoginPage() {
  const site = await getSiteConfig();
  return (
    /* 집의 대문. 사이트 안쪽은 '틀만 진하게' 지만 여기는 화면 전체가 틀이다 —
       가족이 올린 사진도 스티커도 없는 유일한 화면이라, 어두워도 망가질 것이 없고
       들어가기 전과 후가 분명히 갈린다. 상태바 색(layout.tsx themeColor)과도 이어진다. */
    <div className="on-chrome flex min-h-dvh items-center justify-center bg-chrome px-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-2 text-center">
          <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md bg-white/90 text-3xl">
            {site.brandImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={site.brandImageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              site.brandEmoji
            )}
          </span>
          <h1 className="font-display text-4xl font-bold text-chrome-ink">{site.siteName}</h1>
          <p className="text-sm text-chrome-faint">{site.tagline}</p>
        </div>
        <div className="rounded-xl bg-surface p-6 shadow-lg">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-5 text-center text-xs text-chrome-faint">
          가족만 들어올 수 있어요 🔐
        </p>
      </div>
    </div>
  );
}
