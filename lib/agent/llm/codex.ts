// ChatGPT 계정(OAuth)으로 Codex 백엔드를 부르는 LLM 공급자.
//
// 와이어 포맷은 2026-09-18 실측으로 확정했습니다 —
// `.superpowers/sdd/2026-09-17-site-agent-engine/WIRE-FINDINGS.md` (원시 덤프 probe-1~4).
// 비공식 엔드포인트라 언제든 바뀔 수 있지만, 바뀌어도 고칠 곳은 이 파일뿐입니다.
// 루프·도구·화면은 정규화된 AgentEvent 만 보므로 영향받지 않습니다.
// ⚠️ 토큰 값은 로그·에러 메시지·반환값에 **절대** 넣지 않습니다. 사용자 본인의 ChatGPT 세션입니다.
//
// 파싱은 일부러 관대합니다 — 모르는 이벤트는 조용히 무시하고, 필드가 없으면 대안을 봅니다.
// 알 수 없는 모양 하나 때문에 대화 전체가 죽는 일이 없어야 합니다.

import { randomUUID } from "node:crypto";
import { agentConfig } from "../config";
import type { AgentEvent, AgentMessage, LlmProvider, SendTurnInput, ToolSchema } from "./types";

const ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
const ORIGINATOR = "codex_cli_rs";

/** 평탄화한 도구 결과·도구 호출에 붙는 표식. json 모드 안내문과 짝을 이룹니다. */
const TOOL_RESULT_PREFIX = "[도구 결과]";
const TOOL_CALL_PREFIX = "[도구 호출]";

/** 이 파일 안에서만 쓰는 실제 전송 모드. `auto` 는 native 로 시작해 필요하면 json 으로 내려갑니다. */
type WireToolMode = "native" | "json";

export interface CodexProviderOptions {
  /** 테스트·계측용 fetch 주입. 없으면 전역 fetch. */
  fetchImpl?: typeof fetch;
  /** 테스트용 토큰 주입. 없으면 `lib/agent/auth` 의 저장소를 씁니다(지연 import — 테스트가 DB 를 타지 않게). */
  token?: () => Promise<string>;
  /** 테스트용 계정 id 주입. 없으면 `lib/agent/auth` 의 `getAccountId()`(지연 import). */
  accountId?: () => Promise<string | null>;
}

// ── 작은 도우미 ──────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** 자유 텍스트 → 인자 객체. 못 읽으면 빈 객체(도구 쪽 검증이 모델에게 되돌려 줍니다). */
function parseArgs(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return asObject(JSON.parse(raw)) ?? {};
  } catch {
    return {};
  }
}

// ── 요청 만들기 ──────────────────────────────────────────────────────────────

interface InputItem {
  role: "user" | "assistant";
  content: string;
}

/**
 * 대화 기록 → 요청 본문의 `input` 배열. **평탄화 규칙은 전부 여기 모여 있습니다.**
 *
 * 백엔드가 `role:"tool"` 과 네이티브 function_call/`function_call_output` 아이템을 받는지는
 * 아직 확인하지 않았으므로(실측은 단일 턴만 했습니다), 지금은 전부 사람이 읽는 텍스트로 눌러 담습니다.
 * 나중에 바꿀 곳도 이 함수 하나입니다 — tool 역할을 그대로 받는다면 아래 user 평탄화만 걷어내면 됩니다.
 */
function toInputItems(messages: AgentMessage[], mode: WireToolMode): InputItem[] {
  return messages.flatMap((message) => {
    const text = renderMessage(message, mode);
    return text.trim() ? [item(message.role === "assistant" ? "assistant" : "user", text)] : [];
  });
}

/**
 * 실측(probe-1)에서 200 을 받은 모양: `{role, content: "…"}`.
 * content 는 파트 배열(`[{type:"input_text"|"input_image", …}]`)도 받습니다(probe-4) —
 * 2단계에서 화면 캡처를 붙일 때 이미지가 그 자리로 들어옵니다.
 */
