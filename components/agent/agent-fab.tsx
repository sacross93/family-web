"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { AgentSheet } from "./agent-sheet";

/**
 * 우하단 "물어보기" — 화면에 떠 있는 유일한 버튼이다.
 * 꾸미기는 셸의 상단바/사이드바로 옮겼다. 떠다니는 게 둘이면 목록 한가운데를 가린다.
 *
 * 폰에서는 하단 탭바 위에 앉는다. 높이는 globals.css 의 `--bottom-bar` 한 곳에서 오고
 * 본문 아래 여백도 같은 값을 읽는다(lg 에서는 0 이라 자연히 맨 아래).
 *
 * z-40 인 이유: 모바일 드로어·대화 시트가 z-50 이라 그 위로 겹치면 안 된다.
 */
export function AgentFab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="포동이에게 물어보기"
          style={{ bottom: "calc(var(--bottom-bar) + 0.75rem)" }}
          className={cn(
            "fixed right-4 z-40 flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-3 font-semibold text-ink shadow-lg transition hover:bg-sunken active:scale-95 lg:right-5"
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
