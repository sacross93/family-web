import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * DESIGN.md 가 **지금 색**을 말하고 있는가.
 *
 * `AGENTS.md` 는 "새 화면/기능 전에 DESIGN.md 필독" 이라고 못박는다. 그런데 팔레트를
 * 두 번 바꾸는 동안 문서의 색 표가 **한 판 전 값에 머물러 있었다** — 진한 자두에서
 * 핑크로 옮길 때 한 번, 세 단계를 벌릴 때 또 한 번. 필독 문서가 거짓말을 하면
 * 안 읽는 것만 못하다.
 *
 * 값을 문서에 **또 적는 것** 자체가 위험이지만(두 곳이 어긋날 수 있다), 사람이 읽는
 * 문서에 숫자가 있어야 판단이 된다. 그래서 적되, **어긋나면 여기서 걸리게** 한다.
 */

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const doc = readFileSync(join(process.cwd(), "DESIGN.md"), "utf8");

function token(name: string): string | null {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  return m ? m[1].toLowerCase() : null;
}

/** DESIGN.md 안에서 `토큰` … `#hex` 꼴로 적힌 짝을 전부 걷는다. */
function documented(): { name: string; hex: string; line: number }[] {
  const out: { name: string; hex: string; line: number }[] = [];
  doc.split("\n").forEach((line, i) => {
    // 표 한 줄 또는 본문 한 줄에서 `이름` 과 `#hex` 가 같이 나오는 경우
    const names = [...line.matchAll(/`([a-z][a-z-]*)`/g)].map((m) => m[1]);
    const hexes = [...line.matchAll(/`(#[0-9a-fA-F]{6})`|\|\s*`?(#[0-9a-fA-F]{6})`?\s*\|/g)]
      .map((m) => (m[1] ?? m[2]).toLowerCase());
    if (names.length === 0 || hexes.length === 0) return;
    // 같은 줄에 이름과 값이 같은 수만큼 있을 때만 짝으로 본다(표의 `a / b` 꼴 포함).
    if (names.length !== hexes.length) return;
    names.forEach((name, k) => {
      if (token(name)) out.push({ name, hex: hexes[k], line: i + 1 });
    });
  });
  return out;
}

describe("밝은 화면 하나뿐이라는 것을 브라우저에 알려 준다", () => {
  it("color-scheme: light 를 선언한다", () => {
    // 선언하지 않으면 브라우저 기본 UI(날짜 고르개 팝업·선택 목록·자동완성 칠·스크롤바)가
    // **폰의 설정**을 따른다 — 다크 모드 폰에서 우리 흰 입력칸 위로 어두운 팝업이 떨어진다.
    // 화면으로는 안 잡힌다(팝업은 스크린샷에 안 찍힌다). 그래서 선언 여부로 잰다.
    expect(css).toMatch(/color-scheme:\s*light/);
  });
});

describe("폰 상태바 색이 틀 색과 같은가", () => {
  it("layout.tsx 의 themeColor 가 --color-chrome 과 같다", () => {
    // `Viewport` 는 CSS 변수를 못 읽어 **손으로 베낀 값**이다. 팔레트를 두 번 바꾸는 동안
    // 두 번 다 어긋나 있었다 — 폰 위쪽 상태바만 혼자 옛 색이었다(화면 안쪽은 멀쩡해서
    // 스크린샷으로도 안 잡힌다). 베껴 적은 값은 반드시 어긋나므로 여기서 잡는다.
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
    const m = layout.match(/themeColor:\s*"(#[0-9a-fA-F]{6})"/);
    expect(m, "layout.tsx 에서 themeColor 를 못 찾았어요").not.toBeNull();
    expect(m![1].toLowerCase(), "themeColor 가 --color-chrome 과 다릅니다").toBe(
      token("chrome")
    );
  });
});

describe("DESIGN.md 의 색이 실제 토큰과 같은가", () => {
  it("문서에 적힌 색을 하나라도 찾는다 — 못 찾으면 이 검사가 헛돈다", () => {
    expect(documented().length).toBeGreaterThanOrEqual(8);
  });

  it("문서에 적힌 값이 전부 globals.css 와 같다", () => {
    for (const { name, hex, line } of documented()) {
      expect(hex, `DESIGN.md:${line} 의 ${name} = ${hex}, 실제는 ${token(name)}`).toBe(
        token(name)
      );
    }
  });
});
