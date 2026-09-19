import { describe, expect, it } from "vitest";

import { rewriteKnownShell } from "./rewrite";

describe("rewriteKnownShell", () => {
  it("네이버 블로그 아이디 주소를 글 목록 주소로 바꾼다", () => {
    // 실측: blog.naver.com/naver_diary 는 프레임 제목줄 166자, PostList 는 398KB
    expect(rewriteKnownShell("https://blog.naver.com/naver_diary")).toBe(
      "https://blog.naver.com/PostList.naver?blogId=naver_diary"
    );
  });

  it("글 번호가 있으면 그 글 하나로 간다", () => {
    expect(rewriteKnownShell("https://blog.naver.com/naver_diary/223456789012")).toBe(
      "https://blog.naver.com/PostView.naver?blogId=naver_diary&logNo=223456789012"
    );
  });

  it("logNo 를 쿼리로 준 모양도 받는다", () => {
    expect(rewriteKnownShell("https://blog.naver.com/naver_diary?logNo=223456789012")).toBe(
      "https://blog.naver.com/PostView.naver?blogId=naver_diary&logNo=223456789012"
    );
  });

  it("모바일 주소도 같게 본다", () => {
    expect(rewriteKnownShell("https://m.blog.naver.com/naver_diary")).toContain("PostList.naver?blogId=naver_diary");
  });

  it("이미 내용 주소면 건드리지 않는다", () => {
    const u = "https://blog.naver.com/PostView.naver?blogId=a&logNo=1";
    expect(rewriteKnownShell(u)).toBe(u);
  });

  it("표에 없는 사이트는 그대로 둔다", () => {
    const u = "https://example.com/blog/1";
    expect(rewriteKnownShell(u)).toBe(u);
  });

  it("주소가 아니면 그대로 둔다", () => {
    expect(rewriteKnownShell("not a url")).toBe("not a url");
  });

  it("아이디 자리가 비었으면 바꾸지 않는다 — 주소를 지어내지 않는다", () => {
    expect(rewriteKnownShell("https://blog.naver.com/")).toBe("https://blog.naver.com/");
  });

  it("아이디에 아이디 아닌 글자가 섞이면 바꾸지 않는다", () => {
    for (const raw of [
      "https://blog.naver.com/a%2Fb",
      "https://blog.naver.com/a.b",
      "https://blog.naver.com/한글아이디",
      `https://blog.naver.com/${"x".repeat(41)}`,
    ]) {
      expect(rewriteKnownShell(raw), raw).toBe(raw);
    }
  });

  it("글 번호가 숫자가 아니면 목록으로 간다 — 지어낸 글 주소를 만들지 않는다", () => {
    expect(rewriteKnownShell("https://blog.naver.com/naver_diary/abc")).toBe(
      "https://blog.naver.com/PostList.naver?blogId=naver_diary"
    );
  });
});
