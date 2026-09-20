"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DecorationSurface } from "@/components/decoration-surface";

/**
 * 전역 페이지 꾸미기 (관리자). 페이지 경로별로 스티커를 관리.
 *
 * 편집 상태는 여기가 아니라 `AppShell` 이 쥔다 — 토글 버튼이 상단바·사이드바·드로어에
 * 흩어져 있고 이 레이어는 main 안에 있어서, 공통 부모만이 한 벌로 움직일 수 있다.
 */
export function Decorations({
  isAdmin,
  editing,
  onEditingChange,
  children,
}: {
  isAdmin: boolean;
  editing: boolean;
  onEditingChange: (b: boolean) => void;
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <DecorationSurface
      variant="page"
      surfaceKey={pathname}
      canEdit={isAdmin}
      editing={isAdmin && editing}
      onEditingChange={onEditingChange}
    >
      {children}
    </DecorationSurface>
  );
}
