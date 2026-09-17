import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { createCodexProvider } from "@/lib/agent/llm/codex";
import type { AgentEvent, ToolSchema } from "@/lib/agent/llm/types";

beforeAll(() => { process.env.AUTH_SECRET = "t"; });

function sse(lines: string[]): Response {
  return new Response(
    new ReadableStream({
      start(c) {
        for (const l of lines) c.enqueue(new TextEncoder().encode(l + "\n\n"));
        c.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } }
  );
}

async function drain(it: AsyncIterable<AgentEvent>) {
  const out: AgentEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

const token = async () => "tok";

describe("codex 공급자 — 스트림 파싱", () => {
  it("텍스트 델타를 text 이벤트로 바꾼다", async () => {
    const f = vi.fn(async () => sse([
      'data: {"type":"response.output_text.delta","delta":"안녕"}',
      'data: {"type":"response.output_text.delta","delta":"하세요"}',
      "data: [DONE]",
    ]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(ev.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta)).toEqual(["안녕", "하세요"]);
    expect(ev.at(-1)!.type).toBe("done");
  });

  it("고정 본문을 보낸다 (stream·store·instructions)", async () => {
    const f = vi.fn<typeof fetch>(async () => sse(["data: [DONE]"]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "안내", messages: [{ role: "user", content: "hi" }], tools: [] }));
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(body.stream).toBe(true);
    expect(body.store).toBe(false);
    expect(body.instructions).toBe("안내");
    expect(Array.isArray(body.input)).toBe(true);
  });

  it("필수 헤더를 붙인다", async () => {
    const f = vi.fn<typeof fetch>(async () => sse(["data: [DONE]"]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    const h = (f.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer tok");
    expect(h.Accept).toBe("text/event-stream");
    expect(h.originator).toBe("codex_cli_rs");
  });

  it("429 는 status 를 담은 error 이벤트", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { type: "usage_limit_reached" } }), { status: 429 }));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(ev.at(-1)).toMatchObject({ type: "error", status: 429 });
  });
});

describe("codex 공급자 — json 도구 모드", () => {
  it("액션 블록을 tool_call 로 바꾼다", async () => {
    process.env.AGENT_TOOL_MODE = "json";
    const f = vi.fn<typeof fetch>(async () => sse([
      'data: {"type":"response.output_text.delta","delta":"```action\\n{\\"name\\":\\"open_page\\",\\"args\\":{\\"path\\":\\"/plans/p1\\"}}\\n```"}',
      "data: [DONE]",
    ]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [{ name: "open_page", description: "d", parameters: { type: "object", properties: {} } }] }));
    expect(ev.find((e) => e.type === "tool_call")).toMatchObject({ name: "open_page", args: { path: "/plans/p1" } });
    // json 모드에서는 tools 필드를 보내지 않는다
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string).tools).toBeUndefined();
    delete process.env.AGENT_TOOL_MODE;
  });
});

// ── 아래는 실측(19:00) 전까지 회귀를 잡아 두기 위한 추가 테스트 ───────────────

const OPEN_PAGE: ToolSchema = {
  name: "open_page",
  description: "페이지를 연다",
  parameters: { type: "object", properties: { path: { type: "string", description: "경로" } }, required: ["path"] },
};

function bodyOf(f: ReturnType<typeof vi.fn>, call: number) {
  return JSON.parse((f.mock.calls[call][1] as RequestInit).body as string);
}

function headersOf(f: ReturnType<typeof vi.fn>, call: number) {
  return (f.mock.calls[call][1] as RequestInit).headers as Record<string, string>;
}

function texts(ev: AgentEvent[]) {
  return ev.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta);
}

afterEach(() => {
  delete process.env.AGENT_TOOL_MODE;
  delete process.env.AGENT_MODEL;
  delete process.env.AGENT_ACCOUNT_ID;
});

