import { describe, expect, it } from "vitest";

import { appendDelta, appendResult, createSseParser, foldMessages } from "./agent-stream";
import type { Bubble } from "./agent-stream";
import type { AgentMessage } from "@/lib/agent/llm/types";

const encoder = new TextEncoder();

/** 서버가 보내는 모양 그대로: 이벤트마다 "data: {...}\n\n" */
function sse(...events: unknown[]): Uint8Array {
  return encoder.encode(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""));
}

describe("createSseParser", () => {
  it("한 번에 다 와도 이벤트를 순서대로 흘린다", () => {
    const parser = createSseParser();
    expect(parser.push(sse({ type: "chat", chatId: "c1" }, { type: "text", delta: "안" }))).toEqual([
      { type: "chat", chatId: "c1" },
      { type: "text", delta: "안" },
    ]);
    expect(parser.flush()).toEqual([]);
  });

  it("어느 바이트에서 잘려도 같은 이벤트가 나온다 (줄 경계 · 한글 3바이트 경계)", () => {
    const expected = [
      { type: "chat", chatId: "c1" },
      { type: "text", delta: "안녕하세요" },
      { type: "tool_start", name: "open_page", label: "계획을 열어보는 중…" },
      { type: "done" },
    ];
    const bytes = sse(...expected);

    for (let cut = 0; cut <= bytes.length; cut += 1) {
      const parser = createSseParser();
      const seen = [
        ...parser.push(bytes.slice(0, cut)),
        ...parser.push(bytes.slice(cut)),
        ...parser.flush(),
      ];
      expect(seen, `${cut}번째 바이트에서 자름`).toEqual(expected);
    }
  });

  it("한 글자가 두 청크에 걸쳐도 깨지지 않는다", () => {
    // "안" 의 첫 바이트까지만 보낸다 — stream:true 가 없으면 여기서 "�" 가 된다.
    const bytes = sse({ type: "text", delta: "안녕" });
    const head = encoder.encode('data: {"type":"text","delta":"').length + 1;

    const parser = createSseParser();
    expect(parser.push(bytes.slice(0, head))).toEqual([]);
    expect(parser.push(bytes.slice(head))).toEqual([{ type: "text", delta: "안녕" }]);
  });

  it("마지막 줄에 개행이 없으면 flush 가 흘린다", () => {
    const parser = createSseParser();
    expect(parser.push(encoder.encode('data: {"type":"done"}'))).toEqual([]);
    expect(parser.flush()).toEqual([{ type: "done" }]);
  });

  it("모르는 이벤트는 그대로 흘리고, 데이터가 아닌 줄과 깨진 JSON 은 건너뛴다", () => {
    const parser = createSseParser();
    const raw =
      ": keep-alive\n" +
      "event: message\n" +
      "data: {깨진\n" +
      "data:\n" +
      'data: {"type":"뭔가새로운것","x":1}\r\n' +
      'data:{"type":"done"}\n';
    expect(parser.push(encoder.encode(raw))).toEqual([{ type: "뭔가새로운것", x: 1 }, { type: "done" }]);
  });
});

describe("말풍선 잇기", () => {
  it("첫 글자에 포동이 말풍선이 생기고 이어 붙는다", () => {
    let bubbles: Bubble[] = [{ kind: "user", text: "안녕" }];
    bubbles = appendDelta(bubbles, "네");
    bubbles = appendDelta(bubbles, "!");
    expect(bubbles).toEqual([
      { kind: "user", text: "안녕" },
      { kind: "assistant", text: "네!", results: [] },
    ]);
  });

  it("결과는 마지막 포동이 말풍선에 쌓인다", () => {
    const result = { ok: true as const, data: null, label: "계획 1개" };
    expect(appendResult([], result)).toEqual([{ kind: "assistant", text: "", results: [result] }]);
  });
});

describe("foldMessages", () => {
  it("연이은 assistant·tool 을 하나의 말풍선으로 접고, 실패한 결과는 숨긴다", () => {
    const ok = { ok: true, data: { id: "p1" }, label: "여행 계획", path: "/plans/p1" };
    const messages: AgentMessage[] = [
      { role: "user", content: "계획 뭐 있어?" },
      { role: "assistant", content: "", toolCalls: [{ id: "t1", name: "open_page", args: {} }] },
      { role: "tool", content: JSON.stringify(ok), toolCallId: "t1" },
      { role: "tool", content: JSON.stringify({ ok: false, error: "없어요" }), toolCallId: "t2" },
      { role: "assistant", content: "여행 계획이 있어요." },
      { role: "user", content: "고마워" },
      { role: "assistant", content: "네!" },
    ];

    expect(foldMessages(messages)).toEqual([
      { kind: "user", text: "계획 뭐 있어?" },
      { kind: "assistant", text: "여행 계획이 있어요.", results: [ok] },
      { kind: "user", text: "고마워" },
      { kind: "assistant", text: "네!", results: [] },
    ]);
  });

  it("한 말풍선 안의 두 마디는 빈 줄로 나눈다", () => {
    const messages: AgentMessage[] = [
      { role: "assistant", content: "찾아볼게요.", toolCalls: [{ id: "t1", name: "open_page", args: {} }] },
      { role: "tool", content: "깨진 JSON", toolCallId: "t1" },
      { role: "assistant", content: "찾았어요." },
    ];
    expect(foldMessages(messages)).toEqual([
      { kind: "assistant", text: "찾아볼게요.\n\n찾았어요.", results: [] },
    ]);
  });

  it("빈 기록은 빈 화면", () => {
    expect(foldMessages([])).toEqual([]);
  });
});
