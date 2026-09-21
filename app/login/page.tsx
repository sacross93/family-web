import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { getSiteConfig } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  // 이름만 준다 — 뒤의 ` · 포동` 은 루트 레이아웃의 `title.template` 이 붙인다.
  // 여기서 사이트 이름까지 적으면 "로그인 · 포동 · 포동" 이 된다.
  return { title: "로그인" };
}

export default async function LoginPage() {
  const site = await getSiteConfig();
  return (
    /* 집의 대문. 사이트 안쪽은 틀에만 색이 있지만 여기는 화면 전체가 틀이다 —
       가족이 올린 사진도 스티커도 없는 유일한 화면이라, 연한 로즈 한 장으로 두어도
       들어가기 전과 후가 분명히 갈린다. 상태바 색(layout.tsx themeColor)과도 이어진다.
       바탕이 밝아진 뒤로 흰 카드가 바탕에 녹아 보여서 테두리 한 겹을 줬다. */
    <div className="on-chrome flex min-h-dvh items-center justify-center bg-chrome px-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-2 text-center">
          <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-white text-3xl">
            {site.brandImageUrl ? (
              <img src={site.brandImageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              site.brandEmoji
            )}
          </span>
          <h1 className="font-display text-4xl font-bold text-chrome-ink">{site.siteName}</h1>
          <p className="text-sm text-chrome-faint">{site.tagline}</p>
        </div>
        <div className="rounded-xl border border-line-strong bg-surface p-6 shadow-lg">
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
