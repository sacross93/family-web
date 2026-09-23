import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 전역 포커스 링이 **부품의 모양을 이기지 않는가.**
 *
 * `app/globals.css` 의 `:focus-visible` 기본값이 레이어 밖에 있으면서 `border-radius: 4px`
 * 까지 들고 있었다. 레이어 밖 규칙은 Tailwind 유틸리티를 명시도와 상관없이 이기므로,
 * 입력칸을 누를 때마다 20px 알약이 4px 네모로 바뀌고(브라우저에서 계산된 값으로 확인),
 * 입력칸이 스스로 그리는 링 위에 외곽선이 한 겹 더 얹혔다. 첫 버전부터 있던 줄이라
 * 두 달 동안 아무도 몰랐다 — 화면을 보면 "원래 그런가 보다" 가 된다. 그래서 글로 붙잡는다.
 */

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "", // 주석 안의 중괄호·예시 코드가 셈을 흐리지 않게 먼저 걷어 낸다
);

interface Block {
  prelude: string;
  body: string;
}

/** 한 단계의 블록들(`머리 { 몸 }`)을 중괄호 짝을 세어 자른다. */
function blocks(src: string): Block[] {
  const out: Block[] = [];
  let depth = 0;
  let preludeStart = 0;
  let bodyStart = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") {
      if (depth === 0) {
        out.push({ prelude: src.slice(preludeStart, i).trim(), body: "" });
        bodyStart = i + 1;
      }
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        out[out.length - 1].body = src.slice(bodyStart, i);
        preludeStart = i + 1;
      }
    } else if (ch === ";" && depth === 0) {
      preludeStart = i + 1; // `@import "tailwindcss";` 같은 한 줄 문장
    }
  }
  return out;
}

/** 모든 깊이에서 선택자에 `:focus-visible` 이 들어간 규칙. */
function focusRules(src: string): Block[] {
  return blocks(src).flatMap((b) =>
    b.prelude.startsWith("@") ? focusRules(b.body) : b.prelude.includes(":focus-visible") ? [b] : [],
  );
}

describe("전역 포커스 링", () => {
  it("검사할 규칙을 실제로 찾는다 — 못 찾으면 아래 검사가 헛돈다", () => {
    expect(focusRules(css).length).toBeGreaterThanOrEqual(2); // 기본값 + 틀(on-chrome)
  });

  it("레이어 밖에 두지 않는다 — `@layer base` 안에 있어야 부품의 `outline-none`·`rounded-*` 가 이긴다", () => {
    const top = blocks(css);
    const outside = top.filter((b) => !b.prelude.startsWith("@") && b.prelude.includes(":focus-visible"));
    expect(outside.map((b) => b.prelude), "레이어 밖의 :focus-visible 규칙").toEqual([]);
    const inBase = top
      .filter((b) => /^@layer\s+base\b/.test(b.prelude))
      .flatMap((b) => focusRules(b.body));
    expect(inBase.length, "@layer base 안의 :focus-visible 규칙").toBeGreaterThanOrEqual(2);
  });

  it("모양(모서리)은 건드리지 않는다 — 외곽선은 요소의 둥근 모서리를 따라간다", () => {
    for (const rule of focusRules(css)) {
      expect(rule.body, `${rule.prelude} 가 border-radius 를 정한다`).not.toMatch(/border-radius/);
    }
  });
});