function item(role: "user" | "assistant", text: string): InputItem {
  return { role, content: text };
}

function renderMessage(message: AgentMessage, mode: WireToolMode): string {
  if (message.role === "tool") return `${TOOL_RESULT_PREFIX} ${message.content}`.trim();
  if (message.role === "assistant" && message.toolCalls?.length) {
    // 이전 턴의 도구 호출도 지금 모드와 같은 모양으로 되돌려 줘야 모델이 자기 말투를 이어갑니다.
    const calls = message.toolCalls.map((call) =>
      mode === "json"
        ? actionBlock(call.name, call.args)
        : `${TOOL_CALL_PREFIX} ${call.name}(${JSON.stringify(call.args ?? {})})`
    );
    return [message.content, ...calls].filter((part) => part && part.trim()).join("\n");
  }
  return message.content;
}

function actionBlock(name: string, args: Record<string, unknown>): string {
  return ["```action", JSON.stringify({ name, args: args ?? {} }), "```"].join("\n");
}

/**
 * 네이티브 도구 스키마. Responses API 는 function 필드를 감싸지 않는 **평평한** 모양입니다.
 * ⚠️ `strict` 는 일부러 보내지 않습니다(비엄격 기본값). `create_item` 의 `args` 는 properties 가 없는
 *    `{type:"object"}` 라서 strict 모드가 스키마를 거부합니다 — 켜면 4xx 를 맞고 json 모드로 헛되이 강등됩니다.
 */
function toolsField(tools: ToolSchema[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

/** json 모드 안내문. 도구 목록과 `action` 블록 사용법을 안내문 뒤에 붙입니다. */
function withJsonToolGuide(system: string, tools: ToolSchema[]): string {
  if (!tools.length) return system;
  const lines = tools.map((tool) => {
    const required = new Set(tool.parameters.required ?? []);
    const args = Object.entries(tool.parameters.properties ?? {}).map(([key, spec]) => {
      const choices = spec.enum?.length ? ` [${spec.enum.join(" | ")}]` : "";
      return `${key}(${spec.type}${required.has(key) ? ", 필수" : ""}) — ${spec.description}${choices}`;
    });
    return `- ${tool.name}: ${tool.description}${args.length ? `\n  인자: ${args.join(" / ")}` : ""}`;
  });

  return `${system}

## 쓸 수 있는 도구
${lines.join("\n")}

도구가 필요하면 **다른 말 없이** 아래 형식의 코드 블록 하나만 출력하세요.
\`\`\`action
{"name": "도구이름", "args": {"인자": "값"}}
\`\`\`
결과는 다음 차례에 "${TOOL_RESULT_PREFIX}" 로 전달됩니다. 도구가 필요 없으면 평소처럼 한국어로 답하세요.`;
}

function buildBody(input: SendTurnInput, mode: WireToolMode): Json {
  const body: Json = {
    model: agentConfig().model,
    stream: true,
    store: false,
    instructions: mode === "json" ? withJsonToolGuide(input.system, input.tools) : input.system,
    input: toInputItems(input.messages, mode),
  };
  if (mode === "native" && input.tools.length) body.tools = toolsField(input.tools);
  return body;
}

/**
 * `chatgpt-account-id` 헤더 값: 저장소(`AgentAuth.accountId`) → `AGENT_ACCOUNT_ID` 환경변수 → 생략.
 * 토큰을 주입 시점에 한 번 파싱해 넣어 둔 평문 값이라 요청마다 다시 디코드하지 않습니다.
 * 저장소를 못 읽어도 헤더만 빠지고 요청은 나갑니다.
 */
async function resolveAccountId(read: () => Promise<string | null>): Promise<string | null> {
  try {
    const stored = await read();
    if (stored) return stored;
  } catch {
    // 토큰이 아직 안 들어왔을 수 있습니다 — 환경변수로 넘어갑니다.
  }
  return process.env.AGENT_ACCOUNT_ID || null;
}

function buildHeaders(accessToken: string, sessionId: string, accountId: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    originator: ORIGINATOR,
    session_id: sessionId,
    // 실측(WIRE-FINDINGS §6)에서 200 을 받은 헤더 조합 그대로입니다.
    // `OpenAI-Beta: responses=experimental` 없이 통과했으므로 일부러 넣지 않습니다.
  };
  if (accountId) headers["chatgpt-account-id"] = accountId;
  return headers;
}

// ── 오류 ────────────────────────────────────────────────────────────────────

const ERROR_BODY_MAX = 2000;

async function readBodySafe(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, ERROR_BODY_MAX);
  } catch {
    return "";
  }
}

