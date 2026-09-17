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

// ── 실측 SSE 줄 ────────────────────────────────────────────────────────────
// 출처: `.superpowers/sdd/2026-09-17-site-agent-engine/probe-1-plain.txt` · `probe-2-tools.txt`
// (2026-09-18 실측). 이벤트 이름·필드 이름·값 형태는 덤프 그대로이고, 수 KB 짜리 `encrypted_content`
// 와 `response.completed` 의 응답 에코만 줄였습니다. `obfuscation` 은 실제로 붙어 오는 잡음 필드입니다.
const MSG = "msg_099885f152ba8bda016aac756522b087d0a274b53c3a2b2e3b";
const FC = "fc_0bc7b783ae3bc6b6016aac7567cc6c87d0b42b6f62cedbf1e3";
const CALL_ID = "call_qQVM9yxLdZ5tP7tOnymMIKwV";

const W = {
  created:
    'event: response.created\ndata: {"type":"response.created","response":{"id":"resp_0998","object":"response","status":"in_progress","model":"gpt-5.6-terra","output":[],"tools":[]},"sequence_number":0}',
  inProgress:
    'event: response.in_progress\ndata: {"type":"response.in_progress","response":{"id":"resp_0998","object":"response","status":"in_progress","output":[]},"sequence_number":1}',
  msgAdded: `event: response.output_item.added\ndata: {"type":"response.output_item.added","item":{"id":"${MSG}","type":"message","status":"in_progress","content":[],"phase":"final_answer","role":"assistant"},"output_index":0,"sequence_number":2}`,
  partAdded: `event: response.content_part.added\ndata: {"type":"response.content_part.added","content_index":0,"item_id":"${MSG}","output_index":0,"part":{"type":"output_text","annotations":[],"logprobs":[],"text":""},"sequence_number":3}`,
  /** 델타 내용만 테스트마다 갈아끼웁니다. 봉투는 실측 그대로입니다. */
  delta: (text: string, n = 4) =>
    `event: response.output_text.delta\ndata: {"type":"response.output_text.delta","content_index":0,"delta":"${text}","item_id":"${MSG}","logprobs":[],"obfuscation":"vTqRhuGCyYYqa4r","output_index":0,"sequence_number":${n}}`,
  textDone: (text: string) =>
    `event: response.output_text.done\ndata: {"type":"response.output_text.done","content_index":0,"item_id":"${MSG}","logprobs":[],"output_index":0,"sequence_number":6,"text":"${text}"}`,
  partDone: (text: string) =>
    `event: response.content_part.done\ndata: {"type":"response.content_part.done","content_index":0,"item_id":"${MSG}","output_index":0,"part":{"type":"output_text","annotations":[],"logprobs":[],"text":"${text}"},"sequence_number":7}`,
  msgDone: (text: string) =>
    `event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"id":"${MSG}","type":"message","status":"completed","content":[{"type":"output_text","annotations":[],"logprobs":[],"text":"${text}"}],"phase":"final_answer","role":"assistant"},"output_index":0,"sequence_number":8}`,
  /** 실측: 종료는 이것뿐이다. `data: [DONE]` 센티널은 오지 않는다. output 은 빈 배열이었다. */
  completed:
    'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_0998","object":"response","status":"completed","model":"gpt-5.6-terra","output":[],"usage":{"input_tokens":20,"output_tokens":5}},"sequence_number":9}',
  // 사고 과정: encrypted_content 가 수 KB 로 온다. 조용히 버려야 한다.
  reasoningAdded: `event: response.output_item.added\ndata: {"type":"response.output_item.added","item":{"id":"rs_0bc7","type":"reasoning","content":[],"encrypted_content":"gAAAAABqrHVnRpowkhisqlwqzySep8whLb(생략)"},"output_index":0,"sequence_number":3}`,
  reasoningDone: `event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"id":"rs_0bc7","type":"reasoning","content":[],"encrypted_content":"gAAAAABqrHVnDHgsAwJmB3qKc9Evi8EL8(생략)"},"output_index":0,"sequence_number":4}`,
  fcAdded: `event: response.output_item.added\ndata: {"type":"response.output_item.added","item":{"id":"${FC}","type":"function_call","status":"in_progress","arguments":"","call_id":"${CALL_ID}","name":"open_page"},"output_index":1,"sequence_number":4}`,
  fcArgDelta: (chunk: string, n: number) =>
    `event: response.function_call_arguments.delta\ndata: {"type":"response.function_call_arguments.delta","delta":"${chunk}","item_id":"${FC}","obfuscation":"WC4HyuHrWMHyd3","output_index":1,"sequence_number":${n}}`,
  fcArgDone: `event: response.function_call_arguments.done\ndata: {"type":"response.function_call_arguments.done","arguments":"{\\"path\\":\\"/plans/bali\\"}","item_id":"${FC}","output_index":1,"sequence_number":13}`,
  fcDone: `event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"id":"${FC}","type":"function_call","status":"completed","arguments":"{\\"path\\":\\"/plans/bali\\"}","call_id":"${CALL_ID}","name":"open_page"},"output_index":1,"sequence_number":14}`,
};

