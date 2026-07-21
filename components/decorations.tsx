"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DecorationSurface } from "@/components/decoration-surface";

/** 전역 페이지 꾸미기 (관리자). 페이지 경로별로 스티커를 관리. */
export function Decorations({
  isAdmin,
  children,
}: {
  isAdmin: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <DecorationSurface variant="page" surfaceKey={pathname} canEdit={isAdmin}>
      {children}
    </DecorationSurface>
  );
}
