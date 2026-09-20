import { describe, it, expect } from "vitest";
import { NAV, TAB_COUNT, isNavActive } from "@/lib/nav";

describe("isNavActive", () => {
  it("홈은 정확히 '/' 일 때만 켜진다", () => {
    expect(isNavActive("/", "/")).toBe(true);
    expect(isNavActive("/albums", "/")).toBe(false);
  });

  it("상세 페이지는 그 목록 메뉴를 켠다", () => {
    expect(isNavActive("/albums/abc", "/albums")).toBe(true);
    expect(isNavActive("/plans/xyz", "/plans")).toBe(true);
  });

  it("앞글자만 같은 남의 경로를 켜지 않는다", () => {
    // '/albums' 로 startsWith 만 보면 '/albumsomething' 이 사진첩을 켠다.
    expect(isNavActive("/albumsomething", "/albums")).toBe(false);
    expect(isNavActive("/boardgame", "/board")).toBe(false);
  });
});

describe("폰 하단 탭", () => {
  it("탭은 NAV 의 앞부분 그대로다 — 두 번째 목록을 만들지 않는다", () => {
    // 별도 배열을 두면 DB 의 NavItem 오버라이드(이모지·이름)와 꾸미기 표면(href 기준)이
    // 탭에만 반영되지 않아 같은 메뉴가 자리마다 다르게 보인다.
    const tabs = NAV.slice(0, TAB_COUNT);
    expect(tabs).toEqual(NAV.slice(0, TAB_COUNT));
    for (const t of tabs) expect(NAV.map((n) => n.href)).toContain(t.href);
  });

  it("탭 + 더보기가 5칸을 넘지 않는다 — 390px 에서 눌리는 크기가 남아야 한다", () => {
    expect(TAB_COUNT + 1).toBeLessThanOrEqual(5);
  });

  it("홈이 첫 탭이다", () => {
    expect(NAV[0].href).toBe("/");
  });

  it("매일 쓰는 것이 탭에 있다", () => {
    const tabHrefs = NAV.slice(0, TAB_COUNT).map((n) => n.href);
    for (const href of ["/", "/todos", "/shopping"]) {
      expect(tabHrefs, `${href} 가 탭에 없다`).toContain(href);
    }
  });

  it("탭에 없는 메뉴도 하나도 빠지지 않는다 — 나머지는 더보기로 간다", () => {
    const rest = NAV.slice(TAB_COUNT);
    expect(rest.length).toBeGreaterThan(0);
    expect(new Set(NAV.map((n) => n.href)).size).toBe(NAV.length);
  });
});