/** 오류 본문에서 짧은 코드만 뽑습니다. 본문을 그대로 사용자에게 보여주지 않습니다. */
function errorCode(bodyText: string): string | null {
  try {
    const body = asObject(JSON.parse(bodyText));
    const error = asObject(body?.error);
    const raw =
      asString(error?.type) ?? asString(error?.code) ?? asString(body?.code) ?? asString(body?.type);
    return raw && /^[a-z0-9_.-]{1,40}$/i.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

function httpError(status: number, bodyText: string): AgentEvent {
  const code = errorCode(bodyText);
  const tail = code ? ` · ${code}` : "";
  const message =
    status === 401
      ? `ChatGPT 인증이 만료됐어요. 토큰을 다시 넣어 주세요 (HTTP 401${tail}).`
      : status === 403
        ? `이 ChatGPT 계정에는 요청 권한이 없어요 (HTTP 403${tail}).`
        : status === 429
          ? `ChatGPT 사용량 한도를 다 썼어요 (HTTP 429${tail}). 잠시 뒤에 다시 시도해 주세요.`
          : status >= 500
            ? `ChatGPT 서버가 잠시 불안정해요 (HTTP ${status}${tail}). 조금 뒤에 다시 시도해 주세요.`
            : `모델 서버가 요청을 거절했어요 (HTTP ${status}${tail}).`;
  return { type: "error", message, status };
}

/** 4xx 가 "도구 때문"으로 보이면 json 모드로 내려갑니다. 인증·사용량 오류는 형식 문제가 아닙니다. */
function looksLikeToolRejection(status: number, bodyText: string): boolean {
  if (status < 400 || status >= 500) return false;
  if (status === 401 || status === 403 || status === 429) return false;
  return /tool|function[_ -]?call/i.test(bodyText);
}

// ── SSE ─────────────────────────────────────────────────────────────────────

/** 빈 줄로 끊기는 SSE 프레임에서 data 부분만 꺼냅니다. event:·id:·주석 줄은 무시합니다. */
function dataOfFrame(frame: string): string | null {
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  return data.length ? data.join("\n") : null;
}

async function* sseFrames(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
      let end = buffer.indexOf("\n\n");
      while (end >= 0) {
        const data = dataOfFrame(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (data !== null) yield data;
        end = buffer.indexOf("\n\n");
      }
    }
    const tail = dataOfFrame(buffer + decoder.decode());
    if (tail !== null) yield tail;
  } finally {
    // 사용자가 도중에 창을 닫으면 상류 연결도 끊어야 합니다(할당량을 계속 태우지 않게).
    await reader.cancel().catch(() => {});
  }
}

// ── json 모드: ```action 블록 걸러내기 ───────────────────────────────────────

const FENCE = "```";

/**
 * 텍스트 델타를 흘려보내면서 ```action 블록만 가로채 tool_call 로 바꿉니다.
 * 파싱에 실패한 블록은 **삼키지 않고** 원문 그대로 텍스트로 돌려보냅니다.
 */
class ActionFilter {
  private state: "start" | "text" | "fence" | "bare" = "start";
  private buffer = "";
  private info: string | null = null;

  feed(chunk: string): AgentEvent[] {
    this.buffer += chunk;
    const events: AgentEvent[] = [];
    for (;;) {
      if (this.state === "start") {
        const trimmed = this.buffer.trimStart();
        if (!trimmed) return events;
        // 울타리를 잊고 JSON 만 뱉는 모델도 있습니다. 그때는 전부 모아 끝에서 판단합니다.
        this.state = trimmed.startsWith("{") ? "bare" : "text";
        continue;
      }
      if (this.state === "bare") return events;
      if (this.state === "text") {
        const open = this.buffer.indexOf(FENCE);
        if (open < 0) {
          const hold = this.partialFenceTail();
          const text = this.buffer.slice(0, this.buffer.length - hold);
          this.buffer = this.buffer.slice(this.buffer.length - hold);
          if (text) events.push({ type: "text", delta: text });
          return events;
        }
        const before = this.buffer.slice(0, open);
        if (before) events.push({ type: "text", delta: before });
        this.buffer = this.buffer.slice(open + FENCE.length);
        this.state = "fence";
        this.info = null;
        continue;
      }
      // state === "fence"
      if (this.info === null) {
        const newline = this.buffer.indexOf("\n");
        if (newline < 0) return events;
        this.info = this.buffer.slice(0, newline).trim();
        this.buffer = this.buffer.slice(newline + 1);
      }
      const close = this.buffer.indexOf(FENCE);
      if (close < 0) return events;
      const block = this.buffer.slice(0, close);
      this.buffer = this.buffer.slice(close + FENCE.length);
      events.push(...this.closeFence(block));
      this.state = "text";
      this.info = null;
    }
  }

  flush(): AgentEvent[] {
    if (this.state === "bare") {
      const call = toToolCall(this.buffer, "action");
      const events = call ? [call] : this.buffer.trim() ? [{ type: "text" as const, delta: this.buffer }] : [];
      this.buffer = "";
      return events;
    }
    if (this.state === "fence") {
      // 닫히지 않은 블록 — 내용을 잃지 않게 원문으로 되돌립니다.
      const events = this.closeFence(this.buffer, false);
      this.buffer = "";
      this.info = null;
      this.state = "text";
      return events;
    }
    const rest = this.buffer;
    this.buffer = "";
    return rest ? [{ type: "text", delta: rest }] : [];
  }

  private closeFence(block: string, closed = true): AgentEvent[] {
    const call = toToolCall(block, this.info ?? "");
    if (call) return [call];
    // 액션으로 읽히지 않으면 울타리까지 원문 그대로 되돌립니다(평범한 코드 블록일 수 있으므로).
    const head = this.info === null ? FENCE : `${FENCE}${this.info}\n`;
    return [{ type: "text", delta: `${head}${block}${closed ? FENCE : ""}` }];
  }

  /** 아직 다 오지 않은 울타리 조각(` 또는 ``)은 내보내지 않고 들고 있습니다. */
  private partialFenceTail(): number {
    for (let n = Math.min(this.buffer.length, FENCE.length - 1); n > 0; n -= 1) {
      if (this.buffer.endsWith(FENCE.slice(0, n))) return n;
    }
    return 0;
  }
}

/** 블록 본문 → tool_call. 액션으로 볼 수 없으면 null(호출부가 원문을 되돌려 줍니다). */
function toToolCall(block: string, info: string): AgentEvent | null {
  const text = block.trim();
  if (!text.startsWith("{")) return null;
  let parsed: Json | null = null;
  try {
    parsed = asObject(JSON.parse(text));
  } catch {
    return null;
  }
  const name = asString(parsed?.name);
  if (!parsed || !name) return null;
  const hasArgs = "args" in parsed || "arguments" in parsed;
  // 평범한 JSON 코드 블록을 도구 호출로 오해하지 않도록: action 울타리이거나 args 가 있어야 합니다.
  if (!hasArgs && !/^(action|tool|tool_call)$/i.test(info)) return null;
  const rawArgs = parsed.args ?? parsed.arguments;
  const args = asObject(rawArgs) ?? parseArgs(asString(rawArgs));
  return { type: "tool_call", id: randomUUID(), name, args };
}

// ── 네이티브 도구 호출 조립 ─────────────────────────────────────────────────

interface PartialCall {
  callId: string | null;
  name: string | null;
  args: string;
}

/**
 * function call 이벤트는 여러 번에 나눠 옵니다(added → arguments.delta* → arguments.done →
 * output_item.done → response.completed). 이름과 인자가 모이는 **첫 순간에 한 번만** 내보냅니다.
 */
class CallAssembler {
  private partials = new Map<string, PartialCall>();
  private emitted = new Set<string>();

  private slot(itemId: string): PartialCall {
    let call = this.partials.get(itemId);
    if (!call) {
      call = { callId: null, name: null, args: "" };
      this.partials.set(itemId, call);
    }
    return call;
  }

  /** `output_item.added` — 이름만 기억하고 내보내지 않습니다(인자가 아직 안 왔을 수 있으므로). */
  register(rawItem: unknown, fallbackKey: string): void {
    this.mergeItem(rawItem, fallbackKey);
  }

  /** `output_item.done`·`response.completed` 안의 아이템 — 합치고 바로 내보냅니다. */
  absorb(rawItem: unknown, fallbackKey: string): AgentEvent[] {
    const itemId = this.mergeItem(rawItem, fallbackKey);
    return itemId ? this.tryEmit(itemId) : [];
  }

  private mergeItem(rawItem: unknown, fallbackKey: string): string | null {
    const item = asObject(rawItem);
    if (!item) return null;
    if (!/function[_-]?call/i.test(asString(item.type) ?? "")) return null;
    const itemId = asString(item.id) ?? asString(item.call_id) ?? fallbackKey;
    const call = this.slot(itemId);
    call.callId = asString(item.call_id) ?? call.callId ?? asString(item.id);
    call.name = asString(item.name) ?? call.name;
    const args = asString(item.arguments);
    if (args) call.args = args;
    return itemId;
  }

  appendArgs(itemId: string, chunk: string): void {
    this.slot(itemId).args += chunk;
  }

  setArgs(itemId: string, args: string): AgentEvent[] {
    this.slot(itemId).args = args;
    return this.tryEmit(itemId);
  }

  private tryEmit(itemId: string): AgentEvent[] {
    const call = this.partials.get(itemId);
    if (!call?.name) return [];
    const id = call.callId ?? itemId;
    this.partials.delete(itemId);
    if (this.emitted.has(id)) return []; // 같은 호출이 여러 이벤트로 다시 와도 한 번만.
    this.emitted.add(id);
    return [{ type: "tool_call", id, name: call.name, args: parseArgs(call.args) }];
  }

  /** 스트림이 끝났을 때 아직 못 내보낸 호출을 모두 털어냅니다. */
  flush(): AgentEvent[] {
    const events: AgentEvent[] = [];
    for (const itemId of [...this.partials.keys()]) events.push(...this.tryEmit(itemId));
    return events;
  }
}

// ── 이벤트 번역 ─────────────────────────────────────────────────────────────

interface StreamState {
  mode: WireToolMode;
  filter: ActionFilter;
  calls: CallAssembler;
  /** 델타를 한 번이라도 준 아이템. done 이벤트로 같은 문장이 두 번 나오지 않게 합니다. */
  deltaSeen: Set<string>;
  anyDelta: boolean;
}

/** 실측: 스트림은 `[DONE]` 센티널 없이 `response.completed` 로 끝난다. */
const TERMINAL = /response\.(completed|incomplete)$/;

function emitText(state: StreamState, text: string): AgentEvent[] {
  if (!text) return [];
  return state.mode === "json" ? state.filter.feed(text) : [{ type: "text", delta: text }];
}

/** 와이어 이벤트 하나 → 정규화 이벤트 0..n 개. 모르는 이벤트는 빈 배열입니다. */
function translate(event: Json, state: StreamState): AgentEvent[] {
  const type = asString(event.type) ?? "";
  // 사고 과정은 사용자에게 보여주지 않습니다.
  if (/reasoning/i.test(type)) return [];

  if (/function[_-]?call[_-]?arguments/i.test(type)) {
    const itemId = asString(event.item_id) ?? asString(event.id) ?? "call";
    if (type.endsWith(".delta")) {
      state.calls.appendArgs(itemId, asString(event.delta) ?? asString(event.text) ?? "");
      return [];
    }
    const args = asString(event.arguments) ?? asString(event.text);
    return args === null ? [] : state.calls.setArgs(itemId, args);
  }

  if (type.endsWith("output_item.added")) {
    state.calls.register(event.item, "call");
    return [];
  }

  if (type.endsWith("output_item.done")) {
    const item = asObject(event.item);
    // 실측: 도구 호출은 여기(item.type==="function_call")에서 이름·call_id·완성된 인자가 한 번에 옵니다.
    const events = state.calls.absorb(item, "call");
    if (events.length) return events;
    // 사고 과정 항목(encrypted_content 수 KB)은 통째로 버립니다.
    if (/reasoning/i.test(asString(item?.type) ?? "")) return [];
    // 델타 없이 완성본만 주는 경우 대비 — 델타를 한 번도 못 봤을 때만 본문을 꺼냅니다.
    const itemId = asString(item?.id) ?? "item";
    if (item && !state.deltaSeen.has(itemId) && !state.anyDelta) {
      return emitText(state, textOfItem(item));
    }
    return [];
  }

  if (TERMINAL.test(type)) {
    // 실측에선 `response.completed` 의 output 이 빈 배열이었지만, 채워 오는 경우도 받아 둡니다.
    const output = asObject(event.response)?.output;
    if (!Array.isArray(output)) return [];
    return output.flatMap((raw, index) => state.calls.absorb(raw, `completed:${index}`));
  }

  if (type === "error" || type.endsWith(".failed") || type.endsWith("response.error")) {
    const payload = asObject(event.error) ?? asObject(asObject(event.response)?.error);
    const code = asString(payload?.type) ?? asString(payload?.code);
    const tail = code && /^[a-z0-9_.-]{1,40}$/i.test(code) ? ` (${code})` : "";
    return [{ type: "error", message: `모델이 응답을 마치지 못했어요${tail}.` }];
  }

  if (type.endsWith(".delta")) {
    const delta = asString(event.delta) ?? asString(event.text) ?? "";
    if (!delta) return [];
    const itemId = asString(event.item_id) ?? asString(event.id);
    if (itemId) state.deltaSeen.add(itemId);
    state.anyDelta = true;
    return emitText(state, delta);
  }

  if (type.endsWith("output_text.done") || type.endsWith("text.done")) {
    const itemId = asString(event.item_id) ?? asString(event.id);
    if (state.anyDelta || (itemId && state.deltaSeen.has(itemId))) return [];
    return emitText(state, asString(event.text) ?? "");
  }

  return [];
}

/** `{content:[{text}]}` 모양에서 텍스트만 긁어 옵니다. */
function textOfItem(item: Json): string {
  const content = item.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => asString(asObject(part)?.text) ?? "")
    .join("");
}

