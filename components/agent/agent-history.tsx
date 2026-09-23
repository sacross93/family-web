"use client";

// 지난 대화 목록. 별도 서랍이 아니라 같은 시트 안에서 화면만 바뀐다(스펙 §18.4) —
// 폰에서 층이 늘면 길을 잃는다. 뒤로가기도 여기 두지 않는다(헤더의 ☰ 가 토글이다).
//
// 언제 다시 부르는가: 마운트할 때 한 번. 이 목록은 시트가 기록을 보여줄 때만 살아 있으므로
// 그 "한 번"이 곧 "☰ 를 누를 때마다"다. 새 대화를 하고 다시 열었는데 옛날 목록이면
// 방금 한 이야기가 없어진 것처럼 보인다.

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

import { IconButton, Spinner, useConfirm } from "@/components/ui";
import { isToday, kDateShort, kTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { AgentChatState } from "./use-agent-chat";

const EMPTY = "아직 나눈 이야기가 없어요.";
/** 목록 자체를 못 받았을 때. 빈 목록으로 그리면 "대화가 없다"는 거짓말이 된다. */
const LIST_ERROR = "목록을 불러오지 못했어요.";
const UNTITLED = "제목 없는 대화";

interface ChatRow {
  id: string;
  title: string;
  /** JSON 을 건너오면서 ISO 문자열이 된다. */
  updatedAt: string;
  count: number;
}

function isChatRow(value: unknown): value is ChatRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && row.id.length > 0;
}

/**
 * 오늘 것은 시각으로, 어제 이전은 날짜로. 둘을 같이 쓰면 한 줄이 길어져 폰에서 개수가 밀려난다.
 */
function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return isToday(date) ? kTime(date) : kDateShort(date);
}

export function AgentHistory({
  state,
  onOpened,
}: {
  state: AgentChatState;
  /** 대화 하나를 열었다. 어느 화면으로 갈지는 시트가 정한다 — 목록은 그 규칙을 모른다. */
  onOpened: () => void;
}) {
  const { confirm, dialog } = useConfirm();
  const { chatId, load, reset } = state;
  // null = 아직 모른다(불러오는 중). 빈 배열 = 정말 없다.
  const [chats, setChats] = useState<ChatRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true; // ☰ 를 빠르게 두 번 누르면 응답보다 먼저 사라진다.
    void (async () => {
      try {
        const response = await fetch("/api/agent/chats");
        if (!response.ok) throw new Error("list failed");
        const body: unknown = await response.json();
        if (!alive) return;
        setChats(Array.isArray(body) ? body.filter(isChatRow) : []);
      } catch {
        if (!alive) return;
        setChats([]);
        setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const open = useCallback(
    async (id: string) => {
      if (openingId) return;
      setOpeningId(id);
      // load 는 실패해도 던지지 않고 state.error 에 문구를 남긴다(그 문구는 스레드가 보여준다).
      // 그래서 성패를 가리지 않고 대화 화면으로 넘어간다 — 여기 남으면 눌러도 아무 일이 없어 보인다.
      await load(id);
      onOpened();
    },
    [load, onOpened, openingId],
  );

  const remove = useCallback(
    async (id: string) => {
      const at = chats?.findIndex((chat) => chat.id === id) ?? -1;
      if (!chats || at < 0) return;
      // 휴지통이 여는 자리 바로 옆에 있다 — 잘못 누르면 나눈 이야기가 통째로 사라진다.
      // 말풍선은 되살릴 수 없으니 한 번 묻는다.
      const title = chats[at].title.trim() || UNTITLED;
      if (!(await confirm({ title: `"${title}" 대화를 지울까요?`, description: "주고받은 말이 모두 사라지고, 다시 볼 수 없어요." })))
        return;
      const removed = chats[at];
      // 먼저 지우고, 서버가 거절하면 되돌린다(이 저장소의 낙관적 업데이트 패턴).
      setChats((prev) => prev?.filter((chat) => chat.id !== id) ?? prev);

      let ok = false;
      try {
        const response = await fetch(`/api/agent/chats/${encodeURIComponent(id)}`, { method: "DELETE" });
        ok = response.ok;
      } catch {
        ok = false;
      }

      if (!ok) {
        // 지운 행 **하나만** 제자리로 되돌린다. 목록 전체를 클릭 시점 스냅샷으로 되돌리면
        // 그 사이 성공한 다른 삭제까지 화면에 되살아난다 — 서버에 없는 대화가 목록에 보인다.
        setChats((prev) => {
          if (!prev || prev.some((chat) => chat.id === id)) return prev;
          const where = Math.min(at, prev.length);
          return [...prev.slice(0, where), removed, ...prev.slice(where)];
        });
        return;
      }
      // 지금 보고 있던 대화를 지웠다면 화면도 새 대화로 비운다. 그대로 두면 다음에 보내는 말이
      // "그 대화를 찾지 못했어요"로 막힌다(지워진 chatId 로는 이어 쓸 수 없다).
      // 되돌릴 일이 없는 것이 확실해진 뒤에만 한다 — 말풍선은 되살릴 수 없다.
      if (id === chatId) reset();
    },
    [chatId, chats, reset, confirm],
  );

  if (chats === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (failed || chats.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-ink-soft">
        {failed ? LIST_ERROR : EMPTY}
      </div>
    );
  }

  return (
    <>
    <ul className="scrollbar-thin flex-1 space-y-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-2 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {chats.map((chat) => {
        const title = chat.title.trim() || UNTITLED;
        const current = chat.id === chatId;
        return (
          <li key={chat.id} className="group relative">
            <button
              type="button"
              onClick={() => void open(chat.id)}
              aria-current={current ? "true" : undefined}
              // 오른쪽은 지우기 단추 자리다. 겹치면 지우려다 대화가 열린다.
              className={cn(
                "flex w-full min-w-0 flex-col items-start gap-0.5 rounded-md py-2.5 pl-3.5 pr-12 text-left transition active:scale-[.99]",
                current ? "bg-sunken" : "hover:bg-sunken/60",
                openingId === chat.id && "opacity-60",
              )}
            >
              <span className="w-full truncate text-[0.9375rem] font-semibold text-ink">{title}</span>
              {/* 가운뎃점으로 잇지 않고 간격으로 가른다(DESIGN.md §3 — 메타 줄 `A · B` 금지). */}
              <span className="flex gap-x-2 text-xs text-ink-faint">
                <span>{when(chat.updatedAt)}</span>
                <span>메시지 {chat.count}개</span>
              </span>
            </button>
            {/* 폰에는 hover 가 없다 — 항상 보이게 두고 데스크톱에서만 숨긴다(AGENTS.md). */}
            <IconButton
              type="button"
              size="sm"
              variant="danger"
              aria-label={`${title} 지우기`}
              onClick={() => void remove(chat.id)}
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
            >
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </li>
        );
      })}
    </ul>
    {dialog}
    </>
  );
}
