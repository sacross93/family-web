import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AGENT_NAME, MEMORY_BY, byLabel, isMemoryBy } from "@/lib/agent/name";

/**
 * 이름은 **바뀐다.** 실제로 바뀌었다 — "포동이" 였다가 2026-09-22 에 "인공 포동이" 가 됐고,
 * 그때 20개 파일에 흩어진 83군데를 찾아다녀야 했다. 다시 바뀔 때 또 그러지 않게 잡아 둔다.
 */
const SCAN = [
  "components/bottom-tabs.tsx",
  "components/app-shell.tsx",
  "components/agent/agent-sheet.tsx",
  "app/memories/memories-client.tsx",
  "app/memories/page.tsx",
  "lib/agent/errors.ts",
  "lib/agent/loop.ts",
];

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

/** 주석을 뺀 코드만. 주석에 옛 이름이 남는 것은 역사 기록이라 괜찮다. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

describe("이름은 한 곳에서만 온다", () => {
  it("화면 파일이 이름을 손으로 적지 않는다", () => {
    for (const path of SCAN) {
      const code = codeOnly(source(path));
      expect(code, `${path} 에 이름이 글자로 박혀 있습니다 — AGENT_NAME 을 쓰세요`).not.toContain(
        AGENT_NAME
      );
    }
  });

  it("옛 이름이 코드에 남아 있지 않다", () => {
    // "포동" 은 집 이름이라 남아 있어도 된다. 걸러야 하는 것은 **옛 호칭**이다.
    for (const path of SCAN) {
      const code = codeOnly(source(path));
      expect(code, `${path} 에 옛 이름이 남아 있습니다`).not.toMatch(/(^|[^인공 ])포동이/);
    }
  });

  it("이름이 비어 있지 않다 — 빈 이름이면 화면이 '의 기억' 처럼 뜬다", () => {
    expect(AGENT_NAME.trim().length).toBeGreaterThan(0);
  });
});

describe("기억을 누가 적었는가", () => {
  it("저장하는 값은 **한국어 이름이 아니라 열쇠**다", () => {
    // 이름을 저장하면 다음 개명 때 옛 기억만 지난 이름을 달고 남아
    // 가족이 "얘는 누구지?" 하게 된다.
    for (const key of MEMORY_BY) expect(key).toMatch(/^[a-z]+$/);
  });

  it("열쇠를 화면 말로 옮긴다", () => {
    expect(byLabel("family")).toBe("가족");
    expect(byLabel("agent")).toBe(AGENT_NAME);
  });

  it("모르는 값은 이 아이가 적은 것으로 본다 — 빈칸으로 두지 않는다", () => {
    expect(byLabel("포동이")).toBe(AGENT_NAME); // 옛 데이터
    expect(byLabel("")).toBe(AGENT_NAME);
  });

  it("아무 글자나 저장되지 않는다", () => {
    expect(isMemoryBy("agent")).toBe(true);
    expect(isMemoryBy("family")).toBe(true);
    expect(isMemoryBy("아무거나")).toBe(false);
    expect(isMemoryBy(123)).toBe(false);
  });
});
