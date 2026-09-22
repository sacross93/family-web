// 포동이가 최근에 무엇을 했는지 본다.  npm run agent:runs [개수]
//
// 표(`AgentRun`)만 만들어 두고 읽을 길이 없으면 없는 것과 같다. 그래서 같은 판에 만든다.
// 여기 뜨는 것이 로그에 남는 것의 **전부**다 — 내용은 담지 않는다(run-log.ts 주석).

import { prisma } from "../lib/prisma";

const MARK: Record<string, string> = { ok: "✓", error: "✗", aborted: "…" };

function ago(at: Date): string {
  const m = Math.round((Date.now() - at.getTime()) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}시간 전` : `${Math.round(h / 24)}일 전`;
}

async function main() {
  const take = Number(process.argv[2]) > 0 ? Math.floor(Number(process.argv[2])) : 20;
  const runs = await prisma.agentRun.findMany({ orderBy: { createdAt: "desc" }, take });

  if (runs.length === 0) {
    console.log("아직 기록이 없어요. (인공 포동이에게 한 번 물어보면 여기에 남습니다)");
    return;
  }

  for (const run of runs) {
    const steps = JSON.parse(run.steps) as { name: string; ok: boolean; label?: string; ms: number }[];
    const failed = steps.filter((s) => !s.ok).length;
    console.log(
      `${MARK[run.outcome] ?? "?"} ${ago(run.createdAt)} · ${(run.ms / 1000).toFixed(1)}초 · ` +
        `도구 ${steps.length}${failed ? ` (실패 ${failed})` : ""} · ${run.toolMode ?? "-"}`
    );
    console.log(`   "${run.prompt}"`);
    for (const s of steps) {
      console.log(`   ${s.ok ? "·" : "✗"} ${s.name}${s.label ? ` — ${s.label}` : ""} (${s.ms}ms)`);
    }
    if (run.error) console.log(`   → ${run.error}`);
    console.log("");
  }

  // 실패가 몰린 도구가 있으면 그게 고칠 자리다.
  const all = runs.flatMap((r) => JSON.parse(r.steps) as { name: string; ok: boolean }[]);
  const byTool = new Map<string, { n: number; bad: number }>();
  for (const s of all) {
    const row = byTool.get(s.name) ?? { n: 0, bad: 0 };
    row.n += 1;
    if (!s.ok) row.bad += 1;
    byTool.set(s.name, row);
  }
  if (byTool.size > 0) {
    console.log("도구별:");
    for (const [name, { n, bad }] of [...byTool].sort((a, b) => b[1].bad - a[1].bad)) {
      console.log(`  ${name}: ${n}번${bad ? ` · 실패 ${bad}번` : ""}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
