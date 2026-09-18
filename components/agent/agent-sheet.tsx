"use client";

// 대화창. 폰에서는 아래에서 올라오는 시트, 데스크톱에서는 우하단 카드.
// components/ui/modal.tsx 의 뼈대(포털·Escape·스크롤 잠금)를 따르되 Modal 을 쓰지는 않는다 —
// 이 창은 높이·헤더·하단 입력이 달라서 억지로 맞추면 둘 다 나빠진다.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { ArrowUp, Menu, Plus, Square, X } from "lucide-react";

import { IconButton, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import { AgentThread } from "./agent-thread";
import { useAgentChat } from "./use-agent-chat";

/** 입력창이 자라는 한계(약 4줄). 더 길어지면 안에서 스크롤된다. */
const MAX_INPUT_HEIGHT = 120;

/** 포털은 서버 렌더에서 쓸 수 없다. "브라우저에 붙었는가"를 setState 없이 묻는 방법. */
const NEVER_CHANGES = () => () => {};

/** 폰인가 — 뒤 배경과 스크롤 잠금은 폰에서만이다(데스크톱은 사이트를 보면서 대화한다). */
function isPhone(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
}

export function AgentSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  // 닫아도 훅은 살아 있다 — 다시 열면 하던 이야기가 그대로 이어진다.
  const state = useAgentChat();
  const mounted = useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
  const [view, setView] = useState<"chat" | "history">("chat");
  const [draft, setDraft] = useState("");
  // 되돌린 것은 시트가 기억한다. 스레드에 두면 창을 닫거나 기록을 열었다 오는 순간 잊어버려
  // 같은 카드에 되돌리기가 되살아난다(두 번 누르면 이미 지운 것을 또 지우게 된다).
  const [undone, setUndone] = useState<Record<string, boolean>>({});
  // Textarea 는 ref 를 받지 않는 공용 컴포넌트다 — 감싼 상자에서 찾아 쓴다(공용 컴포넌트를 건드리지 않으려고).
  const boxRef = useRef<HTMLDivElement>(null);
  const input = useCallback(() => boxRef.current?.querySelector("textarea") ?? null, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    // 폰에서만 뒤를 잠근다. 데스크톱에서 잠그면 사이트를 못 보게 되어 이 창의 취지와 어긋난다.
    const phone = isPhone();
    if (phone) document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      if (phone) document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // 열릴 때 커서를 둔다. 폰에서는 두지 않는다 — 키보드가 올라오면 예시 칩이 가려진다.
  useEffect(() => {
    if (!open || view !== "chat" || isPhone()) return;
    const timer = window.setTimeout(() => input()?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [input, open, view]);

  /** 한 줄에서 시작해 내용만큼 자란다. */
  const grow = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, []);

  const ask = useCallback(
    (text: string) => {
      const message = text.trim();
      if (!message || state.running) return;
      setView("chat");
      void state.send(message);
    },
    [state],
  );

  const submit = useCallback(() => {
    if (!draft.trim() || state.running) return;
    const message = draft;
    setDraft("");
    // 값이 비면 높이도 한 줄로 돌아가야 한다(값보다 늦게 반영되므로 다음 프레임에).
    window.requestAnimationFrame(() => grow(input()));
    ask(message);
  }, [ask, draft, grow, input, state.running]);

  const onInputKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      // 한글 조합 중의 Enter 는 글자를 완성하는 키다. 여기서 보내면 마지막 글자가 잘린다.
      if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
      e.preventDefault();
      submit();
    },
    [submit],
  );

  const markUndone = useCallback((key: string) => {
    setUndone((prev) => ({ ...prev, [key]: true }));
  }, []);

  // 폰에서만 닫는다 — 데스크톱 시트는 옆에 붙어 있어서 도착한 페이지를 가리지 않는다.
  const leaveFor = useCallback(() => {
    if (isPhone()) onClose();
  }, [onClose]);

  const newChat = useCallback(() => {
    state.reset();
    setDraft("");
    setView("chat");
    window.requestAnimationFrame(() => grow(input()));
  }, [grow, input, state]);

  if (!mounted || !open) return null;

  const history = view === "history";

  return createPortal(
    <>
      {/* 폰에서만 뒤를 덮는다. 탭하면 닫힘. */}
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="fixed inset-0 z-50 bg-ink/35 backdrop-blur-sm sm:hidden"
      />
      <div
        role="dialog"
        aria-label="포동이에게 물어보기"
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-lg",
          "animate-[fade-up_.28s_cubic-bezier(.16,1,.3,1)]",
          "sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[70vh] sm:w-[380px] sm:rounded-3xl",
        )}
      >
        <div className="flex items-center gap-1 border-b border-line px-3 py-2.5">
          <span className="ml-1 flex h-9 w-9 items-center justify-center rounded-xl bg-sunken text-lg" aria-hidden="true">
            🌱
          </span>
          <h2 className="ml-1 flex-1 truncate text-base font-bold text-ink">포동이</h2>
          <IconButton type="button" aria-label="새 대화" onClick={newChat}>
            <Plus className="h-5 w-5" />
          </IconButton>
          <IconButton
            type="button"
            aria-label={history ? "대화로 돌아가기" : "지난 대화"}
            onClick={() => setView(history ? "chat" : "history")}
            className={history ? "bg-sunken text-ink" : undefined}
          >
            <Menu className="h-5 w-5" />
          </IconButton>
          <IconButton type="button" aria-label="닫기" onClick={onClose}>
            <X className="h-5 w-5" />
          </IconButton>
        </div>

        {/* 기록도 같은 시트 안에서 바뀐다 — 서랍을 또 열면 폰에서 길을 잃는다. */}
        {history ? (
          // TODO(Task 7): <AgentHistory state={state} onOpened={() => setView("chat")} /> 로 바뀐다.
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-ink-soft">
            지난 대화 목록은 곧 여기에 담겨요.
          </div>
        ) : (
          <AgentThread
            state={state}
            onSuggest={ask}
            undone={undone}
            onUndone={markUndone}
            onNavigate={leaveFor}
          />
        )}

        {!history && (
          <div className="border-t border-line px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div ref={boxRef} className="flex items-end gap-2">
              <Textarea
                rows={1}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  grow(e.currentTarget);
                }}
                onKeyDown={onInputKeyDown}
                placeholder="무엇이든 말해보세요"
                aria-label="포동이에게 보낼 말"
                className="min-h-11 max-h-[120px] flex-1 rounded-3xl py-2.5"
              />
              {state.running ? (
                <IconButton
                  type="button"
                  variant="soft"
                  aria-label="그만"
                  onClick={state.stop}
                  className="shrink-0"
                >
                  <Square className="h-4 w-4 fill-current" />
                </IconButton>
              ) : (
                <IconButton
                  type="button"
                  aria-label="보내기"
                  disabled={!draft.trim()}
                  onClick={submit}
                  className="shrink-0 bg-primary text-white hover:bg-primary-hover hover:text-white"
                >
                  <ArrowUp className="h-5 w-5" />
                </IconButton>
              )}
            </div>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
