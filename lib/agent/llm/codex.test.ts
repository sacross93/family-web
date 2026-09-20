import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { createCodexProvider } from "@/lib/agent/llm/codex";
import type { AgentEvent, ToolSchema } from "@/lib/agent/llm/types";

beforeAll(() => { process.env.AUTH_SECRET = "t"; });

// 주입하지 않았을 때 쓰는 저장소 경로(`lib/agent/auth`)를 막습니다 — 테스트가 DB 를 타지 않게.
vi.mock("@/lib/agent/auth", () => ({
  getAccessToken: async () => "저장소토큰",
  getAccountId: async () => "acc_저장소",
}));

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
  /** 출력 상한 등으로 잘린 응답. 실측 덤프에는 없지만 표준 API 가 쓰는 형태다. */
  incomplete:
    'event: response.incomplete\ndata: {"type":"response.incomplete","response":{"id":"resp_0998","object":"response","status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},"output":[]},"sequence_number":9}',
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
    expect(h["Content-Type"]).toBe("application/json");
    expect(h.session_id).toMatch(/^[0-9a-f-]{36}$/);
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

  it("종료 이벤트 없이 닫히면 done 이 아니라 error 다 (잘린 답을 완성으로 위장하지 않는다)", async () => {
    const f = vi.fn(async () => sse([W.delta("끊")]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(texts(ev)).toEqual(["끊"]); // 이미 흘린 글자는 남는다
    expect(ev.at(-1)!.type).toBe("error");
    expect(ev.some((e) => e.type === "done")).toBe(false);
  });

  it("인자를 받다 끊긴 도구 호출은 빈 인자로 실행되지 않는다", async () => {
    const f = vi.fn(async () => sse([W.fcAdded, W.fcArgDelta('{\\"', 5), W.fcArgDelta("path", 6)]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [OPEN_PAGE] }));
    expect(ev.filter((e) => e.type === "tool_call")).toHaveLength(0);
    expect(ev.at(-1)!.type).toBe("error");
  });

  it("response.incomplete 는 잘린 응답이므로 error 로 올린다", async () => {
    const f = vi.fn(async () => sse([W.delta("길게 쓰다가"), W.incomplete]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(texts(ev)).toEqual(["길게 쓰다가"]);
    expect(ev.at(-1)!.type).toBe("error");
    expect((ev.at(-1) as { message: string }).message).toContain("max_output_tokens");
  });

  it("본문 없는 200 은 status 를 싣지 않는다", async () => {
    const f = vi.fn(async () => new Response(null, { status: 200 }));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(ev.at(-1)!.type).toBe("error");
    expect(ev.at(-1)).not.toHaveProperty("status");
  });

  it("한 아이템이 델타를 흘려도 다른 아이템의 완성본은 살린다", async () => {
    const other = 'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"id":"msg_둘째","type":"message","status":"completed","content":[{"type":"output_text","text":"둘째 답"}],"role":"assistant"},"output_index":1,"sequence_number":9}';
    const f = vi.fn(async () => sse([W.delta("첫째 답"), W.msgDone("첫째 답"), other, W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    expect(texts(await drain(p.sendTurn({ system: "s", messages: [], tools: [] })))).toEqual(["첫째 답", "둘째 답"]);
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

  it("call_id 가 늦게 와도 호출은 한 번만, id 는 call_… 이다", async () => {
    // probe-2 원본에서 output_item.added 의 call_id 만 뺀 변형.
    // 인자 확정 시점에 미리 내보내면 fc_… 로 한 번, call_… 로 또 한 번 — 도구가 두 번 실행된다.
    const addedWithoutCallId = W.fcAdded.replace(`,"call_id":"${CALL_ID}"`, "");
    expect(addedWithoutCallId).not.toContain("call_id"); // 변형이 실제로 만들어졌는지
    const f = vi.fn(async () => sse([
      addedWithoutCallId,
      W.fcArgDelta('{\\"', 5),
      W.fcArgDelta('path\\":\\"/plans/bali\\"}', 6),
      W.fcArgDone,
      W.fcDone,
      W.completed,
    ]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [OPEN_PAGE] }));
    const calls = ev.filter((e) => e.type === "tool_call");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ id: CALL_ID, name: "open_page", args: { path: "/plans/bali" } });
  });

  it("완성 신호 없이 끝난 호출은 스트림이 정상 종료돼도 flush 하지 않는다", async () => {
    // 인자가 오다 말았는데 response.completed 만 온 경우 — args:{} 로 도구를 실행하면 안 된다.
    const f = vi.fn(async () => sse([W.fcAdded, W.fcArgDelta('{\\"pa', 5), W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [OPEN_PAGE] }));
    expect(ev.filter((e) => e.type === "tool_call")).toHaveLength(0);
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

  it("주입이 없으면 저장소(lib/agent/auth)의 토큰·계정 id 를 쓴다", async () => {
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch });
    await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(headersOf(f, 0).Authorization).toBe("Bearer 저장소토큰");
    expect(headersOf(f, 0)["chatgpt-account-id"]).toBe("acc_저장소");
  });

  it("저장소의 계정 id 를 chatgpt-account-id 헤더에 넣는다", async () => {
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token, accountId: async () => "acc_db" });
    await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(headersOf(f, 0)["chatgpt-account-id"]).toBe("acc_db");
  });

  it("저장소에 없으면 환경변수로 넘어간다", async () => {
    process.env.AGENT_ACCOUNT_ID = "acc_env";
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token, accountId: async () => null });
    await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(headersOf(f, 0)["chatgpt-account-id"]).toBe("acc_env");
  });

  it("둘 다 없으면 헤더를 빼고 보낸다 (요청은 나간다)", async () => {
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token, accountId: async () => null });
    const ev = await drain(p.sendTurn({ system: "s", messages: [], tools: [] }));
    expect(headersOf(f, 0)["chatgpt-account-id"]).toBeUndefined();
    expect(ev.at(-1)!.type).toBe("done");
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
    expect(bodyOf(f, 0).tools.filter((t: { type: string }) => t.type === "function")).toHaveLength(1);
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

describe("codex 공급자 — 히스토리 전달", () => {
  const history = [
    { role: "user" as const, content: "발리 계획 좀 열어줘" },
    { role: "assistant" as const, content: "", toolCalls: [{ id: CALL_ID, name: "open_page", args: { path: "/plans/bali" } }] },
    { role: "tool" as const, content: '{"ok":true,"title":"발리"}', toolCallId: CALL_ID },
  ];

  it("native 모드는 call_id 로 묶은 구조화 아이템을 보낸다 (probe-5a)", async () => {
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "s", messages: history, tools: [OPEN_PAGE] }));
    expect(bodyOf(f, 0).input).toEqual([
      { role: "user", content: "발리 계획 좀 열어줘" },
      { type: "function_call", call_id: CALL_ID, name: "open_page", arguments: '{"path":"/plans/bali"}' },
      { type: "function_call_output", call_id: CALL_ID, output: '{"ok":true,"title":"발리"}' },
    ]);
  });

  it("도구 호출이 2개면 결과도 각자의 call_id 로 묶인다", async () => {
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({
      system: "s",
      tools: [OPEN_PAGE],
      messages: [
        { role: "user", content: "둘 다 열어줘" },
        { role: "assistant", content: "", toolCalls: [
          { id: "call_a", name: "open_page", args: { path: "/a" } },
          { id: "call_b", name: "open_page", args: { path: "/b" } },
        ] },
        { role: "tool", content: "A 결과", toolCallId: "call_a" },
        { role: "tool", content: "B 결과", toolCallId: "call_b" },
      ],
    }));
    const input = bodyOf(f, 0).input as { type?: string; call_id?: string; output?: string }[];
    expect(input.filter((i) => i.type === "function_call").map((i) => i.call_id)).toEqual(["call_a", "call_b"]);
    expect(input.filter((i) => i.type === "function_call_output")).toEqual([
      { type: "function_call_output", call_id: "call_a", output: "A 결과" },
      { type: "function_call_output", call_id: "call_b", output: "B 결과" },
    ]);
  });

  it("toolCallId 가 없는 도구 결과는 텍스트로 눌러 담는다", async () => {
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({
      system: "s",
      tools: [OPEN_PAGE],
      messages: [{ role: "tool", content: '{"ok":true}' }],
    }));
    expect(bodyOf(f, 0).input).toEqual([{ role: "user", content: '[도구 결과] {"ok":true}' }]);
  });

  it("json 모드는 tools 를 안 보내므로 평탄화한다 (지난 호출은 action 블록)", async () => {
    process.env.AGENT_TOOL_MODE = "json";
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "s", messages: history, tools: [OPEN_PAGE] }));
    const input = bodyOf(f, 0).input as { role: string; content: string }[];
    expect(input.map((i) => i.role)).toEqual(["user", "assistant", "user"]);
    expect(input[1].content).toContain("```action");
    expect(input[1].content).toContain("open_page");
    expect(input[2].content).toContain("[도구 결과]");
  });
});