/** 실측 그대로의 도구 호출 한 판 (probe-2-tools.txt 순서). */
const TOOL_CALL_STREAM = [
  W.created,
  W.inProgress,
  W.reasoningAdded,
  W.reasoningDone,
  W.fcAdded,
  W.fcArgDelta('{\\"', 5),
  W.fcArgDelta("path", 6),
  W.fcArgDelta('\\":\\"', 7),
  W.fcArgDelta("/plans", 8),
  W.fcArgDelta("/bali", 9),
  W.fcArgDelta('\\"}', 10),
  W.fcArgDone,
  W.fcDone,
  W.completed,
];

describe("codex 공급자 — 스트림 파싱", () => {
  it("텍스트 델타를 text 이벤트로 바꾼다", async () => {
    const f = vi.fn(async () => sse([
      W.created,
      W.msgAdded,
      W.partAdded,
      W.delta("안", 4),
      W.delta("녕하세요", 5),
      W.textDone("안녕하세요"),
      W.partDone("안녕하세요"),
      W.msgDone("안녕하세요"),
      W.completed,
    ]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(ev.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta)).toEqual(["안", "녕하세요"]);
    expect(ev.at(-1)!.type).toBe("done");
  });

  it("고정 본문을 보낸다 (stream·store·instructions)", async () => {
    const f = vi.fn<typeof fetch>(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "안내", messages: [{ role: "user", content: "hi" }], tools: [] }));
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(body.stream).toBe(true);
    expect(body.store).toBe(false);
    expect(body.instructions).toBe("안내");
    expect(Array.isArray(body.input)).toBe(true);
    // 실측(probe-1)에서 200 을 받은 모양 그대로: {role, content:"…"}
    expect(body.input[0]).toEqual({ role: "user", content: "hi" });
  });

  it("필수 헤더를 붙인다", async () => {
    const f = vi.fn<typeof fetch>(async () => sse([W.completed]));
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
    // 봉투는 실측, 델타 내용(모델이 쓸 액션 블록)만 우리가 정한 값입니다.
    const f = vi.fn<typeof fetch>(async () => sse([
      W.delta('```action\\n{\\"name\\":\\"open_page\\",\\"args\\":{\\"path\\":\\"/plans/p1\\"}}\\n```'),
      W.completed,
    ]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [{ name: "open_page", description: "d", parameters: { type: "object", properties: {} } }] }));
    expect(ev.find((e) => e.type === "tool_call")).toMatchObject({ name: "open_page", args: { path: "/plans/p1" } });
    // json 모드에서는 tools 필드를 보내지 않는다
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string).tools).toBeUndefined();
    delete process.env.AGENT_TOOL_MODE;
  });
});

// ── 추가 테스트 ─────────────────────────────────────────────────────────────

