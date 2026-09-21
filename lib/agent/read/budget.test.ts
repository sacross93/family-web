import { describe, expect, it } from "vitest";

import { budget, budgetBodies, composeRead, truncationNote } from "./budget";

describe("truncationNote", () => {
  it("몇 분의 몇을 봤는지 숫자로 말한다", () => {
    // 실측: namu.wiki 43,270자 / 상한 3,000자 = 7%
    const note = truncationNote(3000, 43270);
    expect(note).toContain("43,270자");
    expect(note).toContain("3,000자");
    expect(note).toContain("7%");
  });

  it("아주 조금만 읽었어도 0% 라고 하지 않는다", () => {
    expect(truncationNote(10, 100000)).toContain("1%");
  });
});

describe("budget", () => {
  it("상한 안이면 그대로 두고 잘림 표시도 없다", () => {
    const r = budget("짧은 글입니다.", 100);
    expect(r.text).toBe("짧은 글입니다.");
    expect(r.truncated).toBe(false);
    expect(r.original).toBe("짧은 글입니다.".length);
  });

  it("넘치면 자르고 **얼마나 잘랐는지** 붙인다 — … 하나로는 전달되지 않는다", () => {
    const long = "가".repeat(5000);
    const r = budget(long, 1000);
    expect(r.truncated).toBe(true);
    expect(r.original).toBe(5000);
    expect(r.text).toContain("전체 5,000자");
    expect(r.text).toContain("약 20%");
  });

  it("문장 끝에서 끊는다", () => {
    const text = `${"앞부분입니다. ".repeat(60)}뒤에 더 있습니다.`;
    const r = budget(text, 500);
    // 꼬리표 앞의 마지막 글자가 문장 끝이어야 한다
    const bodyOnly = r.text.split("\n\n…")[0];
    expect(bodyOnly.endsWith(".")).toBe(true);
  });

  it("되돌아볼 문장 끝이 너무 멀면 그냥 자른다", () => {
    const r = budget("가".repeat(5000), 1000); // 마침표가 하나도 없다
    const bodyOnly = r.text.split("\n\n…")[0];
    expect(bodyOnly.length).toBe(1000);
  });

  it("상한이 0 이하면 자르지 않는다 — 설정 실수로 글을 통째로 잃지 않게", () => {
    const r = budget("내용", 0);
    expect(r.truncated).toBe(false);
    expect(r.text).toBe("내용");
  });
});

describe("composeRead", () => {
  const base = { title: "임신 초기", description: "알아두면 좋은 것들", siteName: "아이사랑", bodySource: "본문" as const, maxChars: 1000 };

  it("제목·사이트·설명이 본문보다 앞에 온다 — 본문이 잘려도 이건 남는다", () => {
    const r = composeRead({ ...base, body: "본문입니다." });
    const lines = r.text.split("\n");
    expect(lines[0]).toBe("제목: 임신 초기");
    expect(lines[1]).toBe("사이트: 아이사랑");
    expect(lines[2]).toBe("설명: 알아두면 좋은 것들");
    expect(r.text.endsWith("본문입니다.")).toBe(true);
  });

  it("본문이 없으면 머리말만 — 빈 본문 자리를 만들지 않는다", () => {
    const r = composeRead({ ...base, body: "" });
    expect(r.text).toBe("제목: 임신 초기\n사이트: 아이사랑\n설명: 알아두면 좋은 것들");
    expect(r.truncated).toBe(false);
  });

  it("블롭에서 건진 글은 순서가 뒤섞였을 수 있다고 밝힌다", () => {
    const r = composeRead({ ...base, body: "조각들", bodySource: "블롭" });
    expect(r.text).toContain("순서가 뒤섞여 있을 수 있습니다");
  });

  it("본문에서 건졌으면 그 단서를 붙이지 않는다", () => {
    const r = composeRead({ ...base, body: "조각들", bodySource: "본문" });
    expect(r.text).not.toContain("순서가 뒤섞여");
  });

  it("없는 값은 줄을 만들지 않는다", () => {
    const r = composeRead({ ...base, title: "", siteName: "", description: "", body: "본문만" });
    expect(r.text).toBe("본문만"); // 머리말이 없으면 빈 줄로 시작하지 않는다
  });

  it("긴 본문은 잘리고 잘림이 보고된다", () => {
    const r = composeRead({ ...base, body: "가".repeat(9000) });
    expect(r.truncated).toBe(true);
    expect(r.original).toBe(9000);
    expect(r.text).toContain("전체 9,000자");
  });
});

