# 사이트 에이전트 · 2단계(라우트·화면) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1단계에서 만든 엔진을 가족이 실제로 쓸 수 있게 한다 — 오른쪽 아래 `물어보기` 버튼과 대화창, 대화 기록.

**Architecture:** 서버 라우트가 `runAgent()`(1단계 엔진)를 돌려 SSE 로 흘리고, 클라이언트 시트가 그 이벤트를 그린다. 대화는 `AgentChat`·`AgentChatMessage` 에 저장해 가족이 기기를 옮겨도 이어진다. 되돌리기는 클라이언트가 경로를 모르고 `{resource, id}` 만 보낸다.

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind v4 · Prisma 6 · SSE(ReadableStream)

**Spec:** `docs/superpowers/specs/2026-09-17-site-agent-design.md` — **§18 이 이 계획의 본문이다.** §1~§17 은 1단계(완료).

## Global Constraints

- **이 저장소는 React 컴포넌트를 테스트하지 않는다.** `vitest.config.mts` 주석: "lib/ 의 순수 함수만 테스트합니다." UI 태스크는 **브라우저 390px 확인 + `npm run build`** 로 검증한다. 테스트 프레임워크를 새로 들이지 마라.
- 색은 `lib/colors.ts` 의 `palette(key)` 로만. `"bg-"+key` 식 조합 금지(Tailwind v4 가 스캔 못 함).
- UI 는 `@/components/ui` 배럴에서 import. 임의 HEX·그림자·폰트 금지.
- **모바일 우선**: 390px 에서 검증. hover 로만 뜨는 액션 금지. 가로 스크롤 금지. 탭 타깃 44px 이상.
- Next 16 동적 라우트 params 는 `Promise` → `await params`.
- 숫자·모델명은 `lib/agent/config.ts`(환경변수)에서만.
- 미사용 import 금지(빌드 실패). `npm run lint` 전체는 무관한 기존 에러 9개로 이미 빨감 → **변경 파일만** `npx eslint`.
- UI 문구는 한국어 존댓말, 따뜻하고 간결하게.
- **`AgentAuth` 테이블을 건드리지 마라.** 사용자의 실제 ChatGPT 토큰이 들어 있다(`main` 행, `updatedAt = 2026-09-18 00:05:29.574`). 테스트가 이 행을 수정하면 재로그인이 필요하다.
- 커밋은 태스크마다. `git push` 하지 않는다(메인 에이전트가 검토 후 수행).

---

## 1단계에서 이미 있는 것 (읽되 수정하지 마라)

```ts
// lib/agent/loop.ts
export interface RunInput {
  question: string; provider: LlmProvider; ctx: ToolContext;
  history?: AgentMessage[]; catalog?: string; maxSteps?: number;
}
export type LoopEvent =
  | { type: "text"; delta: string }
  | { type: "tool_start"; name: string; label: string }
  | { type: "tool_result"; result: ToolResult }
  | { type: "done" }
  | { type: "error"; message: string; status?: number };
export async function* runAgent(input: RunInput): AsyncGenerator<LoopEvent>;

// lib/agent/tools.ts
export interface ToolContext { origin: string; cookie: string; resources?: AgentResource[]; fetchImpl?: typeof fetch }
export type ToolResult =
  | { ok: true; data: unknown; undo?: { resource: string; id: string }; label?: string; path?: string }
  | { ok: false; error: string };

// lib/agent/llm/types.ts
export interface AgentMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: { id: string; name: string; args: Record<string, unknown> }[];
}

// lib/agent/llm/codex.ts
export function createCodexProvider(opts?: CodexProviderOptions): LlmProvider;
// lib/agent/catalog.ts
export async function buildCatalog(resources?, maxChars?): Promise<string>;
// lib/agent/config.ts
export function agentConfig(): AgentConfig;   // enabled·model·maxSteps·history…
// lib/agent/registry.ts
export function findResource(key: string, resources: AgentResource[]): AgentResource | undefined;
// lib/agent/resources.ts
export const RESOURCES: AgentResource[];
```

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `lib/agent/chat-store.ts` | 대화 저장·조회·삭제. 라우트가 얇아지도록 DB 접근을 여기 모은다 |
| `app/api/agent/route.ts` | SSE 1턴. `runAgent` 를 돌리고 이벤트를 흘리며 대화를 저장 |
| `app/api/agent/undo/route.ts` | 되돌리기. 화이트리스트로만 |
| `app/api/agent/chats/route.ts` | 기록 목록 |
| `app/api/agent/chats/[id]/route.ts` | 이어보기 · 삭제 |
| `components/agent/agent-fab.tsx` | `물어보기` 버튼 + 시트 열림 상태 |
| `components/agent/agent-sheet.tsx` | 대화창 껍데기(헤더·본문 전환·입력창) |
| `components/agent/agent-thread.tsx` | 말풍선·진행표시·결과카드 |
| `components/agent/agent-history.tsx` | 기록 목록 |
| `components/agent/use-agent-chat.ts` | SSE 소비·상태 관리 훅 |

