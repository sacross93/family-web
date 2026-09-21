"use client";

// 대화 내용 — 말풍선·진행 표시·결과 카드. 스크롤 영역은 여기가 쥔다(시트는 자리만 내준다).

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui";
import { MarkdownView } from "@/components/markdown-view";
import { cn } from "@/lib/utils";
import { readMe, writeMe } from "@/lib/me";
import { visibleResults, type OkResult } from "./agent-stream";
import type { AgentChatState } from "./use-agent-chat";

/**
 * 빈 화면이 사용법을 가르친다 — 커서만 깜빡이면 뭘 할 수 있는지 모른다.
 * 두 번째 칩이 **"시키기도 된다"** 를 전한다. 버튼 이름(`물어보기`)이 못 하는 일이라
 * 문구를 바꾸더라도 이 자리에는 '시키는' 예시가 있어야 한다.
 */
/** 서버가 못 줄 때만 쓰는 기본값. 우리 집 것은 `/api/agent/hints` 가 만든다. */
const SUGGESTIONS = [
  "사진첩에 뭐 있는지 보여줘",
  "내일 우유 사기 할일 추가해줘",
  "다가오는 일정 알려줘",
];

/** 되돌리기 실패 문구를 라우트가 못 준 경우에만 쓴다. */
const UNDO_FAILED = "되돌리지 못했어요.";

/**
 * 도구가 돌려준 path 가 실제로 열리는 주소인가.
 * `/family`·`/decorations` 는 목차에만 있는 가상 경로라 링크를 걸면 404 가 난다(AGENTS.md).
 * `read_url` 이 읽은 바깥 주소(http/https)도 갈 수 있다 — 그건 새 탭으로 연다.
 */
function canVisit(path: string | undefined): path is string {
  if (!path) return false;
  if (/^https?:\/\//.test(path)) return true;
  if (!path.startsWith("/")) return false;
  return !/^\/(family|decorations)(\/|$)/.test(path);
}

/** 우리 사이트 밖인가. 밖이면 새 탭으로 열고, 시트를 닫지 않는다. */
function isExternal(path: string): boolean {
  return /^https?:\/\//.test(path);
}

/** 결과 하나를 가리키는 열쇠. 같은 항목을 두 번 되돌리려 하지 않도록 resource+id 로 잡는다. */
function undoKey(undo: { resource: string; id: string }): string {
  return `${undo.resource}:${undo.id}`;
}

/** 추가한 것 하나 — 제목 + [보러가기] [되돌리기]. */
function ResultCard({
  result,
  undone,
  busy,
  error,
  onUndo,
  onNavigate,
}: {
  result: OkResult;
  undone: boolean;
  busy: boolean;
  error: string | null;
  onUndo: (undo: { resource: string; id: string }) => void;
  onNavigate: () => void;
}) {
  const undo = result.undo;
  const visitable = canVisit(result.path) ? result.path : null;

  return (
    <div className="mt-3 rounded-md border border-line bg-sunken px-3.5 py-3">
      {undone ? (
        <>
          <p className="text-sm font-semibold text-ink-soft">되돌렸어요</p>
          <p className="mt-0.5 break-words text-xs text-ink-faint line-through">{result.label}</p>
        </>
      ) : (
        <>
          <p className="break-words text-sm font-semibold text-ink">{result.label}</p>
          {(visitable || undo) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {visitable &&
                (isExternal(visitable) ? (
                  <Button href={visitable} size="sm" variant="outline" target="_blank" rel="noopener noreferrer">
                    원문 보기
                  </Button>
                ) : (
                  <Button href={visitable} size="sm" variant="outline" onClick={onNavigate}>
                    보러가기
                  </Button>
                ))}
              {undo && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  // 성공하면 카드가 통째로 바뀌므로 이 버튼은 사라진다. 진행 중 두 번 누르는 것만 여기서 막는다.
                  disabled={busy}
                  onClick={() => onUndo(undo)}
                >
                  되돌리기
                </Button>
              )}
            </div>
          )}
        </>
      )}
      {error && <p className="mt-2 break-words text-xs text-danger-ink">{error}</p>}
    </div>
  );
}

/**
 * 빈 화면일 때만 **우리 집 추천 질문**을 한 번 받아온다.
 * 대화가 이미 있으면 안 부른다 — 빈 화면에서만 쓰는 값이라 미리 받을 이유가 없다.
 */
interface Member {
  id: string;
  name: string;
  emoji: string;
}

function useHints(empty: boolean) {
  const [hints, setHints] = useState<string[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    if (!empty || hints) return;
    let alive = true;
    fetch("/api/agent/hints")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        if (Array.isArray(d?.hints) && d.hints.length) setHints(d.hints);
        if (Array.isArray(d?.members)) setMembers(d.members);
      })
      .catch(() => {
        /* 못 받으면 기본 문장 그대로 — 빈 화면이 비어 보이면 안 된다 */
      });
    return () => {
      alive = false;
    };
  }, [empty, hints]);
  return { hints: hints ?? SUGGESTIONS, members };
}

