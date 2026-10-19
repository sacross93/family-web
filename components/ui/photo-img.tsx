"use client";

import { useState, type ImgHTMLAttributes } from "react";
import { responsive } from "@/lib/img";

/**
 * 줄인 주소가 실패하면 **원래 주소로 한 번** 바꾼다. `<img>` 를 손으로 그리는 곳(스티커)용.
 *
 * 줄인 주소가 실패하는 경우가 실제로 있다: 무료 한도를 넘으면 최적화가 402 를 주고,
 * 한 변이 8192px 를 넘는 원본은 400 을 준다. 원본은 저장소에 그대로 있으니 그걸 보여 준다.
 * 원래 주소마저 실패하면 멈춘다(지금 src 가 이미 원래 주소면 아무것도 안 한다 — 무한 반복 방지).
 */
export function fallbackToRaw(img: HTMLImageElement, raw: string) {
  if (!raw || img.getAttribute("src") === raw) return;
  img.removeAttribute("srcset");
  img.removeAttribute("sizes");
  img.src = raw;
}

type PhotoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "sizes"> & {
  /** 저장된 원래 주소. */
  src: string;
  alt: string;
  /** 이 사진이 가장 크게 그려지는 CSS 너비(px). 그 2배까지만 내놓는다. */
  maxWidth: number;
  /** 화면 폭별로 그려지는 너비 — **재 보고** 적을 것(AGENTS.md). */
  sizes: string;
};

/**
 * 칸 너비가 CSS 로 정해지는 사진(앨범 격자·표지·사진 보기·홈 최근 사진).
 * 여러 너비를 `srcSet`(w 표시)으로 내놓고 고르는 일은 브라우저에 맡긴다. 감싸는 요소 없이
 * `<img>` 하나만 그린다 — 부르는 쪽의 클래스·`loading` 을 그대로 받는다.
 *
 * 못 태우는 주소(남의 서버·SVG·HEIC·`blob:`)는 원래 주소 그대로. 줄인 것이 실패하면 원래 주소로.
 */
export function PhotoImg({ src, maxWidth, sizes, alt, ...rest }: PhotoProps) {
  // 어느 주소가 실패했는지를 쥔다 — 사진이 바뀌면(다음 사진) 저절로 다시 줄인 것부터 시도한다.
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const r = failedFor === src ? { src } : responsive(src, maxWidth);
  const optimized = r.src !== src;

  return (
    <img
      {...rest}
      alt={alt}
      src={r.src}
      srcSet={r.srcSet}
      sizes={r.srcSet ? sizes : undefined}
      onError={optimized ? () => setFailedFor(src) : undefined}
      // 서버에서 그린 사진은 하이드레이션 **전에** 실패할 수 있고, 그러면 onError 가 안 불린다.
      // 붙는 순간 이미 깨져 있으면(다 받았는데 크기가 0) 그때 바꾼다.
      ref={(img) => {
        if (optimized && img && img.complete && img.naturalWidth === 0) setFailedFor(src);
      }}
    />
  );
}