UI 를 4개로 나누는 이유: 시트 하나에 다 넣으면 400줄이 넘고, 스트리밍 상태와 렌더가 섞여 고치기 어려워진다.

---

## Task 1: 대화 저장소

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/agent/chat-store.ts`, `lib/agent/chat-store.test.ts`

**Interfaces:**
- Produces:
  - `createChat(firstMessage: string): Promise<string>` — 새 대화를 만들고 id 반환. 제목은 `titleFrom(firstMessage)`
  - `appendMessages(chatId: string, messages: AgentMessage[]): Promise<void>`
  - `loadHistory(chatId: string, limit: number): Promise<AgentMessage[]>` — 최근 limit 개, **오래된 순**
  - `listChats(limit?: number): Promise<{ id: string; title: string; updatedAt: Date; count: number }[]>`
  - `deleteChat(id: string): Promise<void>`
  - `titleFrom(text: string): string` — 40자 초과면 자르고 `…`, 개행·제어문자는 공백으로

- [ ] **Step 1: 스키마 추가**

`prisma/schema.prisma` 의 `AgentRun` 아래:

```prisma
// 대화 기록. 공용 계정이므로 가족이 함께 본다(스펙 §18.2).
model AgentChat {
  id        String   @id @default(cuid())
  title     String   @default("")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  messages AgentChatMessage[]

  @@index([updatedAt])
}

model AgentChatMessage {
  id         String    @id @default(cuid())
  chatId     String
  chat       AgentChat @relation(fields: [chatId], references: [id], onDelete: Cascade)
  role       String
  content    String
  toolCalls  String?
  toolCallId String?
  createdAt  DateTime  @default(now())

  @@index([chatId, createdAt])
}
```

적용: `npm run db:push` (**로컬만**. Neon 은 메인 에이전트가 배포 직전에 한다.)

- [ ] **Step 2: 실패 테스트 작성**

`lib/agent/chat-store.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createChat, appendMessages, loadHistory, listChats, deleteChat, titleFrom } from "@/lib/agent/chat-store";

const made: string[] = [];
async function newChat(first = "안녕") {
  const id = await createChat(first);
  made.push(id);
  return id;
}
afterAll(async () => {
  await prisma.agentChat.deleteMany({ where: { id: { in: made } } });
});

describe("titleFrom", () => {
  it("짧으면 그대로", () => expect(titleFrom("발리 사진 어디 있지?")).toBe("발리 사진 어디 있지?"));
  it("길면 자르고 말줄임", () => {
    const t = titleFrom("가".repeat(60));
    expect(t.length).toBeLessThanOrEqual(41);
    expect(t.endsWith("…")).toBe(true);
  });
  it("개행·제어문자는 공백으로", () => expect(titleFrom("앞\n뒤")).toBe("앞 뒤"));
  it("빈 값이면 기본 제목", () => expect(titleFrom("   ")).toBe("새 대화"));
});

