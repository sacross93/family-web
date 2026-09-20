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
 * 앞 `TAB_COUNT` 개가 폰 하단 탭이 되고 나머지는 `더보기` 안으로 간다
 * (`components/bottom-tabs.tsx`). href 와 color 는 고정, 순서·이모지·이름만 바꾼다.
 *
 * **순서는 추측이 아니라 실제로 쓰는 것을 따른다.** 처음에는 "가족 사이트라면 대개
 * 이렇겠지" 하고 할일·장보기·사진첩을 앞에 뒀는데, 배포본을 열어 세어 보니
 * 할일 0 · 장보기 0 · 사진첩 0 · 기념일 0 · 게시판 0 이고, 실제로 채워져 있는 건
 * 아기 기록과 계획 하나뿐이었다. 탭 넷 중 셋이 빈 곳을 가리키고 있었던 셈이다.
 * 매일 여는 자리에 빈 칸을 걸어 두면 "여긴 아무것도 없구나" 를 매일 가르친다.
 *
 * 쓰임이 달라지면(아기가 태어나고, 여행이 끝나고) 이 배열을 고치면 된다 — 한 줄이다.
 */
export const NAV: NavItem[] = [
  { href: "/", label: "홈", emoji: "🏠", color: "lavender", desc: "우리 가족 한눈에" },
  { href: "/baby", label: "아기", emoji: "🌱", color: "rose", desc: "함께 쓰는 아기 일기" },
  { href: "/shopping", label: "장보기", emoji: "🛒", color: "mint", desc: "공유 장보기 목록" },
  { href: "/plans", label: "계획", emoji: "🗺️", color: "mint", desc: "여행·주말 계획 짜기" },
  { href: "/calendar", label: "캘린더", emoji: "📅", color: "peach", desc: "가족 일정 달력" },
  { href: "/albums", label: "사진첩", emoji: "📸", color: "sky", desc: "테마별 추억 모음" },
  { href: "/todos", label: "할일", emoji: "✅", color: "rose", desc: "그날그날 할일" },
  { href: "/board", label: "게시판", emoji: "💬", color: "lavender", desc: "가족 한마디" },
  { href: "/anniversaries", label: "기념일", emoji: "🎉", color: "butter", desc: "생일·기념일 D-day" },
];

/** 폰 하단 탭에 놓는 개수. 나머지는 `더보기`. 5칸(4 + 더보기)이 390px 에서 넉넉하다. */
export const TAB_COUNT = 4;

/** 현재 경로가 이 메뉴 항목에 속하는가. 사이드바·드로어·하단 탭이 같은 판정을 쓴다. */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
