// 스트림을 화면 말풍선으로 바꾸는 "순수한 부분"만 모았다.
// 이 저장소는 React 훅을 단위 테스트하지 않으므로(vitest.config.mts), 깨지기 쉬운 계산을
// 훅 바깥으로 떼어내 여기서 고정한다. DOM 도 React 도 건드리지 않는다.

import type { AgentMessage } from "@/lib/agent/llm/types";
import type { ToolResult } from "@/lib/agent/tools";

/** 화면에 보이는 말풍선. role:"tool" 은 여기 없다 — 성공한 결과만 assistant 말풍선이 품는다. */
export type Bubble =
  | { kind: "user"; text: string; imageUrl?: string }
  | { kind: "assistant"; text: string; results: ToolResult[] };

export type AssistantBubble = Extract<Bubble, { kind: "assistant" }>;

/** 성공한 도구 결과. 화면은 실패한 결과를 카드로 그리지 않는다(포동이가 말로 설명한다). */
export type OkResult = Extract<ToolResult, { ok: true }>;

/**
 * "찾아준 곳" 카드의 상한.
 *
 * 한 턴에 주소 여러 개를 읽는 일이 흔하다(모델이 한꺼번에 부른다). 5개를 읽었는데 2개만
 * 보이면 나머지는 읽고도 못 간다. 그렇다고 무제한이면 390px 화면이 거쳐 간 페이지로 찬다.
 * **만든 것에는 이 상한을 적용하지 않는다** — 아래 참고.
 */
const MAX_PLACE_CARDS = 5;

/**
 * 말풍선 하나에 실제로 그릴 결과들.
 *
 * 카드는 두 종류다.
 *
 * - **만든 것**(`undo` 가 있다): 되돌리기를 품고 있는 **유일한 자리**다. 그래서 하나도 접지 않고
 *   합치지도 않는다. 리소스 16종 중 14종은 `detailPattern` 이 없어 만든 항목의 `path` 가
 *   목록 경로로 **모두 같아진다**(`lib/agent/registry.ts` 의 `detailPath`). 경로로 중복을 지우면
 *   "장보기에 우유·계란·빵 넣어줘" 의 두 번째·세 번째가 통째로 사라지고, 되돌릴 방법도 함께 사라진다.
 * - **찾아준 곳**(`undo` 가 없다): 목록을 보거나 페이지를 열었을 때 생긴다. 유용하지만(폰에서 답 아래
 *   바로 [보러가기]) 거쳐 간 곳이 다 쌓이면 방해가 된다. 같은 곳은 한 번만, 그리고 상한을 둔다.
 *   만든 카드가 이미 가리키는 곳도 빼 준다 — 같은 곳으로 가는 버튼이 둘일 이유가 없다.
 */
export function visibleResults(results: ToolResult[]): OkResult[] {
  const ok = results.filter((r): r is OkResult => r.ok && Boolean(r.label));

  const made = ok.filter((r) => r.undo);
  const seen = new Set(made.map((r) => r.path).filter((p): p is string => Boolean(p)));

  const places: OkResult[] = [];
  for (const result of ok) {
    if (result.undo) continue;
    if (places.length === MAX_PLACE_CARDS) break;
    // 경로가 없는 결과(read_url 등)는 서로 겹칠 일이 없으니 라벨로 가른다.
    const at = result.path ?? `label:${result.label}`;
    if (seen.has(at)) continue;
    seen.add(at);
    places.push(result);
  }

  return [...made, ...places];
}

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

/**
 * 흘러나오는 동안의 말풍선.
 *
 * `pendingBreak` 가 있는 이유: 모델은 도구를 부르기 전과 후에 각각 말하는데, 그 둘은 기록에
 * **별개의 assistant 행**으로 남는다(lib/agent/loop.ts). 그래서 `foldMessages` 는 둘 사이를
 * 빈 줄로 띄운다. 흘러나올 때도 똑같이 띄워야 **같은 대화가 새로고침 전후로 같아 보인다.**
 */
export interface StreamBubbles {
  bubbles: Bubble[];
  /** 도구 결과가 끼어든 뒤 아직 새 글자가 안 왔다 → 다음 글자 앞에 빈 줄이 필요하다. */
  pendingBreak: boolean;
}

/** 빈 대화. 안의 것을 고치는 함수가 없으므로(전부 새로 만들어 돌려준다) 그대로 나눠 써도 된다. */
export const EMPTY_STREAM: StreamBubbles = { bubbles: [], pendingBreak: false };

/** 기록에서 불러온 대화로 시작한다. */
export function fromMessages(messages: AgentMessage[]): StreamBubbles {
  return { bubbles: foldMessages(messages), pendingBreak: false };
}

/** 가족이 보낸 말. 새 턴이 시작되므로 미뤄 둔 빈 줄은 버린다. 사진을 붙였으면 함께 보인다. */
export function pushUser(state: StreamBubbles, text: string, imageUrl?: string): StreamBubbles {
  return {
    bubbles: [...state.bubbles, { kind: "user", text, ...(imageUrl ? { imageUrl } : {}) }],
    pendingBreak: false,
  };
}

/** 흘러온 글자를 마지막 포동이 말풍선에 잇는다. */
export function pushDelta(state: StreamBubbles, delta: string): StreamBubbles {
  if (!delta) return state;

  if (!state.pendingBreak) {
    return { bubbles: change(state.bubbles, (b) => ({ ...b, text: b.text + delta })), pendingBreak: false };
  }

  // 도구를 거쳐 다시 말하기 시작했다. foldMessages 가 마디마다 trim 하고 "\n\n" 로 잇는 것과 똑같이 맞춘다.
  const head = delta.replace(/^\s+/, "");
  if (!head) return state; // 아직 공백뿐이다 — 빈 줄은 진짜 글자가 올 때 넣는다

  const bubbles = change(state.bubbles, (bubble) => {
    const said = bubble.text.replace(/\s+$/, "");
    return { ...bubble, text: said ? `${said}\n\n${head}` : head };
  });
  return { bubbles, pendingBreak: false };
}

/** 도구 결과 카드를 마지막 포동이 말풍선에 붙인다. */
export function pushResult(state: StreamBubbles, result: ToolResult): StreamBubbles {
  const bubbles = change(state.bubbles, (b) => ({ ...b, results: [...b.results, result] }));
  return { bubbles, pendingBreak: true };
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
      bubbles.push({
        kind: "user",
        text: message.content,
        // 축소본(imageData)은 저장되지 않으므로 기록에서 되살아나는 것은 원본 주소뿐이다.
        ...(message.imageUrl ? { imageUrl: message.imageUrl } : {}),
      });
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