/**
 * "나는 ___ 예요." 계정이 하나라 세션으로는 지금 말하는 사람을 알 수 없다(lib/me.ts).
 *
 * 빈 화면에만 둔다 — 대화 중에 묻는 것은 방해고, 여기서는 첫 줄을 쓰기 전 한 번이면 된다.
 * 고른 값은 이 기기에 남아 다음부터 안 묻는다.
 */
function MeChooser({ members }: { members: Member[] }) {
  // localStorage 는 서버에 없다. 첫 그림 뒤에 읽어야 서버·클라이언트 그림이 어긋나지 않는다 —
  // 렌더 중에 읽으면 hydration 이 깨진다. **React 바깥의 것과 맞추는 자리**라 효과가 맞다.
  const [me, setMe] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage(React 밖)를 마운트 뒤 한 번 읽어 상태로 들여온다
  useEffect(() => setMe(readMe()), []);

  if (members.length === 0) return null;
  const mine = members.find((m) => m.id === me);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-sm text-ink-faint">나는</span>
      {members.map((m) => {
        const on = m.id === me;
        return (
          <button
            key={m.id}
            type="button"
            // 다시 누르면 해제 — 잘못 고른 것을 되돌릴 길이 있어야 한다.
            onClick={() => {
              const next = on ? null : m.id;
              writeMe(next);
              setMe(next);
            }}
            aria-pressed={on}
            className={cn(
              // 폰에서 누를 것이라 40px 을 채운다(py-1.5 면 32px 이었다 — 재 봤다).
              "min-h-10 rounded-full px-3.5 py-2 text-sm transition active:scale-[.98]",
              on
                ? "bg-primary font-semibold text-ink"
                : "bg-sunken text-ink-soft hover:brightness-[.97]"
            )}
          >
            {m.emoji} {m.name}
          </button>
        );
      })}
      {!mine && <span className="text-xs text-ink-faint">골라 두면 이름까지 적어 드려요</span>}
    </div>
  );
}

