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

/** Lab 거리(ΔE). 넓은 면끼리는 대비(명도)로 못 가른다 — 라벤더 쪽지는 분홍 페이지와
 *  대비 1.03 인데 잘 보이고, 로즈 쪽지는 1.03 인데 안 보인다. 이 판의 기준선은 **7**. */
function deltaE(a: string, b: string): number {
  const lab = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const to = (v: number) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const r = to((n >> 16) & 255), g = to((n >> 8) & 255), bl = to(n & 255);
    const X = r * 0.4124 + g * 0.3576 + bl * 0.1805;
    const Y = r * 0.2126 + g * 0.7152 + bl * 0.0722;
    const Z = r * 0.0193 + g * 0.1192 + bl * 0.9505;
    const f = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
    const fx = f(X / 0.95047), fy = f(Y), fz = f(Z / 1.08883);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  };
  const A = lab(a), B = lab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

/** HSL 채도(0~1). "대비를 맞춘다" 며 색을 회색으로 만들어 버리지 않았는지 보는 데 쓴다. */
function saturation(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return 0;
  return l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn);
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

  it("조작 요소의 테두리가 보인다 — 누를 동그라미가 안 보이면 못 누른다", () => {
    // WCAG 1.4.11: "무엇이 조작 요소인지 알아볼 수 있는 시각 정보" 는 3:1.
    // 핑크로 칠한 뒤 체크 동그라미·입력칸이 `line-strong` 이라 흰 판에서 **1.53:1** 이었다 —
    // 마트에서 한 손으로 누를 동그라미가 거의 안 보였다.
    // **선(테두리)과 조작 요소는 다른 기준**이라 토큰을 갈랐다.
    const r = contrast(token("control"), token("surface"));
    expect(r, `control on surface = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(3);
  });

  it("판은 **채움 아니면 가장자리**로 바탕에서 떠 보인다", () => {
    // 바탕이 분홍이던 때는 흰 판이 **채움**으로 떴다(그것도 겨우 1.078 이었다).
    // 바탕이 흰색이 된 뒤로 판도 흰색이라 채움으로는 못 뜬다 — **테두리**가 뜨게 한다.
    // 둘 중 하나만 만족하면 된다. 넓은 면끼리는 대비가 아니라 ΔE 로 잰다(§2).
    const fill = deltaE(token("surface"), token("paper"));
    const edge = deltaE(token("line"), token("paper"));
    expect(
      Math.max(fill, edge),
      `판: 채움 ΔE ${fill.toFixed(1)} · 테두리 ΔE ${edge.toFixed(1)} — 둘 다 7 아래면 카드가 안 보인다`
    ).toBeGreaterThanOrEqual(7);

    // 틀(상단바·탭바·히어로)은 **채움으로** 떠야 한다 — 거기가 분홍이 사는 자리다.
    const frame = deltaE(token("chrome"), token("paper"));
    expect(frame, `틀 ΔE ${frame.toFixed(1)}`).toBeGreaterThanOrEqual(7);
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
    // 히어로는 평평한 로즈가 아니라 **로즈 → 복숭아 기울기**다. 글자가 양 끝 어디에
    // 놓일지 모르므로 두 끝에서 다 재야 한다 — 한쪽만 재면 반대쪽에서 흐려진다.
    for (const fg of ["chrome-ink", "chrome-faint"]) {
      for (const bg of ["chrome", "peach-soft"]) {
        const r = contrast(token(fg), token(bg));
        expect(r, `${fg} on ${bg} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
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

  it("파스텔 동그라미 위의 표시는 잉크로 — 흰색은 거기서 아무것도 표시하지 못한다", () => {
    // 체크 표시(장보기·준비물), 색 고르개의 체크가 파스텔 `dot` 위에 놓인다.
    // 흰색이면 1.28(버터)~1.80(로즈) 이라 담았는지 아닌지가 눈으로 안 잡혔다.
    // 그래픽이므로 3:1 을 본다.
    for (const key of ["lavender", "peach", "mint", "sky", "butter", "rose"]) {
      const r = contrast(token("ink"), token(key));
      expect(r, `ink on ${key} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(3);
      // 흰색이 왜 안 되는지도 같이 박아 둔다 — 값이 바뀌면 이 줄이 먼저 알려 준다.
      expect(contrast("#ffffff", token(key)), `흰색 on ${key}`).toBeLessThan(3);
    }
  });

  it("대화의 두 말풍선이 바탕에서도, 서로에게서도 보인다 — 누가 한 말인지 모양으로 알아야 한다", () => {
    // 이 자리는 두 번 무너졌다. 처음엔 포동이의 **흰** 카드가 **흰** 시트 위에 얹혀
    // 1.24:1 이었고(대화 바탕을 `paper` 로 내려 고쳤다), 그 다음엔 내 말풍선이
    // `primary-soft` 라 그 `paper` 위에서 **1.04:1** 이 됐다 — 풍선은 사라지고
    // 로즈 글자만 떠 있었다. 글자 대비만 재면 둘 다 통과한다(5.7:1). 판을 따로 봐야 한다.
    const THREAD = "paper";
    // 내 말풍선은 **채움**(로즈)으로, 포동이 카드는 **테두리**로 뜬다 — 바탕이 흰색이 된 뒤로
    // 흰 카드는 채움으로 뜰 수 없다. 판 규칙과 같다: 둘 중 하나만 7을 넘으면 된다.
    const mine = deltaE(token("chrome"), token(THREAD));
    expect(mine, `내 말풍선 ΔE ${mine.toFixed(1)}`).toBeGreaterThanOrEqual(7);

    const botFill = deltaE(token("surface"), token(THREAD));
    const botEdge = deltaE(token("line"), token(THREAD));
    expect(
      Math.max(botFill, botEdge),
      `포동이 카드: 채움 ΔE ${botFill.toFixed(1)} · 테두리 ΔE ${botEdge.toFixed(1)}`
    ).toBeGreaterThanOrEqual(7);

    // 둘이 서로 달라야 누가 한 말인지 알 수 있다.
    const between = deltaE(token("surface"), token("chrome"));
    expect(between, `내 말풍선 vs 포동이 카드 ΔE ${between.toFixed(1)}`).toBeGreaterThanOrEqual(7);
  });

  it("토스트가 페이지에서 떠 보인다 — 3초 뒤 사라지는 판이 바탕과 같은 색이면 못 본다", () => {
    // 토스트는 본문 위 어디에나 뜬다: 페이지(paper)·흰 판(surface)·틀(chrome).
    // 옛 오류 토스트는 `danger-soft` 라 페이지 위에서 **1.02:1** 이었다 — 테두리와
    // 그림자만으로 버티고 있었고, `say()` 는 전부 오류라 가족이 보는 토스트는 그것뿐이었다.
    for (const plate of ["ink", "danger-ink"]) {
      for (const bg of ["paper", "surface", "chrome"]) {
        const r = contrast(token(plate), token(bg));
        expect(r, `토스트 ${plate} on ${bg} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(3);
      }
      // 판이 어두우니 글자는 흰색. 그 짝도 본문 기준을 넘어야 한다.
      const w = contrast("#ffffff", token(plate));
      expect(w, `흰 글자 on ${plate} = ${w.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
    // 오류인지 아닌지가 **색으로** 구별돼야 한다 — 둘 다 어두우니 명도로는 못 가린다.
    const apart = hueApart(token("danger-ink"), token("ink"));
    expect(apart, `danger-ink vs ink = ${apart.toFixed(0)}도`).toBeGreaterThanOrEqual(20);
  });

  it("파스텔 채움이 **흰 바탕에서** 보인다 — 태그·쪽지가 종이에 묻히면 안 된다", () => {
    // 바탕이 흰색이 된 뒤로 이게 기준선이다. 분홍 바탕일 때는 로즈 계열이 묻혔는데
    // (게시판 로즈 쪽지 ΔE 2.9) 흰 바탕에서는 여섯 다 10~15 로 산다.
    // 파스텔을 더 옅게 만들고 싶어지면 여기부터 볼 것.
    for (const key of ["lavender", "peach", "mint", "sky", "butter", "rose"]) {
      const d = deltaE(token(`${key}-soft`), token("paper"));
      expect(d, `${key}-soft on paper = ΔE ${d.toFixed(1)}`).toBeGreaterThanOrEqual(7);
    }
  });

  it("파스텔 잉크는 **본문 기준(4.5:1)** 이다 — 3:1 로 재던 것이 화면에서 37곳을 놓쳤다", () => {
    // 이 여섯 잉크는 태그 안에만 있는 게 아니다: 사이드바에서 **지금 있는 메뉴의 이름**
    // ("장보기" 15px · "공유 장보기 목록" 11px), 게시판 쪽지의 **쓴 사람**,
    // 캘린더의 **요일·주말 날짜** 가 전부 이 색이다. 전부 작은 본문 글씨다.
    //
    // 예전엔 3:1(UI 요소 기준)만 요구했고, 그래서 버터 3.42 · 피치 3.31 · 로즈 3.60 이
    // 통과한 채 배포됐다. 화면에 그려진 색을 실제로 재 보고서야 드러났다.
    //
    // 두 판 다 본다 — 태그는 `-soft` 위, 사이드바 이름은 **흰 판** 위에 놓인다.
    for (const key of ["lavender", "peach", "mint", "sky", "butter", "rose"]) {
      for (const bg of [`${key}-soft`, "surface"]) {
        const r = contrast(token(`${key}-ink`), token(bg));
        expect(r, `${key}-ink on ${bg} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("잉크를 어둡게 해도 파스텔 알맹이는 파스텔로 남는다 — 진해지면 아기자기함이 죽는다", () => {
    // 위 검사를 만족시키는 가장 쉬운 길은 여섯 색을 전부 검정에 가깝게 만드는 것이다.
    // 그러면 통과는 하지만 팔레트가 사라진다. 채도로 막아 둔다.
    for (const key of ["lavender", "peach", "mint", "sky", "butter", "rose"]) {
      const s = saturation(token(`${key}-ink`));
      expect(s, `${key}-ink 채도 = ${s.toFixed(2)}`).toBeGreaterThanOrEqual(0.3);
    }
  });
});
