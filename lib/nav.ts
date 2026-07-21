import type { PaletteKey } from "./colors";

export interface NavItem {
  href: string;
  label: string;
  emoji: string;
  /** 활성/강조 시 사용할 파스텔 색 */
  color: PaletteKey;
  desc: string;
}

export const NAV: NavItem[] = [
  { href: "/", label: "홈", emoji: "🏠", color: "lavender", desc: "우리 가족 한눈에" },
  { href: "/albums", label: "사진첩", emoji: "📸", color: "sky", desc: "테마별 추억 모음" },
  { href: "/plans", label: "계획", emoji: "🗺️", color: "mint", desc: "여행·주말 계획 짜기" },
  { href: "/calendar", label: "캘린더", emoji: "📅", color: "peach", desc: "가족 일정 달력" },
  { href: "/todos", label: "할일", emoji: "✅", color: "rose", desc: "그날그날 할일" },
  { href: "/anniversaries", label: "기념일", emoji: "🎉", color: "butter", desc: "생일·기념일 D-day" },
  { href: "/board", label: "게시판", emoji: "💬", color: "lavender", desc: "가족 한마디" },
  { href: "/shopping", label: "장보기", emoji: "🛒", color: "mint", desc: "공유 장보기 목록" },
];
