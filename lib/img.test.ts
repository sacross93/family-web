import { describe, it, expect } from "vitest";
import { IMAGE_WIDTHS, canOptimize, pickWidth, responsive, sized, sizedSrcSet } from "@/lib/img";

/**
 * 이 파일이 지키는 것은 하나다: **줄이려다 사진이 안 뜨면 안 된다.**
 * 못 태우는 주소는 있는 그대로 내보내고, 태우는 주소는 설정이 받아 주는 크기만 쓴다.
 */
const BLOB = "https://abc123.public.blob.vercel-storage.com/uploads/sticker.png";

describe("줄여 받을 수 있는 주소인가", () => {
  it("우리 저장소와 같은 출처의 경로는 된다", () => {
    expect(canOptimize("/uploads/a.png")).toBe(true);
    expect(canOptimize(BLOB)).toBe(true);
  });

  it("남의 서버·data URL·빈 값은 안 된다 — 최적화가 400 을 준다", () => {
    expect(canOptimize("https://example.com/a.png")).toBe(false);
    expect(canOptimize("//example.com/a.png")).toBe(false);
    expect(canOptimize("data:image/png;base64,AAA")).toBe(false);
    expect(canOptimize("")).toBe(false);
  });

  it("못 태우는 주소는 **있는 그대로** 돌려준다 — 안 뜨는 것보다 큰 것이 낫다", () => {
    expect(sized("https://example.com/a.png", 300)).toBe("https://example.com/a.png");
    expect(sizedSrcSet("data:image/png;base64,AAA", 300)).toBeUndefined();
  });
});

describe("고르는 크기", () => {
  it("설정이 받아 주는 값만 쓴다 — 없는 값으로 부르면 400 이 온다", () => {
    for (const want of [1, 50, 100, 300, 639, 640, 1200, 99999]) {
      expect(IMAGE_WIDTHS as readonly number[]).toContain(pickWidth(want));
    }
  });

  it("요청보다 작게 주지 않는다 — 작게 주면 흐릿해진다", () => {
    for (const want of [100, 300, 639, 1000]) {
      expect(pickWidth(want)).toBeGreaterThanOrEqual(want);
    }
  });

  it("아주 크면 제일 큰 것에서 멈춘다", () => {
    expect(pickWidth(99999)).toBe(IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]);
  });

  it("고해상도 화면은 두 배로 잡는다", () => {
    expect(sized(BLOB, 300, 2)).toContain(`w=${pickWidth(600)}`);
    expect(sized(BLOB, 300, 1)).toContain(`w=${pickWidth(300)}`);
  });
});

describe("만들어진 주소", () => {
  it("원본 주소를 그대로 싣되 인코딩한다", () => {
    const out = sized(BLOB, 300);
    expect(out.startsWith("/_next/image?url=")).toBe(true);
    expect(out).toContain(encodeURIComponent(BLOB));
    expect(out).not.toContain(BLOB); // 인코딩 안 하면 & 가 낀 주소에서 깨진다
  });

  it("1배·2배 두 벌을 준다 — 무조건 2배면 줄인 보람이 절반이다", () => {
    const set = sizedSrcSet(BLOB, 300)!;
    expect(set).toContain(" 1x,");
    expect(set).toContain(" 2x");
  });
});

describe("최적화가 못 읽는 형식은 그대로", () => {
  it("SVG 는 최적화가 400 을 준다 — 그대로 보낸다", () => {
    expect(canOptimize("/icon.svg")).toBe(false);
    expect(canOptimize("/uploads/a.SVG")).toBe(false);
    expect(canOptimize("/uploads/a.svg?v=2")).toBe(false);
    expect(canOptimize("https://abc.public.blob.vercel-storage.com/uploads/a.svg")).toBe(false);
    expect(sized("/icon.svg", 150)).toBe("/icon.svg");
  });

  it("HEIC/HEIF 도 최적화가 못 읽는다", () => {
    expect(canOptimize("/uploads/a.heic")).toBe(false);
    expect(canOptimize("https://abc.public.blob.vercel-storage.com/uploads/a.HEIF")).toBe(false);
  });

  it("확장자는 경로에서만 본다 — 쿼리에 svg 가 있어도 사진이다", () => {
    expect(canOptimize("/uploads/a.png?x=.svg")).toBe(true);
    expect(canOptimize("https://abc.public.blob.vercel-storage.com/uploads/a.png?f=b.svg")).toBe(true);
  });
});

describe("responsive — 칸 너비를 모르는 사진", () => {
  it("w 표시로 여러 너비를 준다 — 설정이 받는 값만", () => {
    const { src, srcSet } = responsive(BLOB, 400);
    expect(src.startsWith("/_next/image?url=")).toBe(true);
    const parts = srcSet!.split(", ");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      const m = / (\d+)w$/.exec(p);
      expect(m).not.toBeNull();
      expect(IMAGE_WIDTHS as readonly number[]).toContain(Number(m![1]));
      expect(p).toContain(`&w=${m![1]}&`);
    }
  });

  it("가장 크게 그려지는 너비의 2배까지만 — 더 큰 건 헛되다", () => {
    const widths = responsive(BLOB, 190).srcSet!.split(", ").map((p) => Number(/ (\d+)w$/.exec(p)![1]));
    expect(Math.max(...widths)).toBe(pickWidth(380));
    expect(widths).not.toContain(1200);
  });

  it("아주 크게 그려져도 설정의 최대에서 멈춘다", () => {
    const { src } = responsive(BLOB, 5000);
    expect(src).toContain(`&w=${IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]}&`);
  });

  it("못 태우는 주소는 원래 주소 하나만", () => {
    expect(responsive("https://example.com/a.png", 300)).toEqual({ src: "https://example.com/a.png" });
    expect(responsive("/uploads/a.svg", 300)).toEqual({ src: "/uploads/a.svg" });
    expect(responsive("blob:http://localhost/abc", 300)).toEqual({ src: "blob:http://localhost/abc" });
  });
});
