import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 글자색이 배경에서 읽히는가 (WCAG AA: 본문 4.5:1, 큰 글씨·UI 요소 3:1).
 *
 * 토큰 값만 보므로 브라우저가 필요 없고 결과가 흔들리지 않는다.
 * 실제로 그려진 글자를 재는 쪽이 더 정확하겠지만, 그러려면 그라데이션·알파·이모지를
 * 다 다뤄야 해서 측정기 자체를 믿기 어려웠다. **여기서 보는 것은 단색 배경 위의 글자**고,
 * `ink` 세 단계가 실제로 놓이는 자리가 거기다.
 *
 * 예전 `--color-ink-faint`(#a6a6b2)는 흰 배경에서 **2.41:1** 이었다 —
 * 날짜·개수·캡션이 사실상 안 읽혔다.
 */

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function token(name: string): string {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`토큰을 못 찾았어요: --color-${name}`);
  return m[1];
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** 글자가 실제로 놓이는 단색 배경들. */
const BACKGROUNDS = ["surface", "paper"] as const;

describe("글자 대비", () => {
  it("본문 세 단계가 모두 AA(4.5:1) 를 넘는다", () => {
    for (const fg of ["ink", "ink-soft", "ink-faint"]) {
      for (const bg of BACKGROUNDS) {
        const r = contrast(token(fg), token(bg));
        expect(r, `${fg} on ${bg} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("세 단계가 서로 구별된다 — 대비만 맞추다 한 덩어리가 되면 위계가 사라진다", () => {
    const [a, b, c] = ["ink", "ink-soft", "ink-faint"].map((t) =>
      contrast(token(t), token("surface"))
    );
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    // 눈에 보일 만큼은 벌어져 있어야 한다.
    expect(a / b).toBeGreaterThan(1.3);
    expect(b / c).toBeGreaterThan(1.3);
  });

  it("가라앉은 칸(sunken) 위에서도 3:1 은 넘는다", () => {
    for (const fg of ["ink", "ink-soft", "ink-faint"]) {
      const r = contrast(token(fg), token("sunken"));
      expect(r, `${fg} on sunken = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("주요 색은 UI 요소 기준(3:1)을 넘는다 — 아이콘·테두리·큰 글씨에 쓴다", () => {
    // 본문 색으로는 쓰지 않는다(4.5 미만). 브랜드 색이라 값 자체는 건드리지 않는다.
    for (const bg of BACKGROUNDS) {
      expect(contrast(token("primary"), token(bg))).toBeGreaterThanOrEqual(3);
    }
    // 글자로 쓰는 자리에는 진한 쪽을.
    for (const bg of BACKGROUNDS) {
      expect(contrast(token("primary-ink"), token(bg))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("오류 글자는 오류 배경 위에서 AA 를 넘는다", () => {
    // `danger` 를 글자로 쓰면 2.84:1 이라 안 읽힌다 — 글자에는 `danger-ink`.
    expect(contrast(token("danger-ink"), token("danger-soft"))).toBeGreaterThanOrEqual(4.5);
    // `danger` 자체는 아이콘·테두리용(3:1).
    expect(contrast(token("danger"), token("surface"))).toBeGreaterThanOrEqual(3);
  });

  it("파스텔 태그는 제 짝 배경 위에서 3:1 을 넘는다", () => {
    // Tag 는 `bg-<색>-soft` 위에 `text-<색>-ink` 로 그려진다.
    for (const key of ["lavender", "peach", "mint", "sky", "butter", "rose"]) {
      const r = contrast(token(`${key}-ink`), token(`${key}-soft`));
      expect(r, `${key}-ink on ${key}-soft = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(3);
    }
  });
});
