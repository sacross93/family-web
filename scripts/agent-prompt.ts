// 포동이가 실제로 받는 안내문을 그대로 찍는다.  npm run agent:prompt [경로] [사람이름]
//
// 왜 스크립트로 두는가: 여섯 판 동안 안내문에 칸이 셋 늘고 규칙이 하나 늘었는데
// **한 번도 통째로 읽어 본 적이 없었다.** 조각마다 시험은 있었지만, 다 합쳤을 때
// 말이 되는지는 사람이 읽어야 안다 — 읽자마자 `/baby` 가 "아기 목록" 으로 나가는 것을 봤다.
// 모델은 부르지 않는다. 사용량이 들지 않으니 안내문을 고칠 때마다 한 번씩 읽어 볼 것.
import { buildCatalog } from "../lib/agent/catalog";
import { buildSystemPrompt, memoryLines, screenLine, speakerLine } from "../lib/agent/loop";
import { agentConfig } from "../lib/agent/config";
import { RESOURCES } from "../lib/agent/resources";
import { toolSchemas } from "../lib/agent/tools";
import { createCodexProvider } from "../lib/agent/llm/codex";
import { prisma } from "../lib/prisma";

async function main() {
  const path = process.argv[2] || "/";
  const who = process.argv[3];
  const c = agentConfig();

  const [catalog, memory] = await Promise.all([
    buildCatalog(RESOURCES, c.catalogMaxChars),
    memoryLines(RESOURCES, c.memoryMaxChars),
  ]);
  const full = buildSystemPrompt(catalog, screenLine(path, RESOURCES), memory, speakerLine(who));

  console.log(full);
  console.log("\n" + "─".repeat(60));
  console.log(`안내문 ${full.length.toLocaleString("ko-KR")}자 · 목차 ${catalog.length.toLocaleString("ko-KR")}/${c.catalogMaxChars.toLocaleString("ko-KR")}자` +
    ` · 기억 ${(memory?.length ?? 0).toLocaleString("ko-KR")}/${c.memoryMaxChars.toLocaleString("ko-KR")}자`);
  if (!memory) console.log("(기억 칸 없음 — 적어 둔 것이 없거나 표가 아직 없습니다)");

  // **안내문만 보면 절반만 보는 것이다.** 도구 설명도 매 왕복에 함께 나가고, 그쪽이 더 크다.
  // 한 턴은 최대 maxSteps 번 왕복하고 그때마다 이 둘이 통째로 다시 나간다(store:false).
  const tools = toolSchemas(RESOURCES);
  const sizes = tools.map((t) => ({ 도구: t.name, 글자: JSON.stringify(t).length }));
  const toolTotal = sizes.reduce((n, x) => n + x.글자, 0);
  console.table(sizes);
  console.log(
    `도구 ${toolTotal.toLocaleString("ko-KR")}자 + 안내문 ${full.length.toLocaleString("ko-KR")}자 = ` +
      `왕복마다 ${(toolTotal + full.length).toLocaleString("ko-KR")}자 (한 턴 최대 ${c.maxSteps}왕복)`
  );

  // **공급자에게 실제로 나가는 본문.** fetch 를 갈아 끼워 본문만 붙잡고 빈 스트림을 돌려준다 —
  // 네트워크를 타지 않으므로 가족의 ChatGPT 사용량이 들지 않는다.
  // 여기서만 보이는 것들이 있다: `store` 가 정말 false 인지, `web_search` 가 정말 붙는지,
  // 어느 도구 모드로 굳었는지. 설정과 실제가 어긋나면 이 줄에서 드러난다.
  let body: Record<string, unknown> | null = null;
  const spy: typeof fetch = async (_u, init) => {
    body = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
    return new Response("data: [DONE]\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };
  try {
    const probe = createCodexProvider({ fetchImpl: spy });
    for await (const _ of probe.sendTurn({ system: full, messages: [{ role: "user", content: "." }], tools })) {
      /* 이벤트는 보지 않는다 — 본문만 붙잡으면 된다 */
    }
  } catch {
    /* 로그인 토큰이 없으면 여기서 멈춘다. 그래도 본문은 이미 잡혔을 수 있다. */
  }
  if (body) {
    const b = body as Record<string, unknown>;
    const wireTools = (b.tools as { name?: string; type?: string }[] | undefined) ?? [];
    console.log(
      `\n나가는 본문 ${JSON.stringify(b).length.toLocaleString("ko-KR")}자 · ` +
        `model=${String(b.model)} · store=${String(b.store)}\n도구: ${wireTools.map((t) => t.name ?? t.type).join(" · ")}`
    );
  } else {
    console.log("\n(나가는 본문을 못 잡았습니다 — 로그인 토큰이 없으면 그 전에 멈춥니다)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
