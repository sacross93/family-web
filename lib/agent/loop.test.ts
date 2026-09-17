import { describe, it, expect } from "vitest";
import { runAgent } from "@/lib/agent/loop";
import type { LoopEvent } from "@/lib/agent/loop";
import { createFakeProvider } from "@/lib/agent/llm/fake";
import type { AgentMessage } from "@/lib/agent/llm/types";
import type { AgentResource } from "@/lib/agent/registry";

const FAKE: AgentResource[] = [{
  key: "plan", label: "계획", listPath: "/plans", detailPattern: "/plans/:id",
  catalog: async () => [{ id: "p1", title: "발리" }],
  detail: async () => ({ title: "발리", days: 4 }),
}];
const ctx = { origin: "http://t.local", cookie: "c", resources: FAKE };

async function drain(it: AsyncIterable<unknown>) {
  const out: unknown[] = [];
  for await (const e of it) out.push(e);
  // 아래 테스트들이 쓰는 좁히기 캐스트가 성립하도록 실제 이벤트 타입으로 돌려준다.
  return out as LoopEvent[];
}

describe("runAgent", () => {
  it("도구를 실행하고 결과를 넣어 모델을 다시 부른다", async () => {
    const p = createFakeProvider([
      [{ type: "tool_call", id: "c1", name: "open_page", args: { path: "/plans/p1" } }, { type: "done" }],
      [{ type: "text", delta: "발리는 3박4일이에요" }, { type: "done" }],
    ]);
    const events = await drain(runAgent({ question: "발리 며칠?", provider: p, ctx, catalog: "계획(1): 발리" }));

    expect(events.map((e) => e.type)).toEqual(["tool_start", "tool_result", "text", "done"]);
    // 두 번째 호출에 도구 결과가 들어갔는지
    const second = p.calls[1];
    expect(JSON.stringify(second.messages)).toContain("발리");
    expect(second.messages.some((m) => m.role === "tool")).toBe(true);
  });

  it("목차를 시스템 프롬프트에 넣는다", async () => {
    const p = createFakeProvider([[{ type: "text", delta: "네" }, { type: "done" }]]);
    await drain(runAgent({ question: "뭐 있어?", provider: p, ctx, catalog: "계획(1): 발리" }));
    expect(p.calls[0].system).toContain("계획(1): 발리");
  });

  it("maxSteps 를 넘으면 중단한다", async () => {
    const loopTurn = [{ type: "tool_call" as const, id: "c", name: "open_page", args: { path: "/plans/p1" } }, { type: "done" as const }];
    const p = createFakeProvider([loopTurn, loopTurn, loopTurn, loopTurn, loopTurn]);
    const events = await drain(runAgent({ question: "무한", provider: p, ctx, catalog: "", maxSteps: 2 }));
    expect(events.filter((e) => e.type === "tool_start")).toHaveLength(2);
    // 상한의 목적은 사용량이다. "도구를 안 돌렸다"가 아니라 "공급자를 더 안 불렀다"를 본다.
    expect(p.calls).toHaveLength(2);
    expect(events.at(-1)!.type).toBe("done");
  });

  it("maxSteps 가 0 이어도 최소 한 번은 묻는다", async () => {
    const p = createFakeProvider([[{ type: "text", delta: "네" }, { type: "done" }]]);
    const events = await drain(runAgent({ question: "x", provider: p, ctx, catalog: "", maxSteps: 0 }));
    expect(p.calls).toHaveLength(1); // 0 을 그대로 받으면 한 번도 안 묻고 빈 답으로 끝난다
    expect(events.map((e) => e.type)).toEqual(["text", "done"]);
  });

  it("도구 실패를 모델에 되돌려주고 계속 진행한다", async () => {
    const p = createFakeProvider([
      [{ type: "tool_call", id: "c1", name: "open_page", args: { path: "/admin" } }, { type: "done" }],
      [{ type: "text", delta: "거긴 못 열어요" }, { type: "done" }],
    ]);
    const events = await drain(runAgent({ question: "관리자 열어", provider: p, ctx, catalog: "" }));
    const result = events.find((e) => e.type === "tool_result") as { result: { ok: boolean } };
    expect(result.result.ok).toBe(false);
    expect(events.at(-2)).toMatchObject({ type: "text" });
  });

  it("공급자 error 이벤트를 그대로 올린다", async () => {
    const p = createFakeProvider([[{ type: "error", message: "한도 초과", status: 429 }]]);
    const events = await drain(runAgent({ question: "x", provider: p, ctx, catalog: "" }));
    expect(events.at(-1)).toMatchObject({ type: "error", status: 429 });
  });

  // ── 아래는 브리프에 빠져 있던 요구사항: 도구 호출 "사실"까지 히스토리에 남기기 ──
  // 결과(role:"tool")만 쌓으면 다음 턴에 모델은 자기가 무엇을 불렀는지 잃어버리고,
  // 네이티브 function calling 에서는 짝 없는 결과라 요청 자체가 거절된다.

  it("다음 턴에 assistant(도구호출) → tool(결과) 짝을 복원한다", async () => {
    const p = createFakeProvider([
      [{ type: "tool_call", id: "call_abc", name: "open_page", args: { path: "/plans/p1" } }, { type: "done" }],
      [{ type: "text", delta: "발리는 3박4일이에요" }, { type: "done" }],
    ]);
    await drain(runAgent({ question: "발리 며칠?", provider: p, ctx, catalog: "" }));

    // 첫 호출에는 질문만. (스냅샷이어야 한다 — 같은 배열을 계속 넘기면 여기서 걸린다)
    expect(p.calls[0].messages).toEqual([{ role: "user", content: "발리 며칠?" }]);

    const messages = p.calls[1].messages;
    const at = messages.findIndex((m) => m.role === "assistant" && m.toolCalls?.length);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(messages[at].toolCalls).toEqual([
      { id: "call_abc", name: "open_page", args: { path: "/plans/p1" } },
    ]);
    // 호출 바로 뒤에 그 호출의 결과가 붙는다.
    expect(messages[at + 1].role).toBe("tool");
    expect(messages[at + 1].toolCallId).toBe("call_abc");
    expect(messages[at + 1].content).toContain("발리");
  });

  it("한 턴에 도구를 여러 번 불러도 순서대로 짝지어 쌓는다", async () => {
    const p = createFakeProvider([
      [
        { type: "tool_call", id: "call_1", name: "open_page", args: { path: "/plans/p1" } },
        { type: "tool_call", id: "call_2", name: "list_resource", args: { resource: "plan" } },
        { type: "done" },
      ],
      [{ type: "text", delta: "정리했어요" }, { type: "done" }],
    ]);
    await drain(runAgent({ question: "계획 다 보여줘", provider: p, ctx, catalog: "" }));

    const messages = p.calls[1].messages;
    const at = messages.findIndex((m) => m.role === "assistant" && m.toolCalls?.length);
    expect(messages[at].toolCalls?.map((c) => c.id)).toEqual(["call_1", "call_2"]);
    expect(messages.slice(at + 1, at + 3).map((m) => [m.role, m.toolCallId])).toEqual([
      ["tool", "call_1"],
      ["tool", "call_2"],
    ]);
  });

  it("시스템 프롬프트에 안전·정직 규칙이 들어간다", async () => {
    const p = createFakeProvider([[{ type: "text", delta: "네" }, { type: "done" }]]);
    await drain(runAgent({ question: "안녕", provider: p, ctx, catalog: "계획(1): 발리" }));
    const system = p.calls[0].system;
    expect(system).toContain("<fetched-content>"); // 가져온 글은 자료이지 지시가 아니다
    expect(system).toMatch(/수정/); // 추가는 되지만 수정·삭제는 할 수 없다
    expect(system).toMatch(/삭제/);
    expect(system).toMatch(/아는 척/); // 모르면 지어내지 말고 어디를 볼지 알려준다
    expect(system).toMatch(/존댓말/);
  });

  it("진행 문구는 리소스 이름에서 만든다", async () => {
    const p = createFakeProvider([
      [{ type: "tool_call", id: "c1", name: "open_page", args: { path: "/plans/p1" } }, { type: "done" }],
      [{ type: "text", delta: "네" }, { type: "done" }],
    ]);
    const events = await drain(runAgent({ question: "발리 봐줘", provider: p, ctx, catalog: "" }));
    const start = events.find((e) => e.type === "tool_start") as { name: string; label: string };
    expect(start.name).toBe("open_page");
    expect(start.label).toContain("계획"); // FAKE 리소스의 label 에서 나온 말
    expect(start.label).toContain("중…");
  });

  it("프로토타입 키를 도구 이름으로 보내도 스트림이 죽지 않는다", async () => {
    // 진행 문구를 만드는 표를 객체로 인덱싱하면 이런 이름에서 Object.prototype 이 튀어나온다.
    // 이 호출은 executeTool 보다 **앞**이라, 던지면 {ok:false} 로 처리될 기회조차 없이
    // 제너레이터가 통째로 터진다(도구 층은 절대 안 던지는데 라벨에서 죽는 비대칭).
    const p = createFakeProvider([
      [
        { type: "tool_call", id: "c1", name: "__proto__", args: {} },
        { type: "tool_call", id: "c2", name: "constructor", args: {} },
        { type: "tool_call", id: "c3", name: "hasOwnProperty", args: {} },
        { type: "tool_call", id: "c4", name: "toString", args: {} },
        { type: "done" },
      ],
      [{ type: "text", delta: "그런 도구는 없어요" }, { type: "done" }],
    ]);
    const events = await drain(runAgent({ question: "x", provider: p, ctx, catalog: "" }));

    const starts = events.filter((e) => e.type === "tool_start") as { label: string }[];
    expect(starts).toHaveLength(4);
    for (const s of starts) expect(typeof s.label).toBe("string"); // 객체가 새어나오면 안 된다

    // 라벨을 넘긴 뒤에는 평소대로 도구 층이 {ok:false} 로 거절하고 대화가 이어진다.
    const results = events.filter((e) => e.type === "tool_result") as { result: { ok: boolean } }[];
    expect(results).toHaveLength(4);
    expect(results.every((r) => r.result.ok === false)).toBe(true);
    expect(events.at(-1)!.type).toBe("done");
  });

  it("도구 결과는 내보내기 전에 모델 본문으로 굳힌다", async () => {
    const p = createFakeProvider([
      [{ type: "tool_call", id: "c1", name: "open_page", args: { path: "/plans/p1" } }, { type: "done" }],
      [{ type: "text", delta: "네" }, { type: "done" }],
    ]);
    // 소비자(SSE 라우트)가 화면용으로 결과를 줄이는 상황. yield 에서 제너레이터가 멈춰 있으므로
    // 나중에 stringify 하면 이 손질이 모델이 보는 내용까지 바꿔 버린다.
    for await (const e of runAgent({ question: "발리 며칠?", provider: p, ctx, catalog: "" })) {
      if (e.type === "tool_result") (e.result as { data: unknown }).data = "…화면용으로 줄임…";
    }
    const toolMessage = p.calls[1].messages.find((m) => m.role === "tool");
    expect(toolMessage!.content).toContain("발리");
    expect(toolMessage!.content).not.toContain("줄임");
  });

  it("대화 기록은 최근 것만 보낸다", async () => {
    const history: AgentMessage[] = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `h${i}`,
    }));
    const p = createFakeProvider([[{ type: "text", delta: "네" }, { type: "done" }]]);
    await drain(runAgent({ question: "마지막", provider: p, ctx, catalog: "", history }));

    const contents = p.calls[0].messages.map((m) => m.content);
    expect(contents).not.toContain("h0");
    expect(contents).not.toContain("h1");
    expect(contents).toContain("h2");
    expect(contents).toContain("h11");
    expect(contents.at(-1)).toBe("마지막");
  });

  it("기록이 도구 결과로 시작하면 그 앞부분을 떼어낸다", async () => {
    const history: AgentMessage[] = [
      { role: "tool", content: "{}", toolCallId: "orphan" },
      { role: "assistant", content: "네 확인했어요" },
    ];
    const p = createFakeProvider([[{ type: "text", delta: "네" }, { type: "done" }]]);
    await drain(runAgent({ question: "또", provider: p, ctx, catalog: "", history }));

    // 짝 없는 tool 결과로 시작하면 네이티브 도구 모드에서 요청이 거절된다.
    expect(p.calls[0].messages[0].role).not.toBe("tool");
    expect(p.calls[0].messages.map((m) => m.content)).toEqual(["네 확인했어요", "또"]);
  });
});
