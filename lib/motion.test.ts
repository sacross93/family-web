import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 등장 애니메이션의 **예산**.
 *
 * 한때 목록·격자·카드 다섯 곳이 들어올 때마다 다시 스르륵 올라왔다. 이미 받아 둔
 * 내용인데 다 보이기까지 캘린더 397ms · 사진첩 408ms · 게시판 447ms 가 걸렸다
 * (네트워크 없는 로컬 기준). 페이지를 옮길 때마다 그만큼 늦어 보인다.
 *
 * 규칙: **무언가 도착할 때만 움직인다.** 토스트, 알림 줄, 열리는 판.
 * 목록에 이미 있는 것은 그냥 거기 있으면 된다.
 *
 * 이 시험은 취향을 강제하지 않는다 — 늘리려면 여기 한 줄을 **일부러** 적게 만든다.
 */
const ALLOWED = new Map([
  ["components/ui/toast.tsx", "토스트 — 방금 도착한 말"],
  ["app/todos/todos-client.tsx", "알림 줄 — 방금 생긴 안내"],
  ["components/ui/modal.tsx", "모달 — 지금 열리는 판"],
  ["components/app-shell.tsx", "드로어 — 지금 열리는 판"],
  ["components/agent/agent-sheet.tsx", "포동이 시트 — 지금 열리는 판"],
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("모션 예산", () => {
  it("등장 애니메이션은 **도착하는 것**에만 붙는다", () => {
    const root = process.cwd();
    const offenders: string[] = [];
    for (const file of [...walk(join(root, "app")), ...walk(join(root, "components"))]) {
      const rel = file.slice(root.length + 1);
      const src = readFileSync(file, "utf8");
      if (!/animate-(fade-up|pop-in|\[)/.test(src)) continue;
      if (!ALLOWED.has(rel)) offenders.push(rel);
    }
    expect(
      offenders,
      `목록에 없는 곳에 등장 애니메이션이 붙었습니다: ${offenders.join(", ")}\n` +
        `무언가 **도착하는** 자리라면 lib/motion.test.ts 의 ALLOWED 에 이유와 함께 추가하세요.`
    ).toEqual([]);
  });

  it("허용 목록이 실제로 쓰이고 있다 — 죽은 줄은 규칙을 흐린다", () => {
    const root = process.cwd();
    for (const [rel, why] of ALLOWED) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(/animate-(fade-up|pop-in|\[)/.test(src), `${rel} (${why}) 에 애니메이션이 없습니다`).toBe(true);
    }
  });
});