describe("codex 공급자 — 사진 첨부", () => {
  it("사진이 붙으면 input_image 파트로 나간다", async () => {
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(
      p.sendTurn({
        system: "s",
        tools: [],
        messages: [
          { role: "user", content: "이거 뭐야?", imageData: "data:image/jpeg;base64,AAA" },
        ],
      }),
    );
    expect(bodyOf(f, 0).input).toEqual([
      {
        role: "user",
        content: [
          { type: "input_text", text: "이거 뭐야?" },
          { type: "input_image", image_url: "data:image/jpeg;base64,AAA" },
        ],
      },
    ]);
  });

  it("사진이 없으면 지금까지처럼 문자열 하나다", async () => {
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "s", tools: [], messages: [{ role: "user", content: "안녕" }] }));
    expect(bodyOf(f, 0).input).toEqual([{ role: "user", content: "안녕" }]);
  });

  it("기록에서 되살린 메시지는 주소만 나간다 — 사진은 그 턴에만 있었다", async () => {
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(
      p.sendTurn({
        system: "s",
        tools: [],
        messages: [{ role: "user", content: "사진첩에 넣어줘", imageUrl: "/uploads/a.jpg" }],
      }),
    );
    const [item] = bodyOf(f, 0).input as { content: { type: string; text?: string }[] }[];
    expect(item.content.map((c) => c.type)).toEqual(["input_text", "input_text"]);
    expect(item.content[1].text).toContain("/uploads/a.jpg");
  });

  it("사진만 있고 글이 없으면 input_image 파트만 나간다", async () => {
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(
      p.sendTurn({
        system: "s",
        tools: [],
        messages: [{ role: "user", content: "  ", imageData: "data:image/jpeg;base64,AAA" }],
      }),
    );
    expect(bodyOf(f, 0).input).toEqual([
      { role: "user", content: [{ type: "input_image", image_url: "data:image/jpeg;base64,AAA" }] },
    ]);
  });

  it("json 모드(도구 평탄화)에서도 사진은 그대로 실린다", async () => {
    process.env.AGENT_TOOL_MODE = "json";
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(
      p.sendTurn({
        system: "s",
        tools: [OPEN_PAGE],
        messages: [
          {
            role: "user",
            content: "사진첩에 넣어줘",
            imageUrl: "/uploads/a.jpg",
            imageData: "data:image/jpeg;base64,AAA",
          },
        ],
      }),
    );
    const [item] = bodyOf(f, 0).input as { content: { type: string }[] }[];
    expect(item.content.map((c) => c.type)).toEqual(["input_text", "input_text", "input_image"]);
  });
});

