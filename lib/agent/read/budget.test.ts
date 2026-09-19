import { describe, expect, it } from "vitest";

import { budget, composeRead, truncationNote } from "./budget";

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
    expect(r.text).toBe("\n본문만");
  });

  it("긴 본문은 잘리고 잘림이 보고된다", () => {
    const r = composeRead({ ...base, body: "가".repeat(9000) });
    expect(r.truncated).toBe(true);
    expect(r.original).toBe(9000);
    expect(r.text).toContain("전체 9,000자");
  });
});
