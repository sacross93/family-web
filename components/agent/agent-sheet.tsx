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
import { ArrowUp, Menu, Paperclip, Plus, Square, X } from "lucide-react";

import { IconButton, Spinner, Textarea, useFocusTrap } from "@/components/ui";
import { cn } from "@/lib/utils";
import { AGENT_NAME } from "@/lib/agent/name";
import { AgentHistory } from "./agent-history";
import { AgentThread } from "./agent-thread";
import { shrinkImage } from "./image-attach";
import { useAgentChat } from "./use-agent-chat";

/** 입력창이 자라는 한계(약 4줄). 더 길어지면 안에서 스크롤된다. */
const MAX_INPUT_HEIGHT = 120;

const UPLOAD_FAILED = "사진을 올리지 못했어요. 다시 해볼까요?";

/**
 * 붙인 사진 한 장. 세 값이 하는 일이 전부 다르다.
 * - `preview`: 화면에만 쓰는 objectURL(고르자마자 보인다). 반드시 revoke 로 짝을 맞춘다.
 * - `url`: 업로드가 끝나야 생긴다. 저장되고 모델에게 넘어가 `create_item("photo", {url})` 에 쓰인다.
 * - `data`: 모델에게만 보여줄 축소본. **없을 수 있다** — HEIC 처럼 축소가 실패해도 주소만으로 보낸다.
 */
interface Attachment {
  preview: string;
  url?: string;
  data?: string;
}

/** 업로드 응답에서 주소 하나를 꺼낸다. 모양이 다르면 실패로 본다. */
async function uploadPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error("upload failed");
  const body = (await res.json()) as { urls?: unknown };
  const url = Array.isArray(body.urls) ? body.urls[0] : null;
  if (typeof url !== "string" || !url) throw new Error("upload failed");
  return url;
}

/** 포털은 서버 렌더에서 쓸 수 없다. "브라우저에 붙었는가"를 setState 없이 묻는 방법. */
const NEVER_CHANGES = () => () => {};

/** 폰인가 — 뒤 배경과 스크롤 잠금은 폰에서만이다(데스크톱은 사이트를 보면서 대화한다). */
function isPhone(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
}

