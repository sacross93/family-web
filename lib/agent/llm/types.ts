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

/** 대화 한 줄. role 이 "tool" 이면 toolCallId 로 어느 호출의 결과인지 짝짓는다. */
export interface AgentMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
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
