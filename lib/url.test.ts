import { describe, it, expect } from "vitest";
import { normalizeUrl, displayDomain } from "@/lib/url";

describe("normalizeUrl", () => {
  it("스킴이 없으면 https:// 를 붙인다", () => {
    expect(normalizeUrl("babynews.co.kr")).toBe("https://babynews.co.kr/");
  });

  it("https 주소는 쿼리까지 그대로 유지한다", () => {
    expect(normalizeUrl("https://a.com/b?c=1")).toBe("https://a.com/b?c=1");
  });

  it("http 주소는 http 를 유지한다", () => {
    expect(normalizeUrl("http://a.com")).toBe("http://a.com/");
  });

  it("앞뒤 공백은 다듬는다", () => {
    expect(normalizeUrl("  https://a.com/b  ")).toBe("https://a.com/b");
  });

  it("javascript: 스킴은 거부한다", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
  });

  it("ftp: 스킴은 거부한다", () => {
    expect(normalizeUrl("ftp://a.com")).toBeNull();
  });

  it("data: 스킴은 거부한다", () => {
    expect(normalizeUrl("data:text/html,<b>x</b>")).toBeNull();
  });

  it("빈 값·문자열이 아닌 값은 null", () => {
    expect(normalizeUrl("   ")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl(null)).toBeNull();
    expect(normalizeUrl(undefined)).toBeNull();
    expect(normalizeUrl(123)).toBeNull();
  });

  it("파싱할 수 없는 값은 null", () => {
    expect(normalizeUrl("https://")).toBeNull();
  });
});

describe("displayDomain", () => {
  it("www. 를 떼고 도메인만 남긴다", () => {
    expect(displayDomain("https://www.babynews.co.kr/a/b?x=1")).toBe("babynews.co.kr");
  });

  it("www. 가 없으면 그대로", () => {
    expect(displayDomain("https://insu-compare.kr")).toBe("insu-compare.kr");
  });

  it("파싱 실패하면 원본 문자열을 반환한다", () => {
    expect(displayDomain("그냥 메모")).toBe("그냥 메모");
  });
});
