// 포동이를 **모델 없이** 끝까지 한 번 돌려 본다.  npm run agent:smoke [기준주소]
//
// 왜 필요한가: 엔진·도구·라우트를 여러 번 고쳤는데 **진짜 모델로는 한 번도 못 돌려 본다**
// — 가족의 개인 ChatGPT 사용량으로 돌기 때문이다(PODONGI.md). 그래서 모델 자리에만
// 대본 재생기(`llm/fake.ts`)를 끼우고 **나머지는 전부 진짜**로 돌린다:
// 진짜 리소스 17종 · 진짜 DB · 진짜 API 라우트 · 진짜 세션 쿠키.
//
// 단위 시험은 가짜 리소스로 돈다(빠르고 DB가 필요 없다). 그래서 여기서만 걸리는 것이 있다:
// 진짜 `toBody` 가 던지거나, 진짜 목차 쿼리가 깨지거나, 라우트가 400 을 주는 것들.
//
// 만든 것은 **끝에 지운다.** 지우지 못하면 무엇이 남았는지 큰 소리로 알린다.

import { createFakeProvider } from "../lib/agent/llm/fake";
import { runAgent } from "../lib/agent/loop";
import { RESOURCES } from "../lib/agent/resources";
import { prisma } from "../lib/prisma";

const BASE = process.argv[2] || "http://localhost:3001";

/** 로컬에서만 돈다. 운영에 항목을 만들어 놓고 오면 안 된다(ui-flows 와 같은 규칙). */
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE)) {
  console.error(`로컬 주소여야 합니다(항목을 만들고 지웁니다). 받은 값: ${BASE}`);
  process.exit(1);
}

const MARK = (ok: boolean) => (ok ? "✓" : "✗");
let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failed += 1;
  console.log(`  ${MARK(ok)} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.SMOKE_USER || "wlsdud022",
      password: process.env.SMOKE_PASS || "960208",
    }),
  });
  if (!res.ok) throw new Error(`로그인 실패 ${res.status} — 서버가 떠 있나요? (${BASE})`);
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  const cookie = await login();
  const ctx = { origin: BASE, cookie, resources: RESOURCES };
  const title = `연기 시험 ${Date.now()}`;
  let madeId: string | null = null;

  // 대본: ① 목록을 본다 ② 할일을 만든다 ③ 말하고 끝낸다.
  // 진짜 모델이 하는 일과 같은 모양이고, 세 단계 다 진짜 도구를 탄다.
  const provider = createFakeProvider([
    [{ type: "tool_call", id: "c1", name: "list_resource", args: { resource: "todo" } }, { type: "done" }],
    [
      { type: "tool_call", id: "c2", name: "create_item", args: { resource: "todo", args: { title, date: "2026-09-22" } } },
      { type: "done" },
    ],
    [{ type: "text", delta: "다 했어요." }, { type: "done" }],
  ]);

  console.log(`포동이 연기 시험 — ${BASE} (모델 호출 0회)\n`);
  const seen: string[] = [];
  let listed = false;
  let stored: { title: string; hint?: string } | null = null;
  let undo: { resource: string; id: string } | null = null;

  for await (const e of runAgent({ question: "할일 뭐 있어? 그리고 하나 추가해줘", provider, ctx, screen: "/todos", speaker: "엄마" })) {
    seen.push(e.type);
    if (e.type === "tool_start") console.log(`  → ${e.name}: ${e.label}`);
    if (e.type === "tool_result" && e.result.ok) {
      if (Array.isArray(e.result.data)) listed = true;
      if (e.result.stored) stored = e.result.stored;
      if (e.result.undo) undo = e.result.undo;
      if (e.result.undo) madeId = e.result.undo.id;
    }
    if (e.type === "tool_result" && !e.result.ok) console.log(`  ! 도구 실패: ${e.result.error}`);
    if (e.type === "error") console.log(`  ! 오류: ${e.message}`);
  }

  console.log("");
  check("세 왕복이 다 돌았다", provider.calls.length === 3, `${provider.calls.length}회`);
  check("오늘 날짜가 안내문에 있다", provider.calls[0].system.includes("[오늘]"));
  check("보고 있는 화면이 안내문에 있다", provider.calls[0].system.includes("/todos"));
  check("말하는 사람이 짐작으로 붙었다", provider.calls[0].system.includes("짐작"));
  check("목록을 진짜로 읽었다", listed);
  check("항목이 만들어졌다", Boolean(madeId), madeId ?? "없음");
  check("되읽어 확인했다(stored)", Boolean(stored), stored ? `${stored.title}${stored.hint ? ` · ${stored.hint}` : ""}` : "없음");
  check("되돌리기 정보가 붙었다", Boolean(undo), undo ? `${undo.resource}:${undo.id}` : "없음");
  check("저장된 제목이 보낸 것과 같다", stored?.title === title);
  check("오류 없이 끝났다", seen.at(-1) === "done" && !seen.includes("error"));

  // 만든 것은 지운다. 못 지우면 큰 소리로 알린다 — 조용히 남기는 것이 제일 나쁘다.
  if (madeId) {
    const del = await fetch(`${BASE}/api/todos/${madeId}`, { method: "DELETE", headers: { cookie } });
    check("만든 것을 지웠다", del.ok, `${del.status}`);
    const left = await prisma.todo.findUnique({ where: { id: madeId }, select: { id: true } });
    check("정말 없어졌다", left === null, left ? `아직 남아 있습니다: ${madeId}` : "");
  }

  console.log(failed === 0 ? "\n✓ 모두 통과" : `\n✗ ${failed}건 실패`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
