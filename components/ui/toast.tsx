"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type Tone = "info" | "error";

interface Toast {
  id: number;
  text: string;
  tone: Tone;
}

interface ToastApi {
  /** 알려 주기. 되돌릴 수 없는 실패는 `tone: "error"`. */
  say: (text: string, tone?: Tone) => void;
}

const Ctx = createContext<ToastApi>({ say: () => {} });

/** 어디서나 한 줄 알림. `const { say } = useToast()`. */
export function useToast(): ToastApi {
  return useContext(Ctx);
}

const LIFETIME = 4500;

/**
 * 짧은 알림을 화면 아래에 띄운다.
 *
 * 이게 없을 때는 **실패가 조용히 되돌아갔다.** 장보기에 담은 것이 사라지고,
 * 지운 쪽지가 되살아나고, 아무 말도 없었다. 무엇이 잘못됐는지 알 수 없으면
 * 사용자는 자기가 잘못 눌렀다고 생각한다.
 * DESIGN.md §8: "오류는 사과하지 않고 방법을 알려준다."
 *
 * 하단 탭바 위에 앉는다(`--bottom-bar`). 스크린리더에도 읽히도록 `aria-live`.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const say = useCallback((text: string, tone: Tone = "info") => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), LIFETIME);
  }, []);

  return (
    <Ctx.Provider value={{ say }}>
      {children}
      {/* 알림은 사용자가 무언가 한 뒤에만 뜬다 — 서버 렌더에는 없으니 마운트 여부를
          따로 들고 있을 필요가 없다(effect 에서 setState 하지 않으려고). */}
      {items.length > 0 &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            // 오류는 바로 읽어 주고(assertive), 그 밖은 하던 말을 끊지 않는다(polite).
            aria-live={items.some((t) => t.tone === "error") ? "assertive" : "polite"}
            className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4"
            style={{ bottom: "calc(var(--bottom-bar) + 1rem)" }}
          >
            {items.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "animate-fade-up max-w-md rounded-md px-4 py-3 text-sm font-medium shadow-lg",
                  t.tone === "error"
                    ? "bg-danger-soft text-danger-ink ring-1 ring-danger/30"
                    : "bg-ink text-white"
                )}
              >
                {t.text}
              </div>
            ))}
          </div>,
          document.body
        )}
    </Ctx.Provider>
  );
}
