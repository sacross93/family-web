"use client"; // 오류 경계는 클라이언트 컴포넌트여야 한다

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button, Card } from "@/components/ui";

/**
 * 서버에서 무언가 잘못됐을 때 가족이 보는 화면.
 *
 * 이게 없으면 Next 의 기본 화면이 뜬다 —
 * "This page couldn't load. A server error occurred. ERROR 2859280536".
 * 영어인 데다 **셸이 통째로 사라져** 다른 곳으로 갈 수도 없다.
 * 무료 티어 데이터베이스가 잠들었다 못 깨는 일은 실제로 일어난다.
 *
 * `app/error.tsx` 는 `app/layout.tsx` **안에서** 그려지므로 상단바·탭바가 그대로 남는다 —
 * 가족은 여기서 다시 시도하거나 다른 페이지로 갈 수 있다.
 * (레이아웃 자체가 실패하는 경우는 `app/global-error.tsx`.)
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  // 브라우저가 아는 연결 상태. 서버가 없어도 이건 읽을 수 있다.
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const read = () => setOffline(!navigator.onLine);
    read();
    addEventListener("online", read);
    addEventListener("offline", read);
    return () => {
      removeEventListener("online", read);
      removeEventListener("offline", read);
    };
  }, []);

  return (
    <Card className="flex flex-col items-center gap-4 py-12 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-md bg-sunken text-3xl">
        🫖
      </span>
      <div>
        <h1 className="font-display text-xl font-bold text-ink">
          {offline ? "연결이 없어요" : "잠시 문제가 있었어요"}
        </h1>
        {/* 사과하지 않고 방법을 알려준다(DESIGN.md §8). 원인은 가족이 알 바가 아니다.
            연결이 끊긴 것과 서버가 탈 난 것은 **할 말이 다르다** — 연결이 없는데
            "다시 불러오면 괜찮아져요" 라고 하면 눌러도 안 되니 거짓말이 된다. */}
        <p className="mt-1.5 text-[0.9375rem] text-ink-soft">
          {offline
            ? "연결되면 바로 다시 불러올게요."
            : "다시 불러오면 대개 괜찮아져요. 계속 이러면 조금 있다 다시 와 주세요."}
        </p>
      </div>
      <Button onClick={() => unstable_retry()}>
        <RefreshCw className="h-4 w-4" /> 다시 불러오기
      </Button>
      {/* 무엇이 있었는지 찾아볼 실마리. 작게, 눈에 걸리지 않게. */}
      {error.digest && (
        <p className="font-num text-xs text-ink-faint">오류 번호 {error.digest}</p>
      )}
    </Card>
  );
}
