import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 아직 아무것도 없는 자리.
 *
 * 점선 테두리는 장식이 아니라 **"여기에 무언가 들어온다"** 는 뜻이다(DESIGN §1 "구조가 정보다").
 * 그래서 남긴다. 다만 회색 타일에 이모지를 앉혀 두면 **덜 만든 화면**처럼 보여서 뗐다 —
 * 이모지 하나면 충분하다. 높이도 줄였다(280px → 200px 남짓): 없는 것이 있는 것보다
 * 자리를 더 차지하면 안 된다.
 */
export function EmptyState({
  emoji = "🌱",
  title,
  description,
  action,
  className,
}: {
  emoji?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line-strong px-6 py-10 text-center",
        className
      )}
    >
      <span className="text-4xl" aria-hidden>
        {emoji}
      </span>
      <div>
        <p className="font-display text-xl font-bold text-ink">{title}</p>
        {description && (
          <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-ink-soft">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
