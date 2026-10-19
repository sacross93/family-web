import { describe, it, expect } from "vitest";
import { extForEncoded, fitWithin, keepAsIs, MAX_EDGE, outputTypeFor } from "./image-upload";

describe("올리기 전 사진 줄이기", () => {
  it("긴 변을 상한에 맞추고 비율을 지킨다", () => {
    // 폰 카메라 원본(4032×3024)을 앨범 상한으로.
    expect(fitWithin(4032, 3024, MAX_EDGE.photo)).toEqual({ width: 2000, height: 1500 });
    // 세로 사진도 같은 규칙.
    expect(fitWithin(3024, 4032, MAX_EDGE.photo)).toEqual({ width: 1500, height: 2000 });
  });

  it("작은 사진을 늘리지 않는다", () => {
    expect(fitWithin(320, 240, MAX_EDGE.photo)).toEqual({ width: 320, height: 240 });
    expect(fitWithin(600, 600, MAX_EDGE.brand)).toEqual({ width: 600, height: 600 });
  });

  it("0 을 넣어도 터지지 않는다", () => {
    expect(fitWithin(0, 0, MAX_EDGE.photo)).toEqual({ width: 0, height: 0 });
  });

  it("쓰임새마다 다른 잣대 — 글 속 사진은 넉넉히, 브랜드 그림은 작게", () => {
    expect(MAX_EDGE.photo).toBeGreaterThan(MAX_EDGE.brand);
    // 앨범·스티커는 원본으로 저장한다 — 여기 상한이 다시 생기면 그 길로 새는 것이다.
    expect(Object.keys(MAX_EDGE).sort()).toEqual(["brand", "photo"]);
  });

  it("움직이는 그림과 벡터는 손대지 않는다", () => {
    expect(keepAsIs("image/gif")).toBe(true);
    expect(keepAsIs("image/svg+xml")).toBe(true);
    expect(keepAsIs("image/jpeg")).toBe(false);
    expect(keepAsIs("image/png")).toBe(false);
    expect(keepAsIs("image/heic")).toBe(false);
  });
});

describe("투명은 지킨다 — 다시 쓸 형식", () => {
  it("투명을 담을 수 있는 형식은 PNG 로 — JPEG 로 누르면 빈 곳이 검게 칠해진다", () => {
    expect(outputTypeFor("image/png")).toBe("image/png");
    expect(outputTypeFor("image/webp")).toBe("image/png");
    expect(outputTypeFor("image/avif")).toBe("image/png");
  });

  it("투명이 없는 형식은 JPEG 로", () => {
    expect(outputTypeFor("image/jpeg")).toBe("image/jpeg");
    expect(outputTypeFor("image/heic")).toBe("image/jpeg");
    expect(outputTypeFor("image/bmp")).toBe("image/jpeg");
    expect(outputTypeFor("")).toBe("image/jpeg");
  });

  it("확장자는 실제로 나온 형식을 따른다", () => {
    expect(extForEncoded("image/png")).toBe(".png");
    expect(extForEncoded("image/jpeg")).toBe(".jpg");
    expect(extForEncoded("image/webp")).toBe(".webp");
  });
});
