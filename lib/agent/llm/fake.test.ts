import { describe, it, expect } from "vitest";
import { createFakeProvider } from "@/lib/agent/llm/fake";
import type { AgentEvent } from "@/lib/agent/llm/types";

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

  it("대본이 떨어지면 error 이벤트를 낸다", async () => {
    const p = createFakeProvider([[{ type: "done" }]]);
    await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    const extra = await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(extra[0].type).toBe("error");
  });
});
