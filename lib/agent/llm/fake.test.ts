import { describe, it, expect } from "vitest";
import { createFakeProvider } from "@/lib/agent/llm/fake";
import type { AgentEvent, AgentMessage } from "@/lib/agent/llm/types";

async function drain(it: AsyncIterable<AgentEvent>) {
  const out: AgentEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

describe("createFakeProvider", () => {
  it("대본을 턴 순서대로 재생한다", async () => {
    const p = createFakeProvider([
      [{ type: "tool_call", id: "c1", name: "open_page", args: { path: "/plans/p1" } }, { type: "done" }],
      [{ type: "text", delta: "발리 3박4일이에요" }, { type: "done" }],
    ]);
    const t1 = await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(t1[0].type).toBe("tool_call");
    const t2 = await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(t2[0]).toEqual({ type: "text", delta: "발리 3박4일이에요" });
  });

  it("호출 입력을 기록한다", async () => {
    const p = createFakeProvider([[{ type: "done" }]]);
    await drain(p.sendTurn({ system: "안내문", messages: [{ role: "user", content: "안녕" }], tools: [] }));
    expect(p.calls[0].system).toBe("안내문");
    expect(p.calls[0].messages[0].content).toBe("안녕");
  });

  it("assistant 의 도구 호출과 tool 의 결과를 히스토리 그대로 넘긴다", async () => {
    const p = createFakeProvider([[{ type: "done" }]]);
    // 네이티브 도구 모드가 되돌려줘야 하는 짝: assistant(도구 호출) → tool(결과)
    const messages: AgentMessage[] = [
      { role: "user", content: "발리 계획 보여줘" },
      { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "open_page", args: { path: "/plans/p1" } }] },
      { role: "tool", content: "발리 3박4일", toolCallId: "c1" },
    ];
    await drain(p.sendTurn({ system: "s", messages, tools: [] }));
    expect(p.calls[0].messages[1].toolCalls).toEqual([
      { id: "c1", name: "open_page", args: { path: "/plans/p1" } },
    ]);
    expect(p.calls[0].messages[2].toolCallId).toBe("c1");
  });

  it("대본이 떨어지면 error 이벤트를 낸다", async () => {
    const p = createFakeProvider([[{ type: "done" }]]);
    await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    const extra = await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(extra[0].type).toBe("error");
  });
});