export function AgentSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  // 닫아도 훅은 살아 있다 — 다시 열면 하던 이야기가 그대로 이어진다.
  const state = useAgentChat();
  // 시트가 떠 있는 동안 탭이 뒤쪽 화면으로 새어 나가지 않게.
  const panel = useFocusTrap<HTMLDivElement>(open);
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
  // 붙인 사진. 고르는 즉시 미리보기가 뜨고, 업로드가 끝나야 url 이 채워진다.
  const [attach, setAttach] = useState<Attachment | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // 지금 살아 있는 objectURL. 늦게 도착한 업로드 결과가 내 것인지 가리는 데도 쓴다.
  const previewRef = useRef<string | null>(null);
  // Textarea 는 ref 를 받지 않는 공용 컴포넌트다 — 감싼 상자에서 찾아 쓴다(공용 컴포넌트를 건드리지 않으려고).
  const boxRef = useRef<HTMLDivElement>(null);
  const input = useCallback(() => boxRef.current?.querySelector("textarea") ?? null, []);

  /** `URL.createObjectURL` 은 반드시 짝이 있다 — 놓아주지 않으면 사진을 고를 때마다 메모리에 쌓인다. */
  const releasePreview = useCallback(() => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
  }, []);

  const clearAttach = useCallback(() => {
    releasePreview();
    setAttach(null);
    setAttaching(false);
    setAttachError(null);
  }, [releasePreview]);

  // 창이 통째로 사라질 때도 마지막 한 장은 놓아준다.
  useEffect(() => releasePreview, [releasePreview]);

  /**
   * 고른 사진 한 장. 축소(모델용)와 업로드(저장용)를 **함께** 돌린다.
   *
   * 축소만 실패하면 그대로 보낸다 — `createImageBitmap` 은 HEIC 에서 던지는데(맥 사진 앱이
   * 그대로 내보낸다) 여기서 함께 실패로 처리하면 **이미 올라간 파일은 저장소에 남고 사용자는
   * 안 올라갔다는 말을 듣는다.** 모델이 사진을 못 볼 뿐, "발리 사진첩에 넣어줘"는 주소만으로 된다.
   */
  const pickPhoto = useCallback(
    async (file: File) => {
      releasePreview();
      const preview = URL.createObjectURL(file);
      previewRef.current = preview;
      setAttach({ preview });
      setAttachError(null);
      setAttaching(true);

      const [shrunk, uploaded] = await Promise.allSettled([shrinkImage(file), uploadPhoto(file)]);

      // 기다리는 사이 취소했거나 다른 사진을 골랐다 — 늦게 온 이 결과는 버린다.
      if (previewRef.current !== preview) return;
      setAttaching(false);

      if (uploaded.status !== "fulfilled") {
        releasePreview();
        setAttach(null);
        setAttachError(UPLOAD_FAILED);
        return;
      }
      setAttach({
        preview,
        url: uploaded.value,
        ...(shrunk.status === "fulfilled" ? { data: shrunk.value } : {}),
      });
    },
    [releasePreview],
  );

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
    (text: string, image?: { url: string; data?: string }) => {
      const message = text.trim();
      if (!message || state.running) return;
      setView("chat");
      void state.send(message, image);
    },
    [state],
  );

  const submit = useCallback(() => {
    // 올리는 중에는 보내지 않는다 — url 이 아직 없어 사진이 빠진 채로 나간다.
    if (!draft.trim() || state.running || attaching) return;
    const message = draft;
    const image = attach?.url ? { url: attach.url, ...(attach.data ? { data: attach.data } : {}) } : undefined;
    setDraft("");
    clearAttach();
    // 값이 비면 높이도 한 줄로 돌아가야 한다(값보다 늦게 반영되므로 다음 프레임에).
    window.requestAnimationFrame(() => grow(input()));
    ask(message, image);
  }, [ask, attach, attaching, clearAttach, draft, grow, input, state.running]);

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
    clearAttach();
    setView("chat");
    window.requestAnimationFrame(() => grow(input()));
  }, [clearAttach, grow, input, state]);

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
        ref={panel}
        tabIndex={-1}
        aria-modal="true"
        role="dialog"
        aria-label={`${AGENT_NAME}에게 물어보기`}
        className={cn(
          // 높이는 내용에 맞춘다. 아직 아무 말도 안 했으면 시트가 작게 떠 있고, 대화가 쌓이면
          // 최대 높이까지 자란다 — 빈 대화창이 화면의 85% 를 흰 여백으로 차지하지 않는다.
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-xl bg-surface shadow-lg",
          "animate-[fade-up_.28s_cubic-bezier(.16,1,.3,1)]",
          "sm:inset-auto sm:bottom-5 sm:right-5 sm:max-h-[70vh] sm:w-[380px] sm:rounded-xl",
        )}
      >
        {/* 머리글은 사이트의 다른 '틀'(상단바·탭바·사이드바)과 같은 연한 로즈 판이다.
            이 시트는 화면 위에 얹히는 것이라, 아래 내용과 같은 흰색이면 어디까지가
            시트인지 눈에 안 들어온다. */}
        <div className="on-chrome flex items-center gap-1 bg-chrome px-3 py-2.5">
          <span className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg" aria-hidden="true">
            🌱
          </span>
          <h2 className="ml-1 flex-1 truncate font-display text-lg font-bold text-chrome-ink">
            {AGENT_NAME}
          </h2>
          <IconButton
            type="button"
            aria-label="새 대화"
            onClick={newChat}
            className="text-chrome-faint hover:bg-chrome-soft hover:text-chrome-ink"
          >
            <Plus className="h-5 w-5" />
          </IconButton>
          <IconButton
            type="button"
            aria-label={history ? "대화로 돌아가기" : "지난 대화"}
            onClick={() => setView(history ? "chat" : "history")}
            className={
              history
                ? "bg-white text-chrome-ink"
                : "text-chrome-faint hover:bg-chrome-soft hover:text-chrome-ink"
            }
          >
            <Menu className="h-5 w-5" />
          </IconButton>
          <IconButton
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="text-chrome-faint hover:bg-chrome-soft hover:text-chrome-ink"
          >
            <X className="h-5 w-5" />
          </IconButton>
        </div>

        {/* 기록도 같은 시트 안에서 바뀐다 — 서랍을 또 열면 폰에서 길을 잃는다. */}
        {history ? (
          <AgentHistory state={state} onOpened={() => setView("chat")} />
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
            {/* 잘못 고른 걸 보내고 나서 알면 늦다 — 보내기 전에 여기서 보이고 지울 수 있다. */}
            {attach && (
              <div className="mb-2 flex items-center gap-3">
                <div className="relative shrink-0">
                  <img
                    src={attach.preview}
                    loading="lazy"
                    alt="붙인 사진"
                    className="h-16 w-16 rounded-md border border-line object-cover"
                  />
                  {attaching && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-md bg-ink/30">
                      <Spinner className="h-5 w-5" />
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label="사진 빼기"
                    onClick={clearAttach}
                    className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-ink-soft shadow-sm active:scale-95"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {/* 첨부만으로는 보낼 수 없다(스펙 §19.5). 잠긴 버튼만 있고 이유가 없으면 고장으로 보인다. */}
                {!draft.trim() && !attaching && (
                  <p className="min-w-0 text-sm text-ink-soft">무엇을 할지도 알려주세요</p>
                )}
              </div>
            )}
            {attachError && <p className="mb-2 text-sm text-danger-ink">{attachError}</p>}

            <div ref={boxRef} className="flex items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // 같은 사진을 다시 고를 수 있도록 값을 비운다(안 비우면 change 가 안 온다).
                  e.target.value = "";
                  if (file) void pickPhoto(file);
                }}
              />
              <IconButton
                type="button"
                aria-label="사진 붙이기"
                disabled={attaching}
                onClick={() => fileRef.current?.click()}
                className="shrink-0"
              >
                <Paperclip className="h-5 w-5" />
              </IconButton>
              <Textarea
                rows={1}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  grow(e.currentTarget);
                }}
                onKeyDown={onInputKeyDown}
                placeholder="무엇이든 말해보세요"
                aria-label={`${AGENT_NAME}에게 보낼 말`}
                className="min-h-11 max-h-[120px] flex-1 rounded-xl py-2.5"
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
                  // 올리는 중에도 잠근다 — 지금 보내면 사진 없이 나간다(스펙 §19.4).
                  disabled={!draft.trim() || attaching}
                  onClick={submit}
                  className="shrink-0 bg-primary text-ink hover:bg-primary-hover hover:text-ink"
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
