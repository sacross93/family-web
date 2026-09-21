// 엔진(lib/agent)과 화면을 잇는 다리. 한 턴을 SSE 로 흘려보내고, 끝나면 기록으로 남깁니다.
//
// 이 라우트가 혼자 책임지는 것 셋:
//  ① 기능 스위치(AGENT_ENABLED) — 엔진 어디에도 이 값을 보는 곳이 없습니다. 여기서 지킵니다.
//  ② 내부 API 주소 — 요청 헤더가 아니라 환경변수에서 만듭니다(lib/agent/origin.ts 주석).
//  ③ 도구 호출의 짝 — runAgent 는 최종 messages 를 돌려주지 않으므로 이벤트를 보며 되짚습니다.
//
// 오류는 상태코드·원문 그대로 내보내지 않고 사람 말로 번역합니다. 화면에 뜨는 문장이고,
// 공급자 원문에는 사용자 본인의 ChatGPT 세션 사정이 섞여 있습니다.

import { NextRequest, NextResponse } from "next/server";
import { appendMessages, chatExists, createChat, loadHistory } from "@/lib/agent/chat-store";
import { agentConfig } from "@/lib/agent/config";
import { createCodexProvider } from "@/lib/agent/llm/codex";
import type { AgentMessage } from "@/lib/agent/llm/types";
import { runAgent } from "@/lib/agent/loop";
import { agentOrigin } from "@/lib/agent/origin";
import { recordRun } from "@/lib/agent/run-log";
import type { RunOutcome, RunStep } from "@/lib/agent/run-log";
import { resolvePath } from "@/lib/agent/registry";
import { RESOURCES } from "@/lib/agent/resources";

// 토큰 갱신 HTTP 타임아웃 8초 × 2회 + 도구 왕복 여유.
// 갱신은 트랜잭션 안에서 일어나므로 도중에 함수가 죽으면 refresh_token 이 영구히 죽습니다.
export const runtime = "nodejs";
export const maxDuration = 60;

const GENERIC_ERROR = "잠깐 문제가 생겼어요. 다시 해볼까요?";

/** 공급자 오류 → 화면 문장. 상태코드도 원문도 문장에 넣지 않습니다. */
function humanError(status?: number): string {
  if (status === 429) return "오늘 사용량을 다 썼어요. 잠시 뒤에 다시 해볼까요?";
  if (status === 401) return "로그인이 풀렸어요. 새로고침해 주세요.";
  return GENERIC_ERROR;
}

/**
 * 이벤트를 보며 이번 턴의 대화 기록을 되짚습니다.
 *
 * 지켜야 할 것은 둘 — assistant 의 `toolCalls` 와 tool 의 `toolCallId` 가 **짝을 이룰 것**,
 * 그리고 호출의 **id·args 가 공급자가 낸 원본일 것**. 짝이 깨지면 다음 턴에 네이티브 도구
 * 모드가 요청 자체를 거절하고, args 가 비면 모델이 자기가 뭘 열어봤는지 몰라 또 엽니다.
 *
 * 결과는 **나온 순서대로** 짝짓습니다. 도중에 끊겨 결과를 못 받은 호출은 버립니다 —
 * 짝 없는 호출 하나가 남는 것이 그 왕복을 통째로 잃는 것보다 나쁩니다.
 */
function createTurnLog() {
  const messages: AgentMessage[] = [];
  let said = "";
  let calls: NonNullable<AgentMessage["toolCalls"]> = [];
  let results: AgentMessage[] = [];

  function flush() {
    const paired = calls.slice(0, results.length);
    if (paired.length > 0) {
      // "무엇을 불렀는지"와 "무엇을 돌려받았는지"는 반드시 붙어서 저장됩니다(loop.ts 와 같은 모양).
      messages.push({ role: "assistant", content: said, toolCalls: paired });
      messages.push(...results);
    } else if (said) {
      messages.push({ role: "assistant", content: said });
    }
    said = "";
    calls = [];
    results = [];
  }

  return {
    text(delta: string) {
      // 도구를 부른 뒤 다시 말을 시작했다 = 새 왕복. 앞 왕복을 먼저 닫습니다.
      if (calls.length > 0) flush();
      said += delta;
    },
    call(id: string, name: string, args: Record<string, unknown>) {
      calls.push({ id, name, args });
    },
    result(content: string) {
      const call = calls[results.length];
      if (!call) return; // 짝지을 호출이 없는 결과는 버립니다.
      results.push({ role: "tool", content, toolCallId: call.id });
    },
    /** 지금까지 쌓인 것을 닫아 돌려줍니다(중간에 끊겼어도 여기까지는 남습니다). */
    close(): AgentMessage[] {
      flush();
      return messages;
    },
  };
}