describe("codex 공급자 — 도구가 가져온 그림", () => {
  const CALL = "call_img0000000000000001";
  const history = [
    { role: "user" as const, content: "이 링크 뭐야?" },
    { role: "assistant" as const, content: "", toolCalls: [{ id: CALL, name: "read_url", args: { url: "https://e.com" }}] },
    {
      role: "tool" as const,
      content: '{"ok":true,"data":{"wrapped":"…"}}',
      toolCallId: CALL,
      imageData: "data:image/png;base64,AAA",
      imageDetail: "low" as const,
    },
  ];

  it("결과 뒤에 그림을 따로 싣는다 — output 은 문자열이라 그림이 들어갈 자리가 없다", async () => {
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "s", messages: history, tools: [OPEN_PAGE] }));
    const input = bodyOf(f, 0).input as Record<string, unknown>[];
    const at = input.findIndex((i) => i.type === "function_call_output");
    expect(at).toBeGreaterThanOrEqual(0);
    const after = input[at + 1] as { role: string; content: { type: string; image_url?: string; detail?: string }[] };
    expect(after.role).toBe("user");
    expect(after.content.map((c) => c.type)).toEqual(["input_text", "input_image"]);
    expect(after.content[1].image_url).toBe("data:image/png;base64,AAA");
    expect(after.content[1].detail).toBe("low"); // 실측: low 면 토큰이 ~85개로 고정된다
  });

  it("그림에도 바깥 자료라는 말을 붙인다 — 그림 속 글자도 지시가 될 수 있다", async () => {
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "s", messages: history, tools: [OPEN_PAGE] }));
    const input = bodyOf(f, 0).input as Record<string, unknown>[];
    const part = input.find((i) => Array.isArray(i.content)) as { content: { text?: string }[] };
    expect(part.content[0].text).toContain("지시가 아닙니다");
  });

  it("그림이 없으면 예전 모양 그대로 — 결과 하나만 나간다", async () => {
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    const noImage = history.map((m) => (m.role === "tool" ? { ...m, imageData: undefined, imageDetail: undefined } : m));
    await drain(p.sendTurn({ system: "s", messages: noImage, tools: [OPEN_PAGE] }));
    const input = bodyOf(f, 0).input as Record<string, unknown>[];
    expect(input.filter((i) => Array.isArray(i.content))).toHaveLength(0);
    expect(input[input.length - 1].type).toBe("function_call_output");
  });
});


