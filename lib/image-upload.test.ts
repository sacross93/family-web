import { describe, it, expect } from "vitest";
import { fitWithin, keepAsIs, MAX_EDGE } from "./image-upload";

describe("올리기 전 사진 줄이기", () => {
  it("긴 변을 상한에 맞추고 비율을 지킨다", () => {
    // 폰 카메라 원본(4032×3024)을 앨범 상한으로.
    expect(fitWithin(4032, 3024, MAX_EDGE.photo)).toEqual({ width: 2000, height: 1500 });
    // 세로 사진도 같은 규칙.
    expect(fitWithin(3024, 4032, MAX_EDGE.photo)).toEqual({ width: 1500, height: 2000 });
  });

  it("작은 사진을 늘리지 않는다", () => {
    expect(fitWithin(320, 240, MAX_EDGE.photo)).toEqual({ width: 320, height: 240 });
    expect(fitWithin(600, 600, MAX_EDGE.sticker)).toEqual({ width: 600, height: 600 });
  });

  it("0 을 넣어도 터지지 않는다", () => {
    expect(fitWithin(0, 0, MAX_EDGE.photo)).toEqual({ width: 0, height: 0 });
  });

  it("쓰임새마다 다른 잣대 — 추억은 넉넉히, 장식은 작게", () => {
    expect(MAX_EDGE.photo).toBeGreaterThan(MAX_EDGE.brand);
    expect(MAX_EDGE.brand).toBeGreaterThan(MAX_EDGE.sticker);
    // 스티커는 화면에서 300px 이하로 그려진다 — 2배(고해상도 화면)면 충분하다.
    expect(MAX_EDGE.sticker).toBeGreaterThanOrEqual(600);
  });

  it("움직이는 그림과 벡터는 손대지 않는다", () => {
    expect(keepAsIs("image/gif")).toBe(true);
    expect(keepAsIs("image/svg+xml")).toBe(true);
    expect(keepAsIs("image/jpeg")).toBe(false);
    expect(keepAsIs("image/png")).toBe(false);
    expect(keepAsIs("image/heic")).toBe(false);
  });
});
