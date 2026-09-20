import { describe, expect, it } from "vitest";

import { createSseParser, EMPTY_STREAM, foldMessages, pushDelta, pushResult, pushUser, visibleResults } from "./agent-stream";
import type { StreamBubbles } from "./agent-stream";
import type { AgentMessage } from "@/lib/agent/llm/types";
import type { ToolResult } from "@/lib/agent/tools";

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

/** 이벤트를 차례로 흘려 넣는다 — 훅이 apply 에서 하는 것과 같은 순서. */
function stream(...steps: ({ text: string } | { result: ToolResult })[]): StreamBubbles {
  return steps.reduce<StreamBubbles>(
    (state, step) => ("text" in step ? pushDelta(state, step.text) : pushResult(state, step.result)),
    EMPTY_STREAM,
  );
}

describe("말풍선 잇기", () => {
  it("첫 글자에 포동이 말풍선이 생기고 이어 붙는다", () => {
    const state = pushDelta(pushDelta(pushUser(EMPTY_STREAM, "안녕"), "네"), "!");
    expect(state.bubbles).toEqual([
      { kind: "user", text: "안녕" },
      { kind: "assistant", text: "네!", results: [] },
    ]);
  });

  it("결과는 마지막 포동이 말풍선에 쌓인다", () => {
    const result = { ok: true as const, data: null, label: "계획 1개" };
    expect(stream({ result }).bubbles).toEqual([{ kind: "assistant", text: "", results: [result] }]);
  });

  it("도구 앞에 한 말이 없으면 빈 줄을 넣지 않는다", () => {
    const state = stream({ result: { ok: true, data: null } }, { text: "찾았어요." });
    expect(state.bubbles[0]).toMatchObject({ kind: "assistant", text: "찾았어요." });
  });

  it("도구 뒤 첫 글자가 공백뿐이면 빈 줄을 미뤄 둔다", () => {
    const state = stream({ text: "찾아볼게요." }, { result: { ok: true, data: null } }, { text: "\n" }, { text: "찾았어요." });
    expect(state.bubbles[0]).toMatchObject({ text: "찾아볼게요.\n\n찾았어요." });
  });
});