describe("대화 저장", () => {
  it("만들면 제목이 첫 질문에서 나온다", async () => {
    const id = await newChat("발리 사진 어디 있지?");
    const rows = await listChats(50);
    expect(rows.find((r) => r.id === id)?.title).toBe("발리 사진 어디 있지?");
  });

  it("메시지를 붙이고 오래된 순으로 읽는다", async () => {
    const id = await newChat();
    await appendMessages(id, [
      { role: "user", content: "첫 질문" },
      { role: "assistant", content: "첫 답변" },
    ]);
    await appendMessages(id, [{ role: "user", content: "둘째 질문" }]);
    const h = await loadHistory(id, 10);
    expect(h.map((m) => m.content)).toEqual(["첫 질문", "첫 답변", "둘째 질문"]);
  });

  it("도구 호출 짝이 보존된다", async () => {
    const id = await newChat();
    await appendMessages(id, [
      { role: "assistant", content: "", toolCalls: [{ id: "call_1", name: "open_page", args: { path: "/plans/x" } }] },
      { role: "tool", content: '{"ok":true}', toolCallId: "call_1" },
    ]);
    const h = await loadHistory(id, 10);
    expect(h[0].toolCalls).toEqual([{ id: "call_1", name: "open_page", args: { path: "/plans/x" } }]);
    expect(h[1].toolCallId).toBe("call_1");
  });

  it("limit 은 최근 것을 남기되 순서는 오래된 순", async () => {
    const id = await newChat();
    await appendMessages(id, [1, 2, 3, 4, 5].map((n) => ({ role: "user" as const, content: `m${n}` })));
    const h = await loadHistory(id, 3);
    expect(h.map((m) => m.content)).toEqual(["m3", "m4", "m5"]);
  });

  it("목록은 최근 대화가 먼저", async () => {
    const a = await newChat("먼저");
    await new Promise((r) => setTimeout(r, 10));
    const b = await newChat("나중");
    const rows = await listChats(50);
    expect(rows.findIndex((r) => r.id === b)).toBeLessThan(rows.findIndex((r) => r.id === a));
  });

  it("지우면 메시지도 같이 사라진다", async () => {
    const id = await createChat("지울 것");
    await appendMessages(id, [{ role: "user", content: "x" }]);
    await deleteChat(id);
    expect(await prisma.agentChatMessage.count({ where: { chatId: id } })).toBe(0);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run lib/agent/chat-store.test.ts`
Expected: FAIL — `Cannot find module '@/lib/agent/chat-store'`

- [ ] **Step 4: 구현**

`lib/agent/chat-store.ts` 요구사항:

- `titleFrom`: 제어문자(`[ -]`)를 공백으로 바꾸고 연속 공백을 접고 `trim`. 빈 문자열이면 `"새 대화"`. 40자 초과면 40자 + `…`.
- `appendMessages`: `createMany` 로 한 번에. `toolCalls` 는 `JSON.stringify`, 없으면 `null`. 같은 트랜잭션에서 `AgentChat.updatedAt` 을 갱신한다(Prisma 의 `@updatedAt` 은 부모를 건드려야 움직인다).
- `loadHistory`: `createdAt desc` 로 `take: limit` 한 뒤 **뒤집어서** 반환. `toolCalls` 는 `JSON.parse`, 실패하면 `undefined`(던지지 마라 — 오래된 행이 깨져 있어도 대화는 살아야 한다).
- `listChats`: `updatedAt desc`, 기본 `limit = 30`, `_count.messages` 를 `count` 로.
- `deleteChat`: `AgentChat` 삭제(메시지는 cascade).

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run lib/agent/chat-store.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 6: `AgentAuth` 무사 확인**

Run: `psql "postgresql://ascentai@localhost:5432/podong" -c 'SELECT id, "updatedAt" FROM "AgentAuth";'`
Expected: `main | 2026-09-18 00:05:29.574` (변하지 않았어야 한다)

- [ ] **Step 7: 커밋**

```bash
git add prisma/schema.prisma lib/agent/chat-store.ts lib/agent/chat-store.test.ts
git commit -m "에이전트: 대화 기록 저장소"
```

---

## Task 2: SSE 라우트

**Files:**
- Create: `app/api/agent/route.ts`
- Modify: `.env.example` (`AGENT_ORIGIN` 추가)

**Interfaces:**
- Consumes: `runAgent`·`LoopEvent`(loop.ts) · `createCodexProvider` · `buildCatalog` · `agentConfig` · `createChat`·`appendMessages`·`loadHistory`(Task 1)
- Produces: `POST /api/agent` — 요청 `{ chatId?: string; message: string }`, 응답 SSE

**SSE 이벤트 (클라이언트 계약)**

```
data: {"type":"chat","chatId":"..."}          새 대화일 때 가장 먼저 1회
data: {"type":"text","delta":"안"}
data: {"type":"tool_start","name":"open_page","label":"계획을 열어보는 중…"}
data: {"type":"tool_result","result":{...}}
data: {"type":"done"}
data: {"type":"error","message":"...","status":429}
```

- [ ] **Step 1: 라우트 구현**

요구사항(이 태스크는 테스트가 없다 — 이 저장소는 라우트를 단위 테스트하지 않는다. Step 2 의 실제 호출로 검증한다):

- `export const runtime = "nodejs"` · `export const maxDuration = 60`
  - 근거: 토큰 갱신 HTTP 타임아웃 8초 × 2회 + 여유. 갱신이 트랜잭션 안에서 일어나므로 중간에 함수가 죽으면 refresh_token 이 영구히 죽는다.
- **`agentConfig().enabled` 가 false 면 `403 { error: "아직 준비 중이에요." }`.** 지금 코드 어디서도 이 값을 안 본다 — 여기서 처음 지킨다.
- 본문 검증: `message` 가 빈 문자열이면 400.
- `ctx.origin` 은 **`process.env.AGENT_ORIGIN` 또는 `process.env.AUTH_URL`** 에서 만든다. 둘 다 없으면 개발 기본값 `http://localhost:3000`. **`Host`/`X-Forwarded-Host` 헤더에서 만들지 마라** — 세션 쿠키가 공격자 서버로 나간다.
- `ctx.cookie` 는 요청의 `cookie` 헤더를 그대로.
- `chatId` 가 없으면 `createChat(message)` 로 만들고 **`chat` 이벤트를 가장 먼저** 흘린다.
- `history` 는 `loadHistory(chatId, agentConfig().history)`.
- `runAgent` 이벤트를 그대로 SSE 로 전달하되, **`error` 는 사람 말로 번역**해서 보낸다(아래).
- 턴이 끝나면 `appendMessages` 로 저장한다: `{role:"user", content: message}` + 이번 턴에 쌓인 assistant/tool 메시지. **`toolCalls`↔`toolCallId` 를 짝째로** 저장해야 다음 턴에 네이티브 도구 모드가 안 깨진다.
  - `runAgent` 는 최종 `messages` 를 반환하지 않으므로(브리프 계약), 라우트가 `tool_start`/`tool_result` 이벤트를 보며 스스로 구성한다. `tool_start` 에는 `id` 가 없으므로 **`tool_result` 의 `result` 와 순서로 짝짓는다**(한 턴에 여러 개면 나온 순서대로).
- **오류 번역**(원문·상태코드 노출 금지):
  - `status === 429` → `"오늘 사용량을 다 썼어요. 잠시 뒤에 다시 해볼까요?"`
  - `status === 401` → `"로그인이 풀렸어요. 새로고침해 주세요."`
  - 그 밖 → `"잠깐 문제가 생겼어요. 다시 해볼까요?"`
- 클라이언트가 연결을 끊으면(`request.signal.aborted`) 생성기를 정리하고 지금까지의 메시지는 저장한다.

`.env.example` 에 추가:

```bash
# 에이전트가 내부 API 를 부를 때 쓸 주소. 요청 헤더에서 만들지 않는다(쿠키 유출 방지).
AGENT_ORIGIN="http://localhost:3000"
```

- [ ] **Step 2: 실제로 불러 확인**

`AGENT_ENABLED=true` 로 dev 서버를 띄우고, 로그인 쿠키를 얻어 호출한다:

```bash
npm run dev &
curl -s -c /tmp/j -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"wlsdud022","password":"wlsdud022"}' -o /dev/null
curl -N -s -b /tmp/j -X POST localhost:3000/api/agent -H 'Content-Type: application/json' \
  -d '{"message":"지금 할일 뭐 있어?"}' | head -20
```

Expected: `data: {"type":"chat",...}` → `text` 여러 개 → `done`.
**실제 ChatGPT 사용량을 쓰므로 1~2회만 호출하라.** 429 가 나오면 번역된 문구가 나오는지만 확인하고 넘어가라.

`AGENT_ENABLED` 를 빼고 같은 호출 → `403 {"error":"아직 준비 중이에요."}` 확인.

- [ ] **Step 3: 커밋**

```bash
git add app/api/agent/route.ts .env.example
git commit -m "에이전트: SSE 대화 라우트"
```

---

## Task 3: 되돌리기 · 기록 API

**Files:**
- Create: `app/api/agent/undo/route.ts`, `app/api/agent/chats/route.ts`, `app/api/agent/chats/[id]/route.ts`

**Interfaces:**
- Consumes: `findResource`·`RESOURCES` · `listChats`·`loadHistory`·`deleteChat`(Task 1)
- Produces:
  - `POST /api/agent/undo` — `{ resource: string; id: string }` → `{ ok: true }` 또는 `{ error }`
  - `GET /api/agent/chats` → `{ id, title, updatedAt, count }[]`
  - `GET /api/agent/chats/[id]` → `{ id, title, messages: AgentMessage[] }`
  - `DELETE /api/agent/chats/[id]` → `{ ok: true }`

- [ ] **Step 1: 되돌리기 구현**

`app/api/agent/undo/route.ts` 요구사항:

- **클라이언트는 경로를 보내지 않는다.** `{resource, id}` 만 받는다.
- `findResource(resource, RESOURCES)?.create?.undoApi` 가 없으면 **거절**(`400 { error: "그건 되돌릴 수 없어요." }`). 이게 화이트리스트다 — 경로를 클라이언트가 주게 만들면 무의미해진다.
- `id` 는 문자열이고 비어 있지 않아야 한다.
- 경로는 서버가 `undoApi(id)` 로 만들고, **요청자의 쿠키**로 `AGENT_ORIGIN` 에 `DELETE` 한다(Task 2 와 같은 origin 규칙).
- 대상 라우트가 실패하면 그 본문의 `error` 를 그대로 전달하되, 없으면 `"되돌리지 못했어요."`.
- `export const runtime = "nodejs"`.

- [ ] **Step 2: 기록 API 구현**

`app/api/agent/chats/route.ts`: `GET` → `listChats()` 그대로 JSON.

`app/api/agent/chats/[id]/route.ts`:
- **Next 16 규칙**: `{ params }: { params: Promise<{ id: string }> }` → `const { id } = await params;`
- `GET` → `{ id, title, messages }`. `messages` 는 `loadHistory(id, 200)`. 없는 id 면 404 `{ error: "그 대화를 찾지 못했어요." }`.
- `DELETE` → `deleteChat(id)` 후 `{ ok: true }`.

- [ ] **Step 3: 실제로 불러 확인**

```bash
curl -s -b /tmp/j localhost:3000/api/agent/chats | head -c 300
curl -s -b /tmp/j -X POST localhost:3000/api/agent/undo -H 'Content-Type: application/json' \
  -d '{"resource":"baby","id":"x"}'            # → 되돌릴 수 없어요 (create 없음)
curl -s -b /tmp/j -X POST localhost:3000/api/agent/undo -H 'Content-Type: application/json' \
  -d '{"resource":"없는키","id":"x"}'           # → 되돌릴 수 없어요
```

- [ ] **Step 4: 커밋**

```bash
git add app/api/agent/undo app/api/agent/chats
git commit -m "에이전트: 되돌리기 · 기록 API"
```

---

## Task 4: `물어보기` 버튼

**Files:**
- Create: `components/agent/agent-fab.tsx`
- Modify: `components/app-shell.tsx`, `app/layout.tsx`

**Interfaces:**
- Produces: `<AgentFab hasDecorationFab={boolean} />` — 버튼 + 시트 열림 상태를 쥔다

**중요 — 꾸미기 버튼이 뜨는 진짜 조건**

스펙 §18.6 은 "상단 메뉴 페이지에서만"이라고만 적었는데 **절반만 맞다.** 실제 조건은 `components/app-shell.tsx:212` 의 `isTopLevel` **그리고** `canEdit={isAdmin}` 이다(`decoration-surface.tsx:314` 의 `{canEdit && …}`). 즉 **관리자가 아닌 가족에게는 꾸미기 버튼이 아예 없다.**

두 값 모두 `AppShell` 안에 이미 있다(`nav` prop 으로 만든 `isTopLevel`, `user?.isAdmin`). 그러니 **`AgentFab` 은 `AppShell` 안에서 렌더하고** `hasDecorationFab={isTopLevel && Boolean(user?.isAdmin)}` 을 넘겨라. 별도로 경로 판정을 복제하지 마라.

- [ ] **Step 1: 버튼 구현**

`components/agent/agent-fab.tsx`:

```tsx
"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentSheet } from "./agent-sheet";

/** 우하단 "물어보기". 꾸미기 버튼이 있으면 그 위에, 없으면 맨 아래에 앉는다. */
export function AgentFab({ hasDecorationFab }: { hasDecorationFab: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="포동이에게 물어보기"
          className={cn(
            "fixed right-5 z-40 flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-3 font-semibold text-ink shadow-lg transition hover:bg-sunken active:scale-95",
            hasDecorationFab ? "bottom-20" : "bottom-5"
          )}
        >
          <MessageCircle className="h-4 w-4 text-primary" /> 물어보기
        </button>
      )}
      <AgentSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
```

`z-40` 인 이유: 꾸미기 FAB 이 `z-50` 이라 편집 모드에서 그 위로 겹치면 안 된다.

- [ ] **Step 2: AppShell 에 연결**

`components/app-shell.tsx`:
- `agentEnabled: boolean` prop 을 받는다.
- `isTopLevel` 계산 아래에서, `{agentEnabled && <AgentFab hasDecorationFab={isTopLevel && Boolean(user?.isAdmin)} />}` 를 `<main>` **바깥**(최상위 div 안)에 렌더한다. `main` 안에 넣으면 `lg:pl-[264px]` 때문에 위치가 밀린다.

`app/layout.tsx`: 서버 컴포넌트이므로 `agentConfig().enabled` 를 읽어 `<AppShell agentEnabled={…}>` 로 넘긴다. **클라이언트에서 환경변수를 읽으려 하지 마라**(`NEXT_PUBLIC_` 이 아니라 안 보인다).

- [ ] **Step 3: 브라우저 확인 (390px)**

`AGENT_ENABLED=true npm run dev` 로 띄우고 390px 에서:
- 관리자로 로그인 → `/` 에서 꾸미기 위에 `물어보기` 가 있고 겹치지 않는다
- `/plans/<id>`(상세, 꾸미기 없음) → `물어보기` 가 맨 아래로 내려온다
- `AGENT_ENABLED` 없이 띄우면 버튼이 **아예 없다**
- 가로 스크롤 없음

- [ ] **Step 4: 커밋**

```bash
git add components/agent/agent-fab.tsx components/app-shell.tsx app/layout.tsx
git commit -m "에이전트: 물어보기 버튼"
```

---

## Task 5: 스트리밍 훅

**Files:**
- Create: `components/agent/use-agent-chat.ts`

**Interfaces:**
- Produces:

```ts
export type Bubble =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; results: ToolResult[] };

export interface AgentChatState {
  chatId: string | null;
  bubbles: Bubble[];
  running: boolean;
  toolLabel: string | null;   // 진행 표시. 끝나면 null
  error: string | null;
  send(message: string): Promise<void>;
  stop(): void;
  reset(): void;                        // 새 대화
  load(chatId: string): Promise<void>;  // 기록에서 이어보기
}
export function useAgentChat(): AgentChatState;
```

- [ ] **Step 1: 구현**

요구사항:

- `send` 는 `fetch("/api/agent", { method:"POST", signal })` 로 SSE 를 읽는다. `ReadableStream` 을 `TextDecoder` 로 줄 단위 파싱하고 `data: ` 접두를 벗겨 JSON 으로 읽는다. **줄이 청크 경계에서 잘릴 수 있으니 버퍼를 유지하라.**
- 이벤트 처리: `chat` → `chatId` 저장 / `text` → 마지막 assistant 말풍선에 이어붙임 / `tool_start` → `toolLabel = label` / `tool_result` → `toolLabel = null` 하고 `ok` 면 마지막 assistant 말풍선의 `results` 에 push / `done` → `running=false` / `error` → `error` 설정 후 종료.
- `stop()` 은 `AbortController.abort()`. **이미 흘러온 글자는 지우지 마라** — 사용자가 읽고 있던 것이 사라지면 더 나쁘다.
- `reset()` 은 `chatId=null`, `bubbles=[]`.
- `load(id)` 는 `GET /api/agent/chats/[id]` 로 받아 `AgentMessage[]` 를 `Bubble[]` 로 접는다: `user` 는 그대로, 연속된 `assistant`+`tool` 은 하나의 assistant 말풍선으로. `role:"tool"` 자체는 화면에 보이지 않는다.
- 컴포넌트가 사라질 때 진행 중이면 abort.

- [ ] **Step 2: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 에러 0

- [ ] **Step 3: 커밋**

```bash
git add components/agent/use-agent-chat.ts
git commit -m "에이전트: 스트리밍 훅"
```

---

## Task 6: 대화 시트 · 말풍선 · 결과 카드

**Files:**
- Create: `components/agent/agent-sheet.tsx`, `components/agent/agent-thread.tsx`

**Interfaces:**
- Consumes: `useAgentChat`(Task 5)
- Produces:
  - `<AgentSheet open onClose />` — Task 4 의 `AgentFab` 이 이 시그니처로 부른다
  - `<AgentThread state onSuggest />` — `state` 는 `useAgentChat()` 반환값, `onSuggest(text: string)` 은 예시 칩을 눌렀을 때. 칩 문구는 스레드 안에 둔다(바깥에서 주입할 이유가 없다)

- [ ] **Step 1: 시트 구현**

`agent-sheet.tsx` 요구사항:

- `createPortal` 로 `document.body` 에. `components/ui/modal.tsx` 의 패턴(마운트 가드·Escape·`body` 스크롤 잠금)을 참고하되 **Modal 을 그대로 쓰지 마라** — 대화창은 높이·헤더·하단 입력이 달라서 억지로 맞추면 둘 다 나빠진다.
- **폰**: `fixed inset-x-0 bottom-0 h-[85dvh] rounded-t-3xl`. **데스크톱(`sm:` 이상)**: `sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[70vh] sm:w-[380px] sm:rounded-3xl`.
- 뒤 배경은 `bg-ink/35 backdrop-blur-sm`, 탭하면 닫힘. **데스크톱에서는 배경을 깔지 마라**(사이트를 계속 보면서 대화하는 게 자연스럽다) — `sm:hidden`.
- 헤더: `🌱 포동이` + 오른쪽에 아이콘 3개 — **새 대화**(`Plus`), **기록**(`Menu`), **닫기**(`X`). 전부 `IconButton`, `aria-label` 필수.
- 본문은 `view` 상태로 전환: `"chat"` ↔ `"history"`. **별도 서랍을 만들지 마라** — 폰에서 층이 늘면 길을 잃는다.
- 하단 입력: `Textarea` 한 줄 높이로 시작해 최대 4줄까지 자람. Enter 전송, Shift+Enter 줄바꿈. 전송 버튼은 원형 `IconButton`(`ArrowUp`). **진행 중에는 전송 버튼이 `■ 그만`(`Square`)으로 바뀐다.**
- 입력 영역에 `pb-[env(safe-area-inset-bottom)]`. 키보드가 가리지 않게.
- 새 메시지가 오면 스레드를 맨 아래로 스크롤.

- [ ] **Step 2: 스레드 구현**

`agent-thread.tsx` 요구사항:

- **빈 화면**(메시지 0개): 가운데 `🌱` + `뭐든 물어보고, 시켜도 돼요` + **예시 칩 3개**. 칩은 탭하면 바로 전송된다.
  - `발리 사진 어디 있지?`
  - `내일 우유 사기 할일 추가해줘`
  - `다음 검진 언제라고 했지?`
  - 두 번째 칩이 **"시키기도 된다"** 를 전달한다 — 버튼 이름이 못 하는 일이다. 문구를 바꾸더라도 이 역할은 유지하라.
- **사용자 말풍선**: 오른쪽 정렬, `palette("lavender").soft` 배경, 둥근 모서리.
- **포동이 말풍선**: 왼쪽, `bg-surface` + `border-line`. 본문은 `components/markdown-view.tsx` 의 `MarkdownView` 재사용.
- **진행 표시**: `toolLabel` 이 있으면 말풍선 아래에 `📂 {label}` 한 줄(`text-sm text-ink-soft`). 끝나면 사라진다.
- **결과 카드**: `result.ok && result.label` 이면 카드 하나 — 제목(`label`), `path` 가 있으면 `[보러가기]`(Next `Link`), `undo` 가 있으면 `[되돌리기]`.
  - 되돌리기는 `POST /api/agent/undo` 로 `{resource, id}` 만 보낸다. 성공하면 카드를 `되돌렸어요` 로 바꾸고 버튼을 없앤다.
  - **`path` 가 `/family` 나 `/decorations` 면 `[보러가기]` 를 렌더하지 마라** — 실재하지 않는 가상 경로라 404 가 난다(AGENTS.md).
- **오류**: `error` 가 있으면 말풍선 대신 `bg-danger-soft` 한 줄. 이미 흘러온 글자는 남겨둔다.

- [ ] **Step 3: 브라우저 확인 (390px + 1280px)**

`AGENT_ENABLED=true` 로 띄우고:
- 빈 화면에 칩 3개 → 탭하면 전송된다
- 답변이 한 글자씩 흘러나온다
- 도구를 쓰면 진행 표시가 떴다 사라진다
- 추가를 시키면 결과 카드에 `[보러가기] [되돌리기]` 가 뜨고, 되돌리기가 실제로 동작한다
- 진행 중 `■ 그만` 으로 멈춘다
- 키보드를 올려도 입력창이 가려지지 않는다
- 가로 스크롤 없음

**실제 사용량을 쓰므로 왕복 3~4회로 끝내라.**

- [ ] **Step 4: 커밋**

```bash
git add components/agent/agent-sheet.tsx components/agent/agent-thread.tsx
git commit -m "에이전트: 대화 시트와 말풍선"
```

---

## Task 7: 기록 목록

**Files:**
- Create: `components/agent/agent-history.tsx`
- Modify: `components/agent/agent-sheet.tsx` (`view === "history"` 연결)

- [ ] **Step 1: 구현**

요구사항:

- 열릴 때 `GET /api/agent/chats` 로 목록을 받는다. 로딩 중에는 `components/ui` 의 `Spinner`.
- 항목: 제목(한 줄, `truncate`) + `lib/date.ts` 의 헬퍼로 만든 시각 + 메시지 수.
- 탭하면 `load(id)` 후 `view` 를 `"chat"` 으로.
- 삭제: 행 오른쪽 `IconButton`(`Trash2`, `variant="danger"`). **모바일에서도 항상 보이게** — `opacity-100 lg:opacity-0 lg:group-hover:opacity-100`(이 저장소 규칙). 누르면 `confirm` 없이 바로 지우되 실패 시 되돌린다(낙관적 업데이트, 이 저장소의 기존 패턴).
- 비어 있으면 `아직 나눈 이야기가 없어요.` 한 줄.

- [ ] **Step 2: 브라우저 확인 (390px)**

대화를 2개 만든 뒤 `☰` → 목록에 둘 다 보이고, 탭하면 이어지고, 삭제가 동작한다.

- [ ] **Step 3: 커밋**

```bash
git add components/agent/agent-history.tsx components/agent/agent-sheet.tsx
git commit -m "에이전트: 대화 기록 목록"
```

---

## Task 8: 문서 · 전역 검증

**Files:**
- Modify: `AGENTS.md`, `DEPLOY.md`

- [ ] **Step 1: 문서 갱신**

`AGENTS.md` 의 "사이트 에이전트" 절:
- **"2단계가 지켜야 할 것" 목록에서 이제 지켜진 항목을 "지켜짐"으로 옮겨라** — `enabled` 게이트, 되돌리기 계약, `ctx.origin`, `maxDuration`, `toolCalls`↔`toolCallId` 짝 보존. 목록이 계속 "앞으로 지켜야 할 것"으로 남아 있으면 다음 사람이 또 확인한다.
- 화면 파일 위치 한 줄: `components/agent/*`, 라우트는 `app/api/agent/*`.

`DEPLOY.md`:
- 환경변수 표에 `AGENT_ENABLED`(켤 때 `true`)·`AGENT_ORIGIN`(배포 주소) 추가.
- **새 테이블 `AgentChat`·`AgentChatMessage` 를 배포 전에 `prisma db push` 로 반영**해야 한다는 줄. 코드가 먼저 올라가면 대화창이 500 난다.

- [ ] **Step 2: 전역 검증**

```bash
npm test
npx tsc --noEmit
npx eslint lib/agent components/agent app/api/agent
npm run build
```
Expected: 전부 통과. 기준선은 **226개 통과** + Task 1 의 10개.

- [ ] **Step 3: `AgentAuth` 무사 확인**

Run: `psql "postgresql://ascentai@localhost:5432/podong" -c 'SELECT id, "updatedAt" FROM "AgentAuth";'`
Expected: `2026-09-18 00:05:29.574` 그대로

- [ ] **Step 4: 커밋**

```bash
git add AGENTS.md DEPLOY.md
git commit -m "에이전트: 2단계 문서 갱신"
```

---

## 완료 조건

1. `npm test` 통과 (기준선 226 + 신규 10)
2. `npx tsc --noEmit` 0
3. `npx eslint lib/agent components/agent app/api/agent` 0
4. `npm run build` 성공
5. 390px 브라우저에서 대화·기록·되돌리기·중단이 실제로 동작
6. `AgentAuth.main` 의 `updatedAt` 불변
7. **Neon 반영과 `git push` 는 하지 않는다** — 메인 에이전트가 검토 후 수행

## 범위 밖

화면 캡처(3층 `view_screen`) · 대화 검색 · 사용자별 기록 분리 · 예약 실행 · `AgentRun` 로그 기록(테이블만 있고 쓰는 코드는 여전히 없다).
