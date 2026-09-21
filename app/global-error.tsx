"use client";

import "./globals.css";

/**
 * 레이아웃 자체가 실패했을 때의 마지막 화면.
 *
 * `app/error.tsx` 는 레이아웃 **안에서** 그려지므로 레이아웃이 터지면 못 잡는다.
 * 이 파일은 레이아웃을 통째로 대신하므로 `<html>`·`<body>` 와 스타일을 스스로 들고 온다.
 *
 * 여기까지 온다는 건 셸도 못 그린다는 뜻이라 탭바가 없다 — 그래서 홈으로 가는 길을 준다.
 * 글꼴 변수(next/font)도 없으므로 기본 글꼴로 그려진다. 그래도 한국어로 말한다.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="ko">
      <body className="flex min-h-dvh items-center justify-center bg-paper px-6">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <span className="text-4xl">🫖</span>
          <h1 className="text-xl font-bold text-ink">포동을 열지 못했어요</h1>
          <p className="text-[0.9375rem] text-ink-soft">
            다시 불러오면 대개 괜찮아져요. 계속 이러면 조금 있다 다시 와 주세요.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => unstable_retry()}
              className="flex h-11 items-center rounded-full bg-primary px-5 font-semibold text-ink"
            >
              다시 불러오기
            </button>
            {/* 여기서는 next/link 가 아니라 <a> 가 맞다 — 앱 셸 자체가 실패한 상황이라
                클라이언트 라우터를 믿을 수 없다. 페이지를 통째로 새로 받아야 한다. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="flex h-11 items-center rounded-full bg-sunken px-5 font-semibold text-ink-soft"
            >
              처음으로
            </a>
          </div>
          {error.digest && (
            <p className="text-xs text-ink-faint">오류 번호 {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}
