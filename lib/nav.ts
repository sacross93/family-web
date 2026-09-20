import type { PaletteKey } from "./colors";

export interface NavItem {
  href: string;
  label: string;
  emoji: string;
  /** 활성/강조 시 사용할 파스텔 색 */
  color: PaletteKey;
  desc: string;
}

/**
 * 순서가 곧 화면 순서다 — 사이드바·드로어·폰 하단 탭바가 모두 이 배열을 그대로 쓴다.
 * 앞 4개가 폰 하단 탭이 되고 나머지는 `더보기` 안으로 간다(`components/bottom-tabs.tsx`).
 * 자주 쓰는 것부터 앞에 둔다: 매일(홈·할일·장보기) → 자주(사진첩·캘린더·아기) → 가끔.
 * href 와 color 는 고정, 순서·이모지·이름만 바꾼다.
 */
export const NAV: NavItem[] = [
  { href: "/", label: "홈", emoji: "🏠", color: "lavender", desc: "우리 가족 한눈에" },
  { href: "/todos", label: "할일", emoji: "✅", color: "rose", desc: "그날그날 할일" },
  { href: "/shopping", label: "장보기", emoji: "🛒", color: "mint", desc: "공유 장보기 목록" },
  { href: "/albums", label: "사진첩", emoji: "📸", color: "sky", desc: "테마별 추억 모음" },
  { href: "/calendar", label: "캘린더", emoji: "📅", color: "peach", desc: "가족 일정 달력" },
  { href: "/baby", label: "아기", emoji: "🌱", color: "rose", desc: "함께 쓰는 아기 일기" },
  { href: "/board", label: "게시판", emoji: "💬", color: "lavender", desc: "가족 한마디" },
  { href: "/anniversaries", label: "기념일", emoji: "🎉", color: "butter", desc: "생일·기념일 D-day" },
  { href: "/plans", label: "계획", emoji: "🗺️", color: "mint", desc: "여행·주말 계획 짜기" },
];

/** 폰 하단 탭에 놓는 개수. 나머지는 `더보기`. 5칸(4 + 더보기)이 390px 에서 넉넉하다. */
export const TAB_COUNT = 4;

/** 현재 경로가 이 메뉴 항목에 속하는가. 사이드바·드로어·하단 탭이 같은 판정을 쓴다. */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
