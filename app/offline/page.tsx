import { WifiOff } from "lucide-react";
import { Button, Card } from "@/components/ui";

export const metadata = { title: "연결 없음" };

/**
 * 연결이 끊긴 채로 화면을 열었을 때 보이는 자리.
 *
 * 홈 화면에 추가해 앱처럼 열면 주소창이 없다 — 브라우저 기본 오류 화면이 뜨면
 * 가족은 **무엇이 잘못됐는지도, 어디로 갈지도** 알 수 없다. 서비스 워커가
 * 길 잃은 이동을 여기로 돌린다(`public/sw.js`).
 *
 * 이 화면은 **미리 받아 둔 사본**이라 서버가 없어도 보인다. 그래서 여기엔
 * 가족 데이터를 두지 않는다 — 오래된 내용을 최신인 척 보여 주게 된다.
 */
export default function OfflinePage() {
  return (
    <Card className="mx-auto flex max-w-md flex-col items-center gap-4 py-12 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-md bg-sunken text-ink-soft">
        <WifiOff className="h-7 w-7" />
      </span>
      <div>
        <h1 className="font-display text-xl font-bold text-ink">연결이 없어요</h1>
        {/* 사과하지 않고 방법을 알려준다(DESIGN.md §8). */}
        <p className="mt-1.5 text-[0.9375rem] text-ink-soft">
          잠깐 끊긴 것 같아요. 연결되면 다시 불러올게요.
        </p>
      </div>
      {/* 서버가 없으므로 링크가 아니라 **다시 시도**다. */}
      <Button href="/">🏠 다시 열어보기</Button>
    </Card>
  );
}