describe("codex 공급자 — 토큰·재시도", () => {
  it("401 이면 토큰을 다시 받아 한 번만 재시도한다", async () => {
    let n = 0;
    const f = vi.fn(async () => (++n === 1 ? new Response("{}", { status: 401 }) : sse(["data: [DONE]"])));
    const tokens = ["오래된", "새것"];
    const t = vi.fn(async () => tokens.shift() ?? "새것");
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token: t });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(f).toHaveBeenCalledTimes(2);
    expect(headersOf(f, 1).Authorization).toBe("Bearer 새것");
    expect(ev.at(-1)!.type).toBe("done");
  });

  it("401 이 이어지면 두 번째에 멈추고 error 를 올린다", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 401 }));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(f).toHaveBeenCalledTimes(2);
    expect(ev.at(-1)).toMatchObject({ type: "error", status: 401 });
  });

  it("오류 메시지에 토큰을 담지 않는다", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { type: "usage_limit_reached" } }), { status: 429 }));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token: async () => "비밀토큰" });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(JSON.stringify(ev)).not.toContain("비밀토큰");
  });

  it("연결 자체가 실패하면 예외 대신 error 이벤트", async () => {
    const f = vi.fn(async () => { throw new Error("getaddrinfo ENOTFOUND · Bearer tok"); });
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(ev).toHaveLength(1);
    expect(ev[0].type).toBe("error");
    expect((ev[0] as { message: string }).message).not.toContain("tok");
  });

  it("모델명은 설정(환경변수)에서 읽는다", async () => {
    process.env.AGENT_MODEL = "실측용-모델";
    const f = vi.fn(async () => sse(["data: [DONE]"]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(bodyOf(f, 0).model).toBe("실측용-모델");
  });

  it("계정 id 가 있으면 chatgpt-account-id 헤더를 붙인다", async () => {
    process.env.AGENT_ACCOUNT_ID = "acc_1";
    const f = vi.fn(async () => sse(["data: [DONE]"]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(headersOf(f, 0)["chatgpt-account-id"]).toBe("acc_1");
  });
});

describe("codex 공급자 — auto 모드 강등", () => {
  it("도구 때문에 4xx 가 나면 json 모드로 한 번 내려간다", async () => {
    let n = 0;
    const f = vi.fn(async () =>
      ++n === 1
        ? new Response(JSON.stringify({ error: { message: "tools is not supported" } }), { status: 400 })
        : sse(['data: {"type":"response.output_text.delta","delta":"네"}', "data: [DONE]"])
    );
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "안내", messages: [], tools: [OPEN_PAGE] }));
    expect(f).toHaveBeenCalledTimes(2);
    expect(bodyOf(f, 0).tools).toHaveLength(1);
    expect(bodyOf(f, 1).tools).toBeUndefined();
    expect(bodyOf(f, 1).instructions).toContain("action");
    expect(texts(ev)).toEqual(["네"]);
  });

  it("429 는 도구 문제가 아니므로 강등하지 않는다", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { type: "usage_limit_reached" } }), { status: 429 }));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [OPEN_PAGE] }));
    expect(f).toHaveBeenCalledTimes(1);
    expect(ev.at(-1)).toMatchObject({ type: "error", status: 429 });
  });

  it("native 모드에서는 평평한 function 스키마를 보낸다", async () => {
    const f = vi.fn(async () => sse(["data: [DONE]"]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "s", messages: [], tools: [OPEN_PAGE] }));
    expect(bodyOf(f, 0).tools[0]).toMatchObject({ type: "function", name: "open_page", parameters: { type: "object" } });
    // strict 는 보내지 않는다 — create_item 의 args 는 properties 가 없어 strict 모드가 거부한다.
    expect(bodyOf(f, 0).tools[0].strict).toBeUndefined();
  });
});

