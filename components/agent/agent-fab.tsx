"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { AgentSheet } from "./agent-sheet";

/**
 * 우하단 "물어보기". 꾸미기 버튼이 있으면 그 위에, 없으면 맨 아래에 앉는다.
 *
 * 꾸미기가 뜨는 조건은 "상단 메뉴 페이지" 만이 아니라 "상단 메뉴 페이지 + 관리자" 다
 * (decoration-surface 의 `{canEdit && …}`). 그 판정은 AppShell 이 이미 쥐고 있으므로
 * 여기서 경로를 다시 따지지 않고 prop 으로 받는다.
 *
 * z-40 인 이유: 꾸미기 FAB·모바일 드로어·대화 시트가 z-50 이라 그 위로 겹치면 안 된다.
 */
export function AgentFab({ hasDecorationFab }: { hasDecorationFab: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="포동이에게 물어보기"
          className={cn(
            "fixed right-5 z-40 flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-3 font-semibold text-ink shadow-lg transition hover:bg-sunken active:scale-95",
            hasDecorationFab ? "bottom-20" : "bottom-5"
          )}
        >
          <MessageCircle className="h-4 w-4 text-primary" /> 물어보기
        </button>
      )}
      {/* 조건 없이 렌더한다 — 감싸면 닫을 때마다 대화 훅이 사라져 하던 이야기가 날아간다.
          시트는 스스로 !open 이면 null 을 돌려준다. */}
      <AgentSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
