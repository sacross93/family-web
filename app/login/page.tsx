import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "로그인 · 포동" };

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-lavender-soft via-paper to-peach-soft px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-surface text-3xl shadow-md">
            🏡
          </span>
          <h1 className="font-display text-3xl font-bold text-ink">포동</h1>
          <p className="text-sm text-ink-soft">우리 가족만의 작은 공간</p>
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