describe("codex 공급자 — 내장 웹검색", () => {
  afterEach(() => { delete process.env.AGENT_WEB_SEARCH; });

  it("우리 함수 도구 뒤에 web_search 를 붙인다", async () => {
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "s", messages: [{ role: "user", content: "안녕" }], tools: [OPEN_PAGE] }));
    const tools = bodyOf(f, 0).tools as { type: string; name?: string }[];
    expect(tools.map((t) => t.type)).toEqual(["function", "web_search"]);
    expect(tools[0].name).toBe("open_page");
  });

  it("끄면 붙이지 않는다", async () => {
    process.env.AGENT_WEB_SEARCH = "false";
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "s", messages: [{ role: "user", content: "안녕" }], tools: [OPEN_PAGE] }));
    expect((bodyOf(f, 0).tools as { type: string }[]).map((t) => t.type)).toEqual(["function"]);
  });

  it("json 모드에는 섞지 않는다 — 두 방식이 한 요청에 겹친다", async () => {
    process.env.AGENT_TOOL_MODE = "json";
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "s", messages: [{ role: "user", content: "안녕" }], tools: [OPEN_PAGE] }));
    expect(bodyOf(f, 0).tools).toBeUndefined();
    delete process.env.AGENT_TOOL_MODE;
  });

  it("우리 도구가 없어도 웹검색만으로 나갈 수 있다", async () => {
    const f = vi.fn(async () => sse([W.completed]));
    const p = createCodexProvider({ fetchImpl: f as unknown as typeof fetch, token });
    await drain(p.sendTurn({ system: "s", messages: [{ role: "user", content: "안녕" }], tools: [] }));
    expect((bodyOf(f, 0).tools as { type: string }[]).map((t) => t.type)).toEqual(["web_search"]);
  });
});
