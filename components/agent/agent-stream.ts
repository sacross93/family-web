// 스트림을 화면 말풍선으로 바꾸는 "순수한 부분"만 모았다.
// 이 저장소는 React 훅을 단위 테스트하지 않으므로(vitest.config.mts), 깨지기 쉬운 계산을
// 훅 바깥으로 떼어내 여기서 고정한다. DOM 도 React 도 건드리지 않는다.

import type { AgentMessage } from "@/lib/agent/llm/types";
import type { ToolResult } from "@/lib/agent/tools";

/** 화면에 보이는 말풍선. role:"tool" 은 여기 없다 — 성공한 결과만 assistant 말풍선이 품는다. */
export type Bubble =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; results: ToolResult[] };

export type AssistantBubble = Extract<Bubble, { kind: "assistant" }>;

/**
 * 서버가 흘려보낸 한 줄. `type` 말고는 믿지 않고 쓰는 쪽에서 확인한다.
 * 열린 모양인 이유: 서버가 나중에 이벤트를 늘려도 화면이 막히지 않아야 한다.
 */
export interface SseEvent {
  type: string;
  [key: string]: unknown;
}

export interface SseParser {
  /** 바이트 조각 하나를 넣고, 그 안에서 완성된 이벤트들을 받는다. */
  push(chunk: Uint8Array): SseEvent[];
  /** 스트림이 끝났을 때 버퍼에 남은 찌꺼기를 마저 흘린다. */
  flush(): SseEvent[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** "data: {...}" 한 줄 → 이벤트. 데이터 줄이 아니거나 깨졌으면 null. */
function parseLine(line: string): SseEvent | null {
  const text = line.endsWith("\r") ? line.slice(0, -1) : line; // CRLF 로 와도 같게
  if (!text.startsWith("data:")) return null; // 빈 줄 · ":" 주석 · event:/id: 는 흘려보낸다
  const body = text.startsWith("data: ") ? text.slice(6) : text.slice(5); // 접두 뒤 공백 한 칸만 벗긴다
  if (!body) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null; // 깨진 줄 하나에 대화가 멈추지는 않게
  }
  if (!isRecord(parsed) || typeof parsed.type !== "string") return null;
  return parsed as SseEvent;
}

/**
 * SSE 를 줄 단위로 끊어 읽는 파서.
 *
 * 두 가지가 청크 경계에서 깨진다.
 * ① 줄: `data: {...}` 한 줄이 두 청크에 나뉘어 온다 → 버퍼에 쌓고 `\n` 에서만 끊는다.
 * ② 글자: 한글은 UTF-8 로 3바이트라 경계가 글자 한가운데를 가른다 →
 *    `decode(chunk, { stream: true })` 로 디코더가 반쪽 글자를 물고 있게 한다(안 그러면 "안" 이 "�" 가 된다).
 */
export function createSseParser(): SseParser {
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  function take(text: string, final: boolean): SseEvent[] {
    buffer += text;
    const events: SseEvent[] = [];

    let cut = buffer.indexOf("\n");
    while (cut >= 0) {
      const line = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 1);
      const event = parseLine(line);
      if (event) events.push(event);
      cut = buffer.indexOf("\n");
    }

    if (final && buffer) {
      // 마지막 줄에 개행이 없이 끝날 수도 있다.
      const event = parseLine(buffer);
      buffer = "";
      if (event) events.push(event);
    }
    return events;
  }

  return {
    push: (chunk) => take(decoder.decode(chunk, { stream: true }), false),
    flush: () => take(decoder.decode(), true),
  };
}

/** 성공한 도구 결과만 화면에 남긴다. 실패(ok:false)는 모델이 알아서 고치라고 준 것이라 보여주지 않는다. */
export function asOkResult(value: unknown): ToolResult | null {
  if (!isRecord(value) || value.ok !== true) return null;
  return value as ToolResult;
}

function change(bubbles: Bubble[], edit: (bubble: AssistantBubble) => AssistantBubble): Bubble[] {
  const last = bubbles[bubbles.length - 1];
  if (last && last.kind === "assistant") return [...bubbles.slice(0, -1), edit(last)];
  // 빈 말풍선은 미리 만들지 않는다 — 첫 글자(또는 첫 결과)가 올 때 생긴다.
  return [...bubbles, edit({ kind: "assistant", text: "", results: [] })];
}

/** 흘러온 글자를 마지막 포동이 말풍선에 잇는다. */
export function appendDelta(bubbles: Bubble[], delta: string): Bubble[] {
  if (!delta) return bubbles;
  return change(bubbles, (bubble) => ({ ...bubble, text: bubble.text + delta }));
}

/** 도구 결과 카드를 마지막 포동이 말풍선에 붙인다. */
export function appendResult(bubbles: Bubble[], result: ToolResult): Bubble[] {
  return change(bubbles, (bubble) => ({ ...bubble, results: [...bubble.results, result] }));
}

/** role:"tool" 의 content 는 ToolResult 를 JSON.stringify 한 문자열이다(lib/agent/loop.ts). */
function storedResult(content: string): ToolResult | null {
  try {
    return asOkResult(JSON.parse(content));
  } catch {
    return null;
  }
}

/**
 * 기록(AgentMessage[]) → 말풍선.
 * 한 턴은 `assistant(도구 호출) + tool(결과) + assistant(답)` 로 남는데,
 * 사람이 보기엔 그게 전부 한 번의 대답이다. 그래서 연이은 assistant·tool 은 말풍선 하나로 접는다.
 */
export function foldMessages(messages: AgentMessage[]): Bubble[] {
  const bubbles: Bubble[] = [];

  /** 지금 이어 쓸 포동이 말풍선. 없으면 만든다. */
  function current(): AssistantBubble {
    const last = bubbles[bubbles.length - 1];
    if (last && last.kind === "assistant") return last;
    const fresh: AssistantBubble = { kind: "assistant", text: "", results: [] };
    bubbles.push(fresh);
    return fresh;
  }

  for (const message of messages) {
    if (message.role === "user") {
      bubbles.push({ kind: "user", text: message.content });
      continue;
    }
    if (message.role === "tool") {
      const result = storedResult(message.content);
      if (result) current().results.push(result);
      continue;
    }
    // assistant — 도구만 부르고 한 마디도 안 한 턴은 content 가 비어 있다.
    const said = message.content.trim();
    if (!said) continue;
    const bubble = current();
    bubble.text = bubble.text ? `${bubble.text}\n\n${said}` : said;
  }

  return bubbles;
}