// ── 스트림 소비 ─────────────────────────────────────────────────────────────

async function* streamEvents(res: Response, mode: WireToolMode): AsyncGenerator<AgentEvent> {
  if (!res.body) {
    yield { type: "error", message: "모델 응답이 비어 있어요. 잠시 뒤에 다시 시도해 주세요.", status: res.status };
    return;
  }
  const state: StreamState = {
    mode,
    filter: new ActionFilter(),
    calls: new CallAssembler(),
    deltaSeen: new Set(),
    anyDelta: false,
  };

  try {
    for await (const data of sseFrames(res.body)) {
      // 실측에선 오지 않지만(종료는 response.completed), 와도 무해하게 받아 둡니다.
      if (data === "[DONE]") break;
      let event: Json | null = null;
      try {
        event = asObject(JSON.parse(data));
      } catch {
        continue; // 읽을 수 없는 프레임 하나가 대화를 끊지 않게.
      }
      if (!event) continue;
      for (const out of translate(event, state)) {
        yield out;
        if (out.type === "error") return;
      }
      // 종료 신호를 받으면 더 기다리지 않고 상류 연결을 끊습니다.
      if (TERMINAL.test(asString(event.type) ?? "")) break;
    }
  } catch {
    yield { type: "error", message: "모델 응답을 받는 중에 연결이 끊겼어요. 다시 시도해 주세요." };
    return;
  }

  for (const out of state.filter.flush()) yield out;
  for (const out of state.calls.flush()) yield out;
  yield { type: "done" };
}

