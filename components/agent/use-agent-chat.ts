"use client";

// 화면이 서버 이벤트를 소비하는 방식이 전부 여기 모인다.
// 줄 파싱·말풍선 접기 같은 계산은 ./agent-stream 에 있고(테스트 있음), 여기는 상태와 수명만 다룬다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AgentMessage } from "@/lib/agent/llm/types";
import {
  asOkResult,
  createSseParser,
  EMPTY_STREAM,
  fromMessages,
  pushDelta,
  pushResult,
  pushUser,
} from "./agent-stream";
import type { Bubble, SseEvent, StreamBubbles } from "./agent-stream";

export type { Bubble, AssistantBubble } from "./agent-stream";

/** 라우트가 사람 말로 번역해 주지만, 그 앞에서 끊긴 경우(HTML 응답·연결 끊김)는 여기서 받는다. */
const GENERIC_ERROR = "잠깐 문제가 생겼어요. 다시 해볼까요?";
const LOAD_ERROR = "그 대화를 불러오지 못했어요.";

export interface AgentChatState {
  chatId: string | null;
  bubbles: Bubble[];
  running: boolean;
  /** 진행 표시("계획을 열어보는 중…"). 끝나면 null. */
  toolLabel: string | null;
  error: string | null;
  /** 사진은 두 값이다 — 저장되는 주소(url)와 이번 턴에만 모델에게 보이는 축소본(data, 선택). */
  send(message: string, image?: { url: string; data?: string }): Promise<void>;
  stop(): void;
  /** 새 대화 */
  reset(): void;
  /** 기록에서 이어보기 */
  load(chatId: string): Promise<void>;
}

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

/** SSE 가 아니라 JSON 오류로 돌아온 응답(403·400·404…). 서버가 써 둔 문구를 그대로 쓴다. */
async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body?.error === "string" && body.error) return body.error;
  } catch {
    // JSON 이 아니면(로그인 화면 HTML 등) 아래 기본 문구로.
  }
  return fallback;
}

/** 여러 개가 동시에 돌 때는 개수로 말한다. 이름표를 늘어놓으면 폰에서 줄이 넘친다. */
function summarizeTools(labels: string[]): string | null {
  if (!labels.length) return null;
  if (labels.length === 1) return labels[0];
  return `${labels.length}곳을 살펴보는 중…`;
}

