import { describe, expect, it } from "vitest";
import { fitWithin } from "./image-attach";

// `shrinkImage` 는 캔버스라 node 환경에서 의미 있는 검증이 안 된다. 없는 검증력을 있는 척하지 않는다.

describe("fitWithin", () => {
  it("긴 변을 상한에 맞추고 비율을 지킨다", () => {
    expect(fitWithin(4032, 3024, 768)).toEqual({ width: 768, height: 576 });
  });

  it("세로가 길면 세로를 기준으로 줄인다", () => {
    expect(fitWithin(3024, 4032, 768)).toEqual({ width: 576, height: 768 });
  });

  it("이미 작은 사진은 늘리지 않는다", () => {
    expect(fitWithin(320, 240, 768)).toEqual({ width: 320, height: 240 });
  });

  it("아주 납작한 사진도 최소 1px 은 남긴다", () => {
    expect(fitWithin(5000, 3, 768)).toEqual({ width: 768, height: 1 });
  });

  it("크기를 모르면(0) 그대로 둔다", () => {
    expect(fitWithin(0, 0, 768)).toEqual({ width: 0, height: 0 });
  });
});
