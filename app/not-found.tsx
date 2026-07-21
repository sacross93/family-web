import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
      <div className="text-7xl">🧦</div>
      <div>
        <p className="font-display text-3xl font-bold text-ink">여기엔 아무것도 없어요</p>
        <p className="mt-2 text-ink-soft">
          찾으시는 페이지가 사라졌거나 주소가 바뀌었어요.
        </p>
      </div>
      <Button href="/">🏠 홈으로 가기</Button>
    </div>
  );
}