interface AgentRequestBody {
  chatId?: unknown;
  message?: unknown;
  imageUrl?: unknown;
  imageData?: unknown;
  path?: unknown;
}

/**
 * 첨부한 사진의 주소. **우리 저장소 주소만 받습니다** — 임의 주소를 받으면 이 라우트가
 * 남의 서버를 가리키는 통로가 됩니다. /api/upload 가 돌려주는 두 모양만 통과시킵니다:
 * 로컬 `/uploads/…`, Blob `https://….blob.vercel-storage.com/…`.
 */
function ownImageUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  if (value.startsWith("/uploads/") && !value.includes("..")) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com")) return value;
  } catch {
    // 주소가 아니면 버립니다.
  }
  return undefined;
}

/**
 * 가족이 보고 있던 화면의 경로. **등록된 경로만** 통과합니다.
 *
 * 이 값은 안내문에 글로 실립니다 — 임의 문자열을 그대로 실으면 거기 적힌 문장이 지시처럼
 * 읽힙니다("규칙을 무시하라" 를 경로 이름에 넣는 식). `resolvePath` 는 리소스에 등록된
 * 경로가 아니면 null 을 주므로, 통과한 값은 우리가 아는 경로 중 하나입니다.
 * 길이도 먼저 막습니다 — 긴 문자열로 정규식을 괴롭히지 못하게.
 */
function knownPath(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/") || value.length > 200) return undefined;
  return resolvePath(value, RESOURCES) ? value : undefined;
}

/** 축소본 상한. 768px JPEG 는 보통 200KB 아래다 — 그보다 훨씬 크면 줄이지 않고 보낸 것입니다. */
const MAX_IMAGE_DATA = 1_500_000;

/**
 * 모델에게만 가는 축소본. 클라이언트가 줄여서 보내기로 돼 있지만 라우트는 클라이언트를 믿지 않습니다.
 * 넘치면 **조용히 버립니다**(사진 없이 대화는 계속됩니다). 여기서 400 을 내면 사용자는 아무것도 못 하고 멈춥니다.
 */
function modelImage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("data:image/")) return undefined;
  if (value.length > MAX_IMAGE_DATA) return undefined;
  return value;
}

