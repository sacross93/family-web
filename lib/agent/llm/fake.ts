import type { AgentEvent, LlmProvider, SendTurnInput } from "./types";

/** 테스트 전용. 네트워크 없이 루프를 검증하기 위한 대본 재생기. */
export function createFakeProvider(script: AgentEvent[][]): LlmProvider & { calls: SendTurnInput[] } {
  let turn = 0;
  const calls: SendTurnInput[] = [];
  return {
    calls,
    sendTurn(input) {
      calls.push(input);
      const events = script[turn++] ?? [
        { type: "error" as const, message: "대본이 더 이상 없습니다(테스트 설정 오류)." },
      ];
      return (async function* () {
        for (const e of events) yield e;
      })();
    },
  };
}