export function AgentThread({
  state,
  onSuggest,
  undone,
  onUndone,
  onNavigate,
}: {
  state: AgentChatState;
  onSuggest: (text: string) => void;
  /** 카드의 [보러가기]로 떠날 때. 폰에서는 시트가 덮고 있어 닫아 주지 않으면 도착한 곳이 안 보인다. */
  onNavigate: () => void;
  /** 이미 되돌린 것들(`resource:id`). 시트가 쥔다 — 닫았다 열어도 같은 것을 두 번 되돌리지 않게. */
  undone: Record<string, boolean>;
  onUndone: (key: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [undoErrors, setUndoErrors] = useState<Record<string, string>>({});

  const { bubbles, toolLabel, running, error } = state;
  const { hints, members } = useHints(bubbles.length === 0);

  // 글자가 흘러나오는 동안 따라 내려간다 — 답이 화면 밖에서 자라면 멈춘 것처럼 보인다.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bubbles, toolLabel, running, error]);

  const runUndo = useCallback(
    async (undo: { resource: string; id: string }) => {
      const key = undoKey(undo);
      setBusy((prev) => ({ ...prev, [key]: true }));
      setUndoErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });

      try {
        // 경로는 보내지 않는다 — 지울 주소는 서버가 화이트리스트에서 만든다.
        const res = await fetch("/api/agent/undo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resource: undo.resource, id: undo.id }),
        });
        if (res.ok) {
          onUndone(key);
          return;
        }
        // 라우트가 사람 말로 번역해서 보낸다. 상태코드는 화면에 쓰지 않는다.
        const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
        const message = typeof body?.error === "string" && body.error ? body.error : UNDO_FAILED;
        setUndoErrors((prev) => ({ ...prev, [key]: message }));
      } catch {
        setUndoErrors((prev) => ({ ...prev, [key]: UNDO_FAILED }));
      } finally {
        setBusy((prev) => ({ ...prev, [key]: false }));
      }
    },
    [onUndone],
  );

  const last = bubbles[bubbles.length - 1];
  // 침묵이 제일 불안하다 — 보낸 뒤 첫 글자까지도, 도구가 끝나고 말이 시작되기까지도.
  const waiting = running && !toolLabel && (!last || last.kind === "user" || !last.text);

  return (
    <div
      ref={scrollRef}
      // 대화 바탕을 종이색으로. 시트가 흰 판이라 **흰 말풍선이 흰 바탕 위에** 있었고,
      // 테두리(1.24:1)로는 경계가 생기지 않았다. 바탕을 한 단 내리면 풍선이 뜬다.
      className="scrollbar-thin flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain bg-paper px-4 py-4"
    >
      {bubbles.length === 0 ? (
        /* 시작 화면은 **입력칸 바로 위**에 붙인다(justify-end).
           화면 한가운데에 띄우면 위아래로 빈 곳이 크게 남고, 무엇보다 눌러야 할 것이
           엄지에서 멀다. 여기서 할 일은 "고르거나 쓰거나" 둘 중 하나고 둘 다 아래에 있다. */
        <div className="flex h-full flex-col justify-end gap-3 px-1 pb-1">
          <p className="font-display text-xl font-bold text-ink">
            뭐든 물어보고, 시켜도 돼요
          </p>
          <MeChooser members={members} />
          <div className="flex flex-col items-start gap-2">
            {hints.map((text) => (
              <button
                key={text}
                type="button"
                onClick={() => onSuggest(text)}
                // **흰 알약이 아니라 분홍 알약.** 대화 바탕이 흰색이 된 뒤로 흰 알약은
                // 테두리 한 줄로만 버티느라 조용했다 — 눌러 보라고 놓은 것인데 눌릴 것처럼
                // 안 보이면 뜻이 없다. 바탕을 분홍으로 되돌리는 대신 **알약을 분홍으로** 한다
                // (흰 바탕 위에 분홍을 올린다 — 이 사이트의 원칙 그대로).
                className="max-w-full rounded-full bg-primary-soft px-4 py-2.5 text-left text-sm text-primary-ink transition hover:brightness-[.97] active:scale-[.98]"
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {bubbles.map((bubble, index) =>
            bubble.kind === "user" ? (
              <div key={index} className="flex justify-end">
                <div
                  className={cn(
                    "min-w-0 max-w-[85%] whitespace-pre-wrap break-words rounded-xl rounded-br-sm px-4 py-2.5 text-[0.9375rem] leading-relaxed",
                    // 내가 한 말은 **로즈 판**, 포동이 말은 흰 판. 둘을 색으로 가른다.
                    // `primary-soft` 였을 때 대화 바탕(`paper`)과 **1.04:1** 이라
                    // 풍선 모양이 아예 안 보이고 로즈 글자만 떠 있는 것처럼 보였다
                    // (포동이의 흰 카드는 1.16 으로 이 판의 최소 단차다 — DESIGN.md §2).
                    // `chrome` 은 1.23 으로 그 단차를 넘고, 글자도 8.9:1 로 훨씬 편하다.
                    "bg-chrome text-chrome-ink",
                  )}
                >
                  {/* 붙인 사진은 글 위에. next/image 가 아니라 <img> 를 쓰는 건 이 저장소 규칙이다(AGENTS.md). */}
                  {bubble.imageUrl && (
                    <img
                      src={bubble.imageUrl}
                      loading="lazy"
                      alt=""
                      className="mb-2 max-h-56 w-full rounded-md object-cover"
                    />
                  )}
                  {bubble.text}
                </div>
              </div>
            ) : bubble.text || bubble.results.length > 0 ? (
              <div key={index} className="flex justify-start">
                <div className="min-w-0 max-w-[92%] break-words rounded-xl rounded-bl-sm border border-line bg-surface px-4 py-2.5">
                  {bubble.text && <MarkdownView className="text-[0.9375rem]">{bubble.text}</MarkdownView>}
                  {visibleResults(bubble.results).map((result, rIndex) => {
                    const key = result.undo ? undoKey(result.undo) : "";
                    return (
                      <ResultCard
                        key={`${index}-${rIndex}`}
                        result={result}
                        undone={Boolean(key && undone[key])}
                        busy={Boolean(key && busy[key])}
                        error={(key && undoErrors[key]) || null}
                        onUndo={runUndo}
                        onNavigate={onNavigate}
                      />
                    );
                  })}
                </div>
              </div>
            ) : null,
          )}

          {/* 뭘 하는 중인지 보인다 — 끝나면 사라진다. */}
          {toolLabel && <p className="px-1 text-sm text-ink-soft">📂 {toolLabel}</p>}
          {waiting && <p className="px-1 text-sm text-ink-faint">생각하는 중…</p>}

          {/* 이미 흘러온 글자는 남겨 두고 한 줄만 덧붙인다. */}
          {error && (
            <div className="rounded-md bg-danger-soft px-4 py-2.5 text-sm text-danger-ink">{error}</div>
          )}
        </div>
      )}

      {/* 빈 화면에서도 오류는 보여야 한다(로그인 만료·사용량 초과). */}
      {bubbles.length === 0 && error && (
        <div className="mt-4 rounded-md bg-danger-soft px-4 py-2.5 text-sm text-danger-ink">{error}</div>
      )}
    </div>
  );
}