export async function POST(request: NextRequest) {
  const config = agentConfig();
  if (!config.enabled) {
    return NextResponse.json({ error: "아직 준비 중이에요." }, { status: 403 });
  }

  let body: AgentRequestBody | null = null;
  try {
    body = (await request.json()) as AgentRequestBody;
  } catch {
    return NextResponse.json({ error: "요청을 읽지 못했어요." }, { status: 400 });
  }

  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "하고 싶은 말을 적어 주세요." }, { status: 400 });
  }
  const given = typeof body?.chatId === "string" ? body.chatId.trim() : "";
  // 사진은 두 값이다 — 저장되는 주소와 이번 턴에만 모델에게 보이는 축소본(스펙 §19.3).
  const imageUrl = ownImageUrl(body?.imageUrl);
  const imageData = modelImage(body?.imageData);
  const screen = knownPath(body?.path);

  // 대화 준비는 스트림을 열기 **전에** 끝냅니다 — 여기서 실패하면 JSON 오류로 돌려줄 수 있습니다.
  let chatId: string;
  let history: AgentMessage[];
  try {
    if (given) {
      // 지워진 대화에 이어 쓰면 저장이 통째로 실패합니다(외래키). 미리 확인해 알려 줍니다.
      if (!(await chatExists(given))) {
        return NextResponse.json({ error: "그 대화를 찾지 못했어요." }, { status: 404 });
      }
      chatId = given;
    } else {
      // createChat 은 첫 메시지를 제목에만 씁니다. 본문 저장은 아래 appendMessages 가 합니다.
      chatId = await createChat(message);
    }
    // 최근 것만, 오래된 순으로. 선두에 남은 고아 tool 은 loop.ts 의 recentHistory 가 걷어냅니다.
    history = await loadHistory(chatId, config.history);
  } catch (error) {
    console.error("[agent] 대화를 준비하지 못했습니다", error);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const disconnected = new AbortController();
  const log = createTurnLog();
  const ctx = { origin: agentOrigin(), cookie: request.headers.get("cookie") ?? "" };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false; // 이미 끊긴 연결. 루프는 계속 돌다가 곧 멈추고 저장합니다.
        }
      };

      // 클라이언트가 chatId 를 서버와 맞출 수 있도록 언제나 가장 먼저 한 번 보냅니다.
      send({ type: "chat", chatId });

      // 실행 기록(`AgentRun`). **내용은 담지 않는다** — 이름·성패·label·시간까지만(run-log.ts).
      const startedAt = Date.now();
      const steps: RunStep[] = [];
      /** 도구가 시작한 시각. 결과는 부른 순서대로 오므로 앞에서부터 짝짓는다. */
      const startedTools: { name: string; label: string; at: number }[] = [];
      let outcome: RunOutcome = "ok";
      let shownError: string | undefined;

      const run = runAgent({
        question: message,
        provider: createCodexProvider(),
        ctx,
        history,
        ...(imageUrl ? { imageUrl } : {}),
        ...(imageData ? { imageData } : {}),
        ...(screen ? { screen } : {}),
      });
      try {
        for await (const event of run) {
          // break 가 제너레이터의 return() 을 불러 공급자 쪽도 정리됩니다.
          if (disconnected.signal.aborted || request.signal.aborted) break;
          if (event.type === "text") {
            log.text(event.delta);
            send(event);
          } else if (event.type === "tool_start") {
            log.call(event.id, event.name, event.args);
            startedTools.push({ name: event.name, label: event.label, at: Date.now() });
            // 화면에는 계약대로 name·label 만. id·args 는 기록용이라 브라우저로 내보내지 않습니다.
            send({ type: "tool_start", name: event.name, label: event.label });
          } else if (event.type === "tool_result") {
            log.result(JSON.stringify(event.result));
            // 결과의 **성패만** 가져옵니다. `data` 도 `error` 문구도 남기지 않습니다 —
            // 바깥에서 가져온 글과 가족 데이터가 로그 표에 눌러앉습니다(run-log.ts).
            const started = startedTools[steps.length];
            if (started) {
              steps.push({
                name: started.name,
                ok: event.result.ok,
                label: started.label,
                ms: Date.now() - started.at,
              });
            }
            send(event);
          } else if (event.type === "error") {
            // 원문(event.message)은 서버 로그에만 남기고, 화면에는 번역한 문장만 보냅니다.
            console.error("[agent] 공급자 오류", event.status ?? "", event.message);
            outcome = "error";
            shownError = humanError(event.status);
            send({ type: "error", message: shownError, status: event.status });
          } else {
            send({ type: "done" });
          }
        }
      } catch (error) {
        console.error("[agent] 턴이 중단되었습니다", error);
        outcome = "error";
        shownError = GENERIC_ERROR;
        send({ type: "error", message: GENERIC_ERROR });
      } finally {
        // 끊겼어도 사용자가 읽던 것은 기록에 남아야 합니다. 저장 실패가 응답을 죽이지는 않습니다.
        try {
          // 같은 객체를 그대로 넘겨도 imageUrl 만 남습니다 — chat-store 가 imageData 를 저장하지 않습니다.
          await appendMessages(chatId, [
            { role: "user", content: message, ...(imageUrl ? { imageUrl } : {}) },
            ...log.close(),
          ]);
        } catch (error) {
          console.error("[agent] 대화를 저장하지 못했습니다", error);
        }
        // 연결이 먼저 끊긴 턴은 "실패" 가 아니라 "도중에 나간 것" 입니다 — 구분해서 남깁니다.
        if (outcome === "ok" && (disconnected.signal.aborted || request.signal.aborted)) {
          outcome = "aborted";
        }
        // 기록은 스스로 던지지 않습니다(run-log.ts). 실패해도 여기까지는 이미 다 보냈습니다.
        await recordRun({
          prompt: message,
          steps,
          outcome,
          ...(shownError ? { error: shownError } : {}),
          toolMode: config.toolMode,
          ms: Date.now() - startedAt,
        });
        if (open) {
          try {
            controller.close();
          } catch {
            // 이미 닫힌 스트림.
          }
        }
      }
    },
    cancel() {
      disconnected.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform·X-Accel-Buffering 이 없으면 중간 프록시가 스트림을 통째로 모았다 한 번에 줍니다.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