// ── 공급자 ──────────────────────────────────────────────────────────────────

export function createCodexProvider(opts: CodexProviderOptions = {}): LlmProvider {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const injected = opts.token;
  const sessionId = randomUUID(); // 대화 하나에 하나. 재시도해도 같은 값을 씁니다.

  const getToken: (force: boolean) => Promise<string> = injected
    ? () => injected()
    : async (force) => (await import("../auth")).getAccessToken(force);

  const readAccountId: () => Promise<string | null> =
    opts.accountId ?? (async () => (await import("../auth")).getAccountId());

  async function* sendTurn(input: SendTurnInput): AsyncGenerator<AgentEvent> {
    const configured = agentConfig().toolMode;
    const accountId = await resolveAccountId(readAccountId); // 재시도해도 같은 값입니다.
    let mode: WireToolMode = configured === "json" ? "json" : "native";
    let refreshed = false;
    let downgraded = false;
    let force = false;

    // 최대 3회: 원요청 + 토큰 강제 갱신 1회 + json 강등 1회.
    for (;;) {
      let accessToken: string;
      try {
        accessToken = await getToken(force);
      } catch (error) {
        // auth.ts 의 메시지는 사용자용 한국어이고 토큰 값을 담지 않습니다.
        const message = error instanceof Error ? error.message : "에이전트 토큰을 읽지 못했어요.";
        yield { type: "error", message };
        return;
      }

      let res: Response;
      try {
        res = await fetchImpl(ENDPOINT, {
          method: "POST",
          headers: buildHeaders(accessToken, sessionId, accountId),
          body: JSON.stringify(buildBody(input, mode)),
        });
      } catch {
        // 원인 객체에 요청 헤더(토큰)가 실릴 수 있으므로 그대로 올리지 않습니다.
        yield { type: "error", message: "모델 서버에 연결하지 못했어요. 잠시 뒤에 다시 시도해 주세요." };
        return;
      }

      if (res.ok) {
        yield* streamEvents(res, mode);
        return;
      }

      const bodyText = await readBodySafe(res);

      if (res.status === 401 && !refreshed) {
        refreshed = true;
        force = true;
        continue;
      }
      if (
        configured === "auto" &&
        mode === "native" &&
        !downgraded &&
        input.tools.length > 0 &&
        looksLikeToolRejection(res.status, bodyText)
      ) {
        downgraded = true;
        mode = "json";
        console.warn(`codex: 네이티브 도구 모드가 거절돼(HTTP ${res.status}) json 모드로 전환합니다.`);
        continue;
      }

      yield httpError(res.status, bodyText);
      return;
    }
  }

  return { sendTurn };
}
