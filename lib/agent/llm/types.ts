// LLM 공급자 경계. 루프는 이 타입들만 알고, 실제 공급자는 갈아끼울 수 있다.

import type { ToolSchema } from "../registry";

/** 도구 스키마의 단일 진실 원천은 registry.ts 다. 여기서 다시 선언하지 않고 재export 한다. */
export type { JsonSchema, ToolSchema } from "../registry";

/** 공급자가 흘려보내는 스트리밍 이벤트 한 조각. */
export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "done" }
  | { type: "error"; message: string; status?: number };

/** 대화 한 줄. 도구 호출은 assistant 의 toolCalls 와 tool 의 toolCallId 로 짝을 이룬다. */
export interface AgentMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  /** role:"tool" 일 때, 이 결과가 어느 호출에 대한 것인지 */
  toolCallId?: string;
  /** role:"user" — 함께 보낸 사진의 주소. 저장되고, 다시 열 때 화면에 보인다. */
  imageUrl?: string;
  /** 그림을 어느 해상도로 볼지. "low" 는 512px 로 줄여 보므로 토큰이 ~85개로 고정된다(실측).
   *  페이지에서 가져온 그림처럼 "무엇이 찍혔나"만 알면 되는 경우에 쓴다. */
  imageDetail?: "low";
  /** role:"user" — 이번 턴에 모델에게 보여줄 축소본(data URL). **저장하지 않는다.**
   *  기록에서 되살린 메시지에는 없다 — 사진을 두고 이어서 묻는 건 이번 턴 안에서만 된다. */
  imageData?: string;
  /** role:"assistant" 일 때, 이 턴에 모델이 요청한 도구 호출들.
   *  네이티브 도구 모드에서 히스토리를 원형대로 되돌리기 위해 필요하다.
   *  args 모양은 위 tool_call 이벤트와 동일해야 한다(그래야 루프가 캐스팅 없이 옮겨 담는다). */
  toolCalls?: { id: string; name: string; args: Record<string, unknown> }[];
}

/** 한 턴의 입력. 안내문 · 대화 기록 · 이번 턴에 노출할 도구 목록. */
export interface SendTurnInput {
  system: string;
  messages: AgentMessage[];
  tools: ToolSchema[];
}

/** 공급자 경계. 구현체는 이 메서드 하나만 만족하면 된다. */
export interface LlmProvider {
  sendTurn(input: SendTurnInput): AsyncIterable<AgentEvent>;
}
