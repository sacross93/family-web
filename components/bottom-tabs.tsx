"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, MessageCircle } from "lucide-react";

import { palette } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { TAB_COUNT, isNavActive, type NavItem } from "@/lib/nav";

/**
 * 폰 하단 탭바. 엄지가 닿는 자리에 네비게이션을 둔다 —
 * 그 전에는 9개 섹션이 전부 "햄버거 → 항목" 2탭이었다.
 *
 * 탭 목록은 `getNav()` 가 준 배열의 앞 `TAB_COUNT` 개다. 두 번째 목록을 만들지 않는다:
 * `NavItem` DB 오버라이드도 꾸미기 표면(surfaceKey)도 전부 NAV href 를 기준으로 돈다.
 * 나머지는 `더보기` 가 여는 기존 드로어에 그대로 있다.
 *
 * 높이는 `--bottom-bar`(globals.css)와 짝이다 — 본문 아래 여백이 같은 값을 읽는다.
 *
 * `포동이` 도 여기 있다. 전에는 우하단에 떠 있었는데, 화면 한가운데에 떠 있는 버튼은
 * 그 자리의 콘텐츠를 **누를 수 없게** 만든다 — 아기 기록의 `…` 가 정확히 그 밑에 깔려
 * 일기를 고치려고 누르면 AI 채팅이 열렸다. 떠 있는 것을 하나도 두지 않으면 그 종류의
 * 버그가 다시 안 생긴다. 게다가 실제로 가장 많이 쓰는 기능이라 자리를 줄 만하다.
 * 페이지로 가는 게 아니라 **하던 자리에서 말을 거는 것**이라, 다른 탭과 모양을 달리한다.
 */
export function BottomTabs({
  nav,
  onMore,
  onAsk,
}: {
  nav: NavItem[];
  onMore: () => void;
  /** 포동이 열기. AGENT_ENABLED 가 꺼져 있으면 넘어오지 않고 칸도 생기지 않는다. */
  onAsk?: () => void;
}) {
  const pathname = usePathname();
  const tabs = nav.slice(0, TAB_COUNT);
  // 탭에 없는 페이지에 와 있으면 `더보기` 를 켜 준다 — 지금 어디인지 알 수 있게.
  const inMore = !tabs.some((t) => isNavActive(pathname, t.href));

  return (
    <nav
      aria-label="주요 메뉴"
      className="on-chrome fixed inset-x-0 bottom-0 z-40 bg-chrome lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="flex h-14 items-stretch">
        {tabs.map((item) => {
          const active = isNavActive(pathname, item.href);
          const pal = palette(item.color);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="flex h-full flex-col items-center justify-center gap-0.5"
              >
                <span
                  className={cn(
                    "flex h-7 w-11 items-center justify-center rounded-full text-base transition-colors",
                    active ? pal.soft : "opacity-60",
                  )}
                >
                  {item.emoji}
                </span>
                <span
                  className={cn(
                    "text-[0.625rem] leading-none",
                    active ? "font-bold text-chrome-ink" : "text-chrome-faint",
                  )}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
        {onAsk && (
          <li className="flex-1">
            <button
              type="button"
              onClick={onAsk}
              aria-label="포동이에게 물어보기"
              className="flex h-full w-full flex-col items-center justify-center gap-0.5"
            >
              <span className="flex h-7 w-11 items-center justify-center rounded-full bg-chrome-ink text-chrome">
                <MessageCircle className="h-4 w-4" />
              </span>
              <span className="text-[0.625rem] font-bold leading-none text-chrome-ink">
                포동이
              </span>
            </button>
          </li>
        )}
        <li className="flex-1">
          <button
            type="button"
            onClick={onMore}
            aria-label="메뉴 더보기"
            className="flex h-full w-full flex-col items-center justify-center gap-0.5"
          >
            <span
              className={cn(
                "flex h-7 w-11 items-center justify-center rounded-full transition-colors",
                inMore && "bg-white/15",
              )}
            >
              <MoreHorizontal
                className={cn(
                  "h-5 w-5",
                  inMore ? "text-chrome-ink" : "text-chrome-faint",
                )}
              />
            </span>
            <span
              className={cn(
                "text-[0.625rem] leading-none",
                inMore ? "font-bold text-chrome-ink" : "text-chrome-faint",
              )}
            >
              더보기
            </span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