export function useAgentChat(): AgentChatState {
  const [chatId, setChatId] = useState<string | null>(null);
  // 말풍선과 "빈 줄을 미뤄 뒀는가"는 한 덩어리다 — 따로 두면 둘이 어긋난다.
  const [stream, setStream] = useState<StreamBubbles>(EMPTY_STREAM);
  const [running, setRunning] = useState(false);
  /**
   * 지금 돌고 있는 도구들의 이름표.
   *
   * 하나만 두면 안 된다 — 모델은 한 턴에 여러 도구를 한꺼번에 부르고(주소 3개면 read_url 3번),
   * 그러면 **첫 결과가 오는 순간 표시가 사라진다.** 나머지 둘은 아직 도는데도.
   */
  const [toolLabels, setToolLabels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // send 가 useCallback 안에 갇혀 있어도 최신 값을 봐야 하는 것들.
  const chatIdRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // 화면이 사라졌는데 스트림이 계속 돌면 사용량만 태운다.
  useEffect(() => {
    const inflight = abortRef;
    return () => inflight.current?.abort();
  }, []);

  const rememberChat = useCallback((id: string | null) => {
    chatIdRef.current = id;
    setChatId(id);
  }, []);

  /** 이번 요청의 자리를 잡는다. 앞의 요청이 있으면 끊는다 — 흘러온 말풍선은 그대로 둔다. */
  const claim = useCallback(() => {
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    return controller;
  }, []);

  /**
   * 내가 아직 현재 요청이면 자리를 비우고 true.
   * 이미 다른 요청(또는 stop)에 밀렸으면 false — 그때 running·toolLabel 은 밀어낸 쪽의 것이므로 건드리면 안 된다.
   */
  const release = useCallback((controller: AbortController) => {
    if (abortRef.current !== controller) return false;
    abortRef.current = null;
    return true;
  }, []);

  const idle = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    setToolLabels([]);
  }, []);

  /** 서버 이벤트 하나를 화면에 반영한다. 스트림이 끝났으면 true. */
  const apply = useCallback(
    (event: SseEvent): boolean => {
      switch (event.type) {
        case "chat": {
          const id = event.chatId;
          if (typeof id === "string" && id) rememberChat(id);
          return false;
        }
        case "text": {
          const delta = event.delta;
          if (typeof delta === "string" && delta) setStream((prev) => pushDelta(prev, delta));
          return false;
        }
        case "tool_start": {
          const label = event.label;
          setToolLabels((prev) => [...prev, typeof label === "string" && label ? label : "살펴보는 중…"]);
          return false;
        }
        case "tool_result": {
          // 결과는 부른 순서대로 온다(lib/agent/loop.ts) — 앞에서 하나씩 뺀다.
          setToolLabels((prev) => prev.slice(1));
          const result = asOkResult(event.result);
          if (result) setStream((prev) => pushResult(prev, result));
          return false;
        }
        case "done":
          return true;
        case "error": {
          const message = event.message;
          setError(typeof message === "string" && message ? message : GENERIC_ERROR);
          return true;
        }
        default:
          return false; // 모르는 이벤트는 흘려보낸다 — 서버가 나중에 늘릴 수 있다
      }
    },
    [rememberChat],
  );

  const send = useCallback(
    async (message: string, image?: { url: string; data?: string }) => {
      const text = message.trim();
      if (!text || runningRef.current) return;

      const controller = claim();
      runningRef.current = true;
      setRunning(true);
      setToolLabels([]);
      setError(null);
      // 보내자마자 자기 사진이 보여야 한다 — 올라간 주소를 그대로 말풍선에 싣는다.
      setStream((prev) => pushUser(prev, text, image?.url));

      let closed = false; // done 이나 error 를 보았는가
      try {
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: chatIdRef.current,
            message: text,
            imageUrl: image?.url,
            imageData: image?.data,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          setError(await readError(response, GENERIC_ERROR));
          return;
        }

        const parser = createSseParser();
        const reader = response.body.getReader();
        try {
          for (;;) {
            const chunk = await reader.read();
            // 기다리는 동안 멈췄을 수 있다. 이미 흘러온 글자는 두고, 새 글자만 안 받는다.
            if (controller.signal.aborted) return;

            for (const event of chunk.done ? parser.flush() : parser.push(chunk.value)) {
              if (apply(event)) closed = true;
            }
            if (chunk.done || closed) break;
          }
        } finally {
          await reader.cancel().catch(() => {});
        }

        // done 도 error 도 못 보고 끊겼다(연결 끊김·로그인 화면 HTML 등).
        if (!closed) setError(GENERIC_ERROR);
      } catch (thrown) {
        if (!isAbort(thrown)) setError(GENERIC_ERROR);
      } finally {
        if (release(controller)) idle();
      }
    },
    [apply, claim, idle, release],
  );

  const stop = useCallback(() => {
    // 흘러온 글자는 지우지 않는다 — 읽던 것이 사라지는 게 멈추는 것보다 나쁘다.
    abortRef.current?.abort();
    abortRef.current = null;
    idle();
  }, [idle]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    rememberChat(null);
    setStream(EMPTY_STREAM);
    setError(null);
    idle();
  }, [idle, rememberChat]);

  const load = useCallback(
    async (id: string) => {
      const controller = claim();
      // 기록을 여는 것은 "대답 중"이 아니다 — running 은 오직 답이 흘러나오는 동안만 참이다.
      idle();
      setError(null);

      try {
        const response = await fetch(`/api/agent/chats/${encodeURIComponent(id)}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setError(await readError(response, LOAD_ERROR));
          return;
        }

        const body = (await response.json()) as { id?: unknown; messages?: unknown };
        if (controller.signal.aborted) return;

        const messages = Array.isArray(body.messages) ? (body.messages as AgentMessage[]) : [];
        rememberChat(typeof body.id === "string" && body.id ? body.id : id);
        setStream(fromMessages(messages));
      } catch (thrown) {
        if (!isAbort(thrown)) setError(LOAD_ERROR);
      } finally {
        release(controller);
      }
    },
    [claim, idle, release, rememberChat],
  );

  return useMemo(
    () => ({ chatId, bubbles: stream.bubbles, running, toolLabel: summarizeTools(toolLabels), error, send, stop, reset, load }),
    [chatId, stream, running, toolLabels, error, send, stop, reset, load],
  );
}