describe("codex 공급자 — 네이티브 도구 호출 조립", () => {
  it("나눠 오는 인자를 모아 tool_call 을 한 번만 낸다", async () => {
    const f = vi.fn(async () => sse([
      'data: {"type":"response.output_item.added","item":{"id":"i1","type":"function_call","call_id":"c1","name":"open_page"}}',
      'data: {"type":"response.function_call_arguments.delta","item_id":"i1","delta":"{\\"path\\":"}',
      'data: {"type":"response.function_call_arguments.delta","item_id":"i1","delta":"\\"/plans/p1\\"}"}',
      'data: {"type":"response.function_call_arguments.done","item_id":"i1","arguments":"{\\"path\\":\\"/plans/p1\\"}"}',
      'data: {"type":"response.output_item.done","item":{"id":"i1","type":"function_call","call_id":"c1","name":"open_page","arguments":"{\\"path\\":\\"/plans/p1\\"}"}}',
      'data: {"type":"response.completed","response":{"output":[{"id":"i1","type":"function_call","call_id":"c1","name":"open_page","arguments":"{\\"path\\":\\"/plans/p1\\"}"}]}}',
      "data: [DONE]",
    ]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [OPEN_PAGE] }));
    const calls = ev.filter((e) => e.type === "tool_call");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ id: "c1", name: "open_page", args: { path: "/plans/p1" } });
    expect(ev.at(-1)!.type).toBe("done");
  });

  it("델타 없이 완성본만 와도 텍스트를 한 번 낸다", async () => {
    const f = vi.fn(async () => sse([
      'data: {"type":"response.output_item.done","item":{"id":"m1","type":"message","content":[{"type":"output_text","text":"다 됐어요"}]}}',
      "data: [DONE]",
    ]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    expect(texts(await drain(p.sendTurn({ system: "s", messages: [], tools: [] })))).toEqual(["다 됐어요"]);
  });

  it("모르는 이벤트·깨진 프레임·사고 과정은 조용히 무시한다", async () => {
    const f = vi.fn(async () => sse([
      'data: {"type":"response.created","response":{"id":"r1"}}',
      'data: {"type":"response.reasoning_summary_text.delta","delta":"음…"}',
      "data: 이건 JSON 이 아니다",
      'data: {"type":"response.output_text.delta","delta":"안녕"}',
      'data: {"type":"response.output_text.done","text":"안녕"}',
      "data: [DONE]",
    ]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(texts(ev)).toEqual(["안녕"]);
    expect(ev.at(-1)!.type).toBe("done");
  });
});

describe("codex 공급자 — 액션 블록 파싱", () => {
  it("여러 델타에 쪼개진 액션 블록도 모아서 읽는다", async () => {
    process.env.AGENT_TOOL_MODE = "json";
    const f = vi.fn(async () => sse([
      'data: {"type":"response.output_text.delta","delta":"잠시만요 "}',
      'data: {"type":"response.output_text.delta","delta":"```ac"}',
      'data: {"type":"response.output_text.delta","delta":"tion\\n{\\"name\\":\\"open_"}',
      'data: {"type":"response.output_text.delta","delta":"page\\",\\"args\\":{\\"path\\":\\"/plans/p1\\"}}\\n"}',
      'data: {"type":"response.output_text.delta","delta":"```"}',
      "data: [DONE]",
    ]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [OPEN_PAGE] }));
    expect(ev.filter((e) => e.type === "tool_call")).toHaveLength(1);
    expect(ev.find((e) => e.type === "tool_call")).toMatchObject({ name: "open_page", args: { path: "/plans/p1" } });
    expect(texts(ev).join("")).toBe("잠시만요 "); // 블록은 화면에 새어 나가지 않는다
  });

  it("울타리를 잊고 JSON 만 뱉어도 tool_call 로 읽는다", async () => {
    process.env.AGENT_TOOL_MODE = "json";
    const f = vi.fn(async () => sse([
      'data: {"type":"response.output_text.delta","delta":"{\\"name\\":\\"open_page\\",\\"args\\":{\\"path\\":\\"/plans/p2\\"}}"}',
      "data: [DONE]",
    ]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [OPEN_PAGE] }));
    expect(ev.find((e) => e.type === "tool_call")).toMatchObject({ name: "open_page", args: { path: "/plans/p2" } });
    expect(texts(ev)).toEqual([]);
  });

  it("액션이 아닌 코드 블록은 원문 그대로 텍스트로 돌려준다", async () => {
    process.env.AGENT_TOOL_MODE = "json";
    const f = vi.fn(async () => sse([
      'data: {"type":"response.output_text.delta","delta":"예시예요\\n```ts\\nconst a = 1;\\n```\\n끝"}',
      "data: [DONE]",
    ]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [OPEN_PAGE] }));
    expect(ev.filter((e) => e.type === "tool_call")).toHaveLength(0);
    expect(texts(ev).join("")).toBe("예시예요\n```ts\nconst a = 1;\n```\n끝");
  });
});

describe("codex 공급자 — 히스토리 평탄화", () => {
  const history = [
    { role: "user" as const, content: "발리 며칠이야?" },
    { role: "assistant" as const, content: "", toolCalls: [{ id: "c1", name: "open_page", args: { path: "/plans/p1" } }] },
    { role: "tool" as const, content: '{"ok":true,"title":"발리"}', toolCallId: "c1" },
  ];

  it("tool 역할은 user 로 평탄화하고 표식을 붙인다", async () => {
    const f = vi.fn(async () => sse(["data: [DONE]"]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "s", messages: history, tools: [OPEN_PAGE] }));
    const input = bodyOf(f, 0).input as { role: string; content: { text: string }[] }[];
    expect(input).toHaveLength(3);
    expect(input.map((i) => i.role)).toEqual(["user", "assistant", "user"]);
    expect(input[2].content[0].text).toContain("[도구 결과]");
    expect(input[2].content[0].text).toContain("발리");
    expect(input[1].content[0].text).toContain("[도구 호출] open_page");
  });

  it("json 모드에서는 지난 도구 호출을 action 블록으로 되돌린다", async () => {
    process.env.AGENT_TOOL_MODE = "json";
    const f = vi.fn(async () => sse(["data: [DONE]"]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "s", messages: history, tools: [OPEN_PAGE] }));
    const input = bodyOf(f, 0).input as { content: { text: string }[] }[];
    expect(input[1].content[0].text).toContain("```action");
    expect(input[1].content[0].text).toContain("open_page");
  });
});