describe("문장 끝을 못 찾을 때", () => {
  it("본문이 사라지지 않는다 — 상한이 작아도 앞부분은 남는다", () => {
    // 문장 부호도 줄바꿈도 없는 글(한 문단짜리 한글)에 작은 상한을 준다.
    // 예전에는 `cut = -1` 이 `-1 > 200-300` 을 통과해 `slice(0,0)` 이 되어
    // **꼬리표만 남았다**(5,000자 글이 52자로). 목록 본문을 나누기 시작하자 드러났다.
    const out = budget("가".repeat(5000), 200);
    expect(out.truncated).toBe(true);
    expect(out.text.startsWith("가".repeat(100))).toBe(true);
    expect(out.text.length).toBeGreaterThan(200);
  });

  it("문장 끝이 있으면 거기서 자른다 — 원래 하던 일은 그대로", () => {
    const text = "첫 문장입니다. " + "뒤 이야기. ".repeat(200);
    const out = budget(text, 400);
    expect(out.text.slice(0, out.text.indexOf("…")).trimEnd().endsWith(".")).toBe(true);
  });
});

describe("목록의 본문 예산", () => {
  // 바깥 웹 한 쪽에 6,000자를 주면서 **우리 게시판 목록은 무제한**이었다.
  // 실측(2026-09-21): 8,000자짜리 글 다섯 개를 심으니 list_resource 하나가
  // 647자 → 39,117자. 목록 상한은 30개라 여기서 더 간다.
  const long = (n: number) => ({ title: "제목", hint: "9월", body: "가".repeat(n) });

  it("예산 안이면 아무것도 건드리지 않는다 — 쓸데없는 꼬리표가 붙지 않게", () => {
    const entries = [long(100), long(200)];
    expect(budgetBodies(entries, 8000)).toEqual(entries);
  });

  it("넘치면 본문만 줄이고 제목·보조정보는 그대로 둔다", () => {
    const [first] = budgetBodies([long(20000), long(20000)], 4000);
    expect(first.title).toBe("제목");
    expect(first.hint).toBe("9월");
    expect(first.body.length).toBeLessThan(20000);
  });

  it("몇 자 중 몇 자인지 본문에 적는다 — 잘렸다는 것을 숨기지 않는다", () => {
    const [first] = budgetBodies([long(20000)], 4000);
    expect(first.body).toContain("20,000자");
    expect(first.body).toContain("%");
  });

  it("항목이 많아도 한 편에 최소한은 준다 — 너무 잘게 나누면 아무 편도 못 읽는다", () => {
    const many = Array.from({ length: 30 }, () => long(5000));
    const out = budgetBodies(many, 1000);
    for (const e of out) expect(e.body.length).toBeGreaterThan(200);
  });

  it("본문 없는 항목만 있으면 그대로 돌려준다", () => {
    const entries: { title: string; body?: string }[] = [{ title: "제목만" }, { title: "이것도" }];
    expect(budgetBodies(entries, 10)).toEqual(entries);
  });

  it("총량이 실제로 줄어든다 — 실측했던 그 모양으로", () => {
    const five = Array.from({ length: 5 }, () => long(8000));
    const after = budgetBodies(five, 8000).reduce((n, e) => n + e.body.length, 0);
    expect(after).toBeLessThan(five.reduce((n, e) => n + e.body.length, 0) / 4);
  });
});