const OPEN_PAGE: ToolSchema = {
  name: "open_page",
  description: "사이트의 특정 경로를 연다",
  parameters: { type: "object", properties: { path: { type: "string", description: "예: /plans/abc" } }, required: ["path"] },
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

describe("codex 공급자 — 실측 스트림 형태", () => {
  it("response.completed 로 done 을 낸다 ([DONE] 센티널은 오지 않는다)", async () => {
    const f = vi.fn(async () => sse([W.created, W.inProgress, W.delta("네"), W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(ev.map((e) => e.type)).toEqual(["text", "done"]);
  });

  it("completed 뒤에 더 와도 읽지 않고 끝낸다", async () => {
    const f = vi.fn(async () => sse([W.delta("끝"), W.completed, W.delta("이건 오면 안 된다", 99)]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(texts(ev)).toEqual(["끝"]);
    expect(ev.filter((e) => e.type === "done")).toHaveLength(1);
    expect(ev.at(-1)!.type).toBe("done");
  });

  it("[DONE] 센티널이 오더라도 무해하게 끝낸다", async () => {
    const f = vi.fn(async () => sse([W.delta("안녕"), "data: [DONE]"]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(ev.map((e) => e.type)).toEqual(["text", "done"]);
  });

  it("스트림이 종료 이벤트 없이 닫혀도 done 으로 마무리한다", async () => {
    const f = vi.fn(async () => sse([W.delta("끊김")]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    expect((await drain(p.sendTurn({ system: "s", messages: [], tools: [] }))).at(-1)!.type).toBe("done");
  });

  it("reasoning 항목·모르는 타입·깨진 프레임에도 죽지 않는다", async () => {
    const f = vi.fn(async () => sse([
      W.created,
      W.inProgress,
      W.reasoningAdded,
      W.reasoningDone,
      "event: response.무언가새로운\ndata: {\"type\":\"response.무언가새로운\",\"foo\":1}",
      "data: 이건 JSON 이 아니다",
      W.msgAdded,
      W.partAdded,
      W.delta("안"),
      W.delta("녕", 5),
      W.textDone("안녕"),
      W.partDone("안녕"),
      W.msgDone("안녕"),
      W.completed,
    ]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(texts(ev)).toEqual(["안", "녕"]); // 사고 과정·완성본 중복 없음
    expect(JSON.stringify(ev)).not.toContain("gAAAAAB"); // 암호문이 새어 나가지 않는다
    expect(ev.at(-1)!.type).toBe("done");
  });
});

describe("codex 공급자 — 네이티브 도구 호출 (실측 순서)", () => {
  it("output_item.done 에서 call_id·name·파싱된 args 를 담아 한 번만 낸다", async () => {
    const f = vi.fn(async () => sse(TOOL_CALL_STREAM));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [OPEN_PAGE] }));
    const calls = ev.filter((e) => e.type === "tool_call");
    expect(calls).toHaveLength(1);
    // id 는 item.id(fc_…)가 아니라 call_id(call_…) — 결과를 되돌려줄 때 짝이 되는 값
    expect(calls[0]).toMatchObject({ id: CALL_ID, name: "open_page", args: { path: "/plans/bali" } });
    expect(ev.at(-1)!.type).toBe("done");
  });

  it("arguments 가 깨져 있어도 던지지 않고 빈 인자로 올린다", async () => {
    const broken = W.fcDone.replace('{\\"path\\":\\"/plans/bali\\"}', "{이건 JSON 이 아님");
    const f = vi.fn(async () => sse([W.fcAdded, broken, W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [OPEN_PAGE] }));
    expect(ev.filter((e) => e.type === "tool_call")).toHaveLength(1);
    expect(ev.find((e) => e.type === "tool_call")).toMatchObject({ name: "open_page", args: {} });
    expect(ev.at(-1)!.type).toBe("done");
  });

  it("델타 없이 완성본만 와도 텍스트를 한 번 낸다", async () => {
    const f = vi.fn(async () => sse([W.msgDone("다 됐어요"), W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    expect(texts(await drain(p.sendTurn({ system: "s", messages: [], tools: [] })))).toEqual(["다 됐어요"]);
  });

  it("평평한 function 스키마를 보내고 strict 는 보내지 않는다", async () => {
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "s", messages: [], tools: [OPEN_PAGE] }));
    expect(bodyOf(f, 0).tools[0]).toMatchObject({ type: "function", name: "open_page", parameters: { type: "object" } });
    // 실측에서 properties 없는 느슨한 스키마도 통과했다. strict 를 켜면 오히려 거부된다.
    expect(bodyOf(f, 0).tools[0].strict).toBeUndefined();
  });
});

describe("codex 공급자 — 토큰·재시도", () => {
  it("401 이면 토큰을 다시 받아 한 번만 재시도한다", async () => {
    let n = 0;
    const f = vi.fn(async () => (++n === 1 ? new Response("{}", { status: 401 }) : sse([W.completed])));
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
    process.env.AGENT_MODEL = "다른-모델";
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(bodyOf(f, 0).model).toBe("다른-모델");
  });

  it("계정 id 가 있으면 chatgpt-account-id 헤더를 붙인다", async () => {
    process.env.AGENT_ACCOUNT_ID = "acc_1";
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(headersOf(f, 0)["chatgpt-account-id"]).toBe("acc_1");
  });
});

describe("codex 공급자 — auto 모드 강등 (실측으로는 안 밟히는 안전망)", () => {
  it("도구 때문에 4xx 가 나면 json 모드로 한 번 내려간다", async () => {
    let n = 0;
    const f = vi.fn(async () =>
      ++n === 1
        ? new Response(JSON.stringify({ error: { message: "tools is not supported" } }), { status: 400 })
        : sse([W.delta("네"), W.completed])
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
});

describe("codex 공급자 — 액션 블록 파싱 (json 모드 전용)", () => {
  it("여러 델타에 쪼개진 액션 블록도 모아서 읽는다", async () => {
    process.env.AGENT_TOOL_MODE = "json";
    const f = vi.fn(async () => sse([
      W.delta("잠시만요 ", 4),
      W.delta("```ac", 5),
      W.delta('tion\\n{\\"name\\":\\"open_', 6),
      W.delta('page\\",\\"args\\":{\\"path\\":\\"/plans/p1\\"}}\\n', 7),
      W.delta("```", 8),
      W.completed,
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
      W.delta('{\\"name\\":\\"open_page\\",\\"args\\":{\\"path\\":\\"/plans/p2\\"}}'),
      W.completed,
    ]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [OPEN_PAGE] }));
    expect(ev.find((e) => e.type === "tool_call")).toMatchObject({ name: "open_page", args: { path: "/plans/p2" } });
    expect(texts(ev)).toEqual([]);
  });

  it("액션이 아닌 코드 블록은 원문 그대로 텍스트로 돌려준다", async () => {
    process.env.AGENT_TOOL_MODE = "json";
    const f = vi.fn(async () => sse([
      W.delta("예시예요\\n```ts\\nconst a = 1;\\n```\\n끝"),
      W.completed,
    ]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [OPEN_PAGE] }));
    expect(ev.filter((e) => e.type === "tool_call")).toHaveLength(0);
    expect(texts(ev).join("")).toBe("예시예요\n```ts\nconst a = 1;\n```\n끝");
  });
});

describe("codex 공급자 — 히스토리 평탄화", () => {
  const history = [
    { role: "user" as const, content: "발리 계획 좀 열어줘" },
    { role: "assistant" as const, content: "", toolCalls: [{ id: CALL_ID, name: "open_page", args: { path: "/plans/bali" } }] },
    { role: "tool" as const, content: '{"ok":true,"title":"발리"}', toolCallId: CALL_ID },
  ];

  it("tool 역할은 user 로 평탄화하고 표식을 붙인다", async () => {
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "s", messages: history, tools: [OPEN_PAGE] }));
    const input = bodyOf(f, 0).input as { role: string; content: string }[];
    expect(input).toHaveLength(3);
    expect(input.map((i) => i.role)).toEqual(["user", "assistant", "user"]);
    expect(input[2].content).toContain("[도구 결과]");
    expect(input[2].content).toContain("발리");
    expect(input[1].content).toContain("[도구 호출] open_page");
  });

  it("json 모드에서는 지난 도구 호출을 action 블록으로 되돌린다", async () => {
    process.env.AGENT_TOOL_MODE = "json";
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "s", messages: history, tools: [OPEN_PAGE] }));
    const input = bodyOf(f, 0).input as { content: string }[];
    expect(input[1].content).toContain("```action");
    expect(input[1].content).toContain("open_page");
  });
});
