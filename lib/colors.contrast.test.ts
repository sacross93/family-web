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

/** 색상각(0~360). 두 색이 '다른 색' 인지는 밝기가 아니라 이것으로 잰다. */
function hue(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** 두 색이 색상환에서 벌어진 각도(0~180). */
function hueApart(a: string, b: string): number {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
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

  it("판이 바탕에서 떠 보인다 — 흰 판과 종이가 같은 색이면 화면이 죽이 된다", () => {
    // 핑크 파스텔로 칠하고 나서 흰 판 vs 종이가 **1.078** 이었다. 카드 테두리(1.15)도
    // 옅은 핑크라, 목록이 배경에 녹아 어디까지가 한 판인지 눈으로 잡히지 않았다.
    // 대비 기준(4.5/3)은 **글자** 이야기라 여기엔 안 맞는다 — 넓은 면끼리는
    // 훨씬 작은 차이로도 구별되지만, 1.08 은 그 아래다.
    const lift = contrast(token("surface"), token("paper"));
    expect(lift, `surface vs paper = ${lift.toFixed(3)}`).toBeGreaterThanOrEqual(1.12);

    // 틀(상단바·탭바·히어로)도 바탕과 구별돼야 한다.
    const frame = contrast(token("chrome"), token("paper"));
    expect(frame, `chrome vs paper = ${frame.toFixed(3)}`).toBeGreaterThanOrEqual(1.12);
  });

  it("가라앉은 칸(sunken) 위에서도 3:1 은 넘는다", () => {
    for (const fg of ["ink", "ink-soft", "ink-faint"]) {
      const r = contrast(token(fg), token("sunken"));
      expect(r, `${fg} on sunken = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("주요 색은 UI 요소 기준(3:1)을 넘는다 — 아이콘·테두리·큰 글씨에 쓴다", () => {
    // primary 는 흰 판에서 4.9:1 로 AA 를 넘기지만, 들어간 자리(4.2)·틀(3.8) 위에서는
    // 못 넘는다. 어느 배경에 놓일지 모르는 채로는 쓸 수 없다는 뜻이라, **글자에는
    // 언제나 primary-ink** 를 쓴다. 브랜드 색이라 값 자체는 건드리지 않는다.
    for (const bg of BACKGROUNDS) {
      expect(contrast(token("primary"), token(bg))).toBeGreaterThanOrEqual(3);
    }
    // 그 primary-ink 는 네 배경 어디에 놓여도 AA 를 넘어야 한다 — 위 문장의 근거다.
    for (const bg of [...BACKGROUNDS, "sunken", "chrome"]) {
      const r = contrast(token("primary-ink"), token(bg));
      expect(r, `primary-ink on ${bg} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("오류 글자는 어느 배경에서도 AA 를 넘는다", () => {
    // `danger` 를 글자로 쓰면 danger-soft 위 3.7:1, 흰 배경 4.4:1 이라 본문 기준에 못 미친다.
    // 글자에는 언제나 `danger-ink`.
    for (const bg of ["danger-soft", "surface", "paper"]) {
      const r = contrast(token("danger-ink"), token(bg));
      expect(r, `danger-ink on ${bg} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
    // `danger` 자체는 아이콘·테두리·배경용(3:1).
    expect(contrast(token("danger"), token("surface"))).toBeGreaterThanOrEqual(3);
  });

  it("틀(chrome) 위의 글자도 AA 를 넘는다", () => {
    // 사이드바·상단바·탭바·히어로가 전부 이 색 위에 있다. 틀이 연한 로즈로 밝아졌어도
    // ink 세 벌을 그대로 옮겨 쓸 수는 없다 — `ink-faint` 는 이 로즈 위에서 4.34:1 로
    // AA 에 못 미친다. `chrome-faint`(5.2)가 따로 있는 이유가 그것이다.
    for (const fg of ["chrome-ink", "chrome-faint"]) {
      const r = contrast(token(fg), token("chrome"));
      expect(r, `${fg} on chrome = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
    // 두 단계가 구별돼야 위계가 산다.
    expect(contrast(token("chrome-ink"), token("chrome"))).toBeGreaterThan(
      contrast(token("chrome-faint"), token("chrome")) * 1.3
    );
  });

  it("위험색이 브랜드색과 **색상**으로 구별된다 — 지우기와 저장이 같은 색이면 안 된다", () => {
    // 브랜드가 로즈가 된 뒤, 예전 danger-ink(#a6475d)는 primary-ink(#a93a63)와
    // 색상각이 8도밖에 안 떨어져 있었다. 글자 색만으로 "지우기" 와 "저장" 을 가릴 수 없다.
    //
    // **여기서 대비(contrast)를 쓰면 안 된다.** WCAG 대비는 밝기만 재므로,
    // 색상이 전혀 달라도 밝기가 비슷하면 1.0 이 나온다 — 처음에 그렇게 썼다가
    // 멀쩡히 떼어 놓은 색이 "같다" 고 나왔다. 색이 다른지는 **색상각**으로 잰다.
    const apart = hueApart(token("danger-ink"), token("primary-ink"));
    expect(apart, `danger-ink vs primary-ink = ${apart.toFixed(0)}도`).toBeGreaterThanOrEqual(20);
  });

  it("주요 버튼의 흰 글자가 AA 를 넘는다", () => {
    // 예전 primary(#7a6cf0)는 4.01:1 이라 버튼 글씨가 기준에 못 미쳤다.
    expect(contrast("#ffffff", token("primary"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#ffffff", token("primary-hover"))).toBeGreaterThanOrEqual(4.5);
  });

  it("강조색: 그래픽은 accent, 글자는 accent-ink", () => {
    // accent(#c2691f)는 막대·점·아이콘처럼 **그려지는 것** 전용이라 UI 기준(3:1)만 본다.
    // ⚠️ 틀 위에서 3.02 — 여유가 0.02 다. accent 나 chrome 을 건드리면 여기가 먼저 깨진다.
    for (const bg of [...BACKGROUNDS, "chrome"]) {
      const r = contrast(token("accent"), token(bg));
      expect(r, `accent on ${bg} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(3);
    }
    // 글자가 필요하면 언제나 이쪽. 틀까지 밝아져 강조색이 놓일 배경이 셋으로 늘었으니,
    // 흰 판·종이·**연한 로즈 틀** 어디에서도 AA 를 넘어야 한다.
    // (예전엔 진한 틀 위 큰 숫자를 밝은 accent 로 쓸 수 있었다. 이제 그 자리가 없다.)
    for (const bg of [...BACKGROUNDS, "chrome"]) {
      const r = contrast(token("accent-ink"), token(bg));
      expect(r, `accent-ink on ${bg} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("파스텔 태그는 제 짝 배경 위에서 3:1 을 넘는다", () => {
    // Tag 는 `bg-<색>-soft` 위에 `text-<색>-ink` 로 그려진다.
    for (const key of ["lavender", "peach", "mint", "sky", "butter", "rose"]) {
      const r = contrast(token(`${key}-ink`), token(`${key}-soft`));
      expect(r, `${key}-ink on ${key}-soft = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(3);
    }
  });
});
