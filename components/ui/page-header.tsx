"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useShell } from "@/components/shell-context";

export function PageHeader({
  emoji,
  title,
  description,
  children,
  className,
}: {
  emoji?: string;
  title: string;
  description?: string;
  /** 우측 액션 영역 (버튼 등) */
  children?: ReactNode;
  className?: string;
}) {
  // 폰 상단바가 이미 제목을 띄웠으면 여기서는 접는다 — 같은 말을 위아래로 두 번 하지 않는다.
  // 상단 메뉴에 없는 페이지(관리자 등)에서는 상단바가 브랜드를 띄우므로 제목이 그대로 남는다.
  const { titleInTopBar } = useShell();

  // 제목도 접히고 액션도 없으면 폰에서는 남길 게 없다.
  const emptyOnPhone = titleInTopBar && !children;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        titleInTopBar ? "mb-4 lg:mb-7" : "mb-7",
        emptyOnPhone && "hidden lg:flex",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3",
          titleInTopBar && "hidden lg:flex",
        )}
      >
        {emoji && (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-2xl shadow-sm ring-1 ring-line">
            {emoji}
          </span>
        )}
        <div>
          <h1 className="font-display text-[28px] font-bold leading-tight text-ink">
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 text-sm text-ink-soft">{description}</p>
          )}
        </div>
      </div>
      {children && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}
