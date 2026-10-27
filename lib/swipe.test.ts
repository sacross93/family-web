import { describe, it, expect } from "vitest";
import { swipeStep, SWIPE_MIN_PX } from "@/lib/swipe";

describe("swipeStep — 사진 보기 밀어서 넘기기", () => {
  it("왼쪽으로 밀면 다음, 오른쪽으로 밀면 이전", () => {
    expect(swipeStep(-120, 5)).toBe(1);
    expect(swipeStep(120, -5)).toBe(-1);
  });

  it("조금 미끄러진 것(탭)은 그대로", () => {
    expect(swipeStep(0, 0)).toBe(0);
    expect(swipeStep(-(SWIPE_MIN_PX - 1), 0)).toBe(0);
    expect(swipeStep(-SWIPE_MIN_PX, 0)).toBe(1);
  });

  it("세로·대각선은 스크롤이다 — 넘기지 않는다", () => {
    expect(swipeStep(10, 200)).toBe(0);
    expect(swipeStep(-80, 80)).toBe(0);
    expect(swipeStep(-80, 60)).toBe(0);
    expect(swipeStep(-90, 60)).toBe(1);
  });
});
