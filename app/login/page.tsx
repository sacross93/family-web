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
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-lavender-soft via-paper to-peach-soft px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-3xl bg-surface text-3xl shadow-md">
            {site.brandImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={site.brandImageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              site.brandEmoji
            )}
          </span>
          <h1 className="font-display text-3xl font-bold text-ink">{site.siteName}</h1>
          <p className="text-sm text-ink-soft">{site.tagline}</p>
        </div>
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-lg">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-4 text-center text-xs text-ink-faint">
          가족만 들어올 수 있어요 🔐
        </p>
      </div>
    </div>
  );
}
