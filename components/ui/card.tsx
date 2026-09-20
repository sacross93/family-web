import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * 내용을 담는 판.
 *
 * 예전엔 판이 한 종류뿐이었다 — `rounded-3xl` + 테두리 + 그림자.
 * 그래서 사진도, 오늘 할일도, 주차 숫자도 전부 똑같은 흰 상자에 들어갔고,
 * 화면은 **무엇이 중요한지 말해 주지 못했다**. 13개 화면이 한 벌의 상자 더미였다.
 *
 * 이제 판은 셋이다. 고르는 기준은 크기가 아니라 **무엇을 담는가**다.
 * - `plain`(기본) — 목록·폼처럼 여러 가지가 들어가는 판. 실선 한 겹, 그림자 없음.
 * - `tile` — 하나만 담는 덩어리(주차 숫자, 오늘 요약). 색으로 채우고 테두리 없음.
 *   배경색은 부르는 쪽이 준다(`className="bg-chrome"` 처럼) — 동적 조합 금지 규칙 때문.
 * - `photo` — 사진. 여백도 테두리도 없이 내용이 판을 꽉 채운다.
 *
 * **그림자는 판에 쓰지 않는다.** 정말로 떠 있는 것(모달·메뉴·알림)만 그림자를 갖는다.
 */
type Variant = "plain" | "tile" | "photo";

const VARIANTS: Record<Variant, string> = {
  plain: "rounded-lg border border-line bg-surface",
  tile: "rounded-lg",
  photo: "overflow-hidden rounded-md",
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  /** 누를 수 있는 판. 떠오르지 않는다 — 테두리만 또렷해진다. */
  interactive?: boolean;
  /** 기본 여백 제거 (`photo` 는 이미 여백이 없다) */
  flush?: boolean;
}

export function Card({
  className,
  variant = "plain",
  interactive,
  flush,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        VARIANTS[variant],
        !flush && variant !== "photo" && "p-5",
        interactive &&
          "cursor-pointer transition-colors duration-200 hover:border-line-strong",
        className
      )}
      {...props}
    />
  );
}

/** 판의 제목. 명조는 18px 아래로 내려가지 않는다. */
export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("font-display text-lg font-bold text-ink", className)}
      {...props}
    />
  );
}