describe("흘러나올 때와 다시 열 때가 같다", () => {
  // 같은 대화가 살아있을 때와 기록에서 열 때 다르게 보이면 사용자는 뭔가 잘못됐다고 느낀다.
  // 두 경로가 갈라지면 이 테스트가 잡는다.
  it("text → tool_result → text 가 foldMessages 와 글자까지 일치한다", () => {
    const result = { ok: true as const, data: { count: 12 }, label: "발리 앨범", path: "/albums/a1" };

    const live = pushDelta(
      pushDelta(
        pushResult(
          pushDelta(pushDelta(pushUser(EMPTY_STREAM, "발리 사진 어디 있지?"), "잠깐 "), "찾아볼게요."),
          result,
        ),
        "발리 사진은 ",
      ),
      "12장 있어요.",
    );

    // 같은 턴이 기록에 남는 모습 (lib/agent/loop.ts 가 쌓는 그대로)
    const reopened = foldMessages([
      { role: "user", content: "발리 사진 어디 있지?" },
      { role: "assistant", content: "잠깐 찾아볼게요.", toolCalls: [{ id: "t1", name: "open_page", args: {} }] },
      { role: "tool", content: JSON.stringify(result), toolCallId: "t1" },
      { role: "assistant", content: "발리 사진은 12장 있어요." },
    ]);

    expect(live.bubbles).toEqual(reopened);
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

describe("visibleResults", () => {
  const made = (label: string, path: string, id: string) => ({
    ok: true as const,
    data: null,
    label,
    path,
    undo: { resource: "todo", id },
  });
  const found = (label: string, path: string) => ({ ok: true as const, data: null, label, path });

  it("만든 것을 먼저 보여준다 — 잘리면 되돌릴 방법이 사라진다", () => {
    const kept = visibleResults([
      found("사진첩", "/albums"),
      found("계획", "/plans"),
      made("할일 · 우유 사기", "/todos/abc", "abc"),
    ]);
    expect(kept[0]?.label).toBe("할일 · 우유 사기");
  });

  it("같은 경로로 만든 것 여럿을 하나로 합치지 않는다", () => {
    // 16종 중 14종은 detailPattern 이 없어 만든 항목의 path 가 목록 경로로 전부 같다.
    // 여기서 접으면 "장보기에 우유·계란·빵" 의 둘째·셋째가 되돌리기와 함께 사라진다.
    const kept = visibleResults([
      made("장보기 · 우유", "/shopping", "a"),
      made("장보기 · 계란", "/shopping", "b"),
      made("장보기 · 빵", "/shopping", "c"),
    ]);
    expect(kept.map((r) => r.undo?.id)).toEqual(["a", "b", "c"]);
  });

  it("만든 것에는 장수 상한이 없다", () => {
    const kept = visibleResults([
      made("가", "/todos", "1"),
      made("나", "/todos", "2"),
      made("다", "/todos", "3"),
      made("라", "/todos", "4"),
      made("마", "/todos", "5"),
    ]);
    expect(kept).toHaveLength(5);
  });

  it("찾아준 곳은 같은 곳을 두 번 보여주지 않는다", () => {
    const kept = visibleResults([found("사진첩", "/albums"), found("사진첩", "/albums")]);
    expect(kept).toHaveLength(1);
  });

  it("찾아준 곳은 두 장까지만", () => {
    const kept = visibleResults([found("가", "/a"), found("나", "/b"), found("다", "/c")]);
    expect(kept.map((r) => r.label)).toEqual(["가", "나"]);
  });

  it("만든 카드가 이미 가리키는 곳은 또 보여주지 않는다", () => {
    const kept = visibleResults([found("할일", "/todos"), made("할일 · 우유 사기", "/todos", "a")]);
    expect(kept).toEqual([made("할일 · 우유 사기", "/todos", "a")]);
  });

  it("실패한 결과와 라벨 없는 결과는 카드가 되지 않는다", () => {
    const kept = visibleResults([
      { ok: false, error: "못 찾았어요" },
      { ok: true, data: null, path: "/todos" },
      found("할일", "/todos"),
    ]);
    expect(kept).toEqual([found("할일", "/todos")]);
  });

  it("경로가 없는 결과는 라벨로 가른다", () => {
    const kept = visibleResults([
      { ok: true, data: null, label: "example.com" },
      { ok: true, data: null, label: "example.com" },
    ]);
    expect(kept).toHaveLength(1);
  });
});

describe("사진 첨부", () => {
  it("foldMessages 가 사진 주소를 말풍선까지 옮긴다", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "이거 발리 사진인데 사진첩에 넣어줘", imageUrl: "/uploads/a.jpg" },
    ];
    expect(foldMessages(messages)).toEqual([
      { kind: "user", text: "이거 발리 사진인데 사진첩에 넣어줘", imageUrl: "/uploads/a.jpg" },
    ]);
  });

  it("사진이 없으면 말풍선에도 그 자리가 없다", () => {
    expect(foldMessages([{ role: "user", content: "안녕" }])).toEqual([{ kind: "user", text: "안녕" }]);
  });

  it("보내자마자 그리는 말풍선에도 사진이 실린다 — 다시 열었을 때와 같은 모습", () => {
    const live = pushUser(EMPTY_STREAM, "이거 넣어줘", "/uploads/a.jpg");
    expect(live.bubbles).toEqual(
      foldMessages([{ role: "user", content: "이거 넣어줘", imageUrl: "/uploads/a.jpg" }]),
    );
  });
});

describe("visibleResults — 바깥 주소", () => {
  it("read_url 이 읽은 바깥 주소도 카드로 남는다", () => {
    const found = { ok: true as const, data: null, label: "namu.wiki", path: "https://namu.wiki/w/임신" };
    expect(visibleResults([found])).toEqual([found]);
  });
});
