"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./card";

/**
 * 제목을 눌러 접었다 펴는 카드.
 *
 * 긴 폼을 한 화면에 다 펼쳐 두면 필요 없는 것까지 지나쳐야 한다 —
 * 관리자 화면의 "메뉴 편집" 은 아홉 항목 × 세 칸 = 스물일곱 개 입력칸이
 * 늘 펼쳐져 있어 폰에서 두 화면이었다. 대개 한 항목만 고치러 온다.
 *
 * 머리글은 폰에서 44px 이상이어야 한다(DESIGN.md §9) — `min-h-11`.
 * 데스크톱에서는 넓으니 늘 펼쳐 두고 싶으면 `alwaysOpenOnDesktop` 을 쓴다.
 */
export function CollapsibleCard({
  emoji,
  emojiClassName,
  title,
  summary,
  defaultOpen = false,
  className,
  children,
}: {
  emoji: string;
  /** 이모지 타일 배경. 팔레트 클래스를 그대로 받는다(동적 조합 금지). */
  emojiClassName?: string;
  title: string;
  /** 접혀 있을 때 오른쪽에 보이는 한 줄 — 열지 않고도 상태를 알 수 있게. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className={cn("flex flex-col gap-4", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 items-center gap-2.5 text-left lg:min-h-0"
      >
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg",
            emojiClassName ?? "bg-sunken"
          )}
        >
          {emoji}
        </span>
        <h2 className="text-base font-bold text-ink">{title}</h2>
        {summary && (
          <span className="ml-auto truncate text-xs text-ink-faint">{summary}</span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-ink-faint transition",
            !summary && "ml-auto",
            open && "rotate-180"
          )}
        />
      </button>
      {open && children}
    </Card>
  );
}
