"use client";

import { useEffect, useRef } from "react";

/**
 * 이 판 위에 다른 떠 있는 판이 있는가.
 *
 * 판 위에 판이 뜬다 — 사진 보기 위의 "이 사진을 지울까요?". 둘 다 `document.body` 로 나간 포털이라
 * **나중에 열린 것이 DOM 의 뒤**에 붙는다. 아래 판이 Tab 을 가두면 위 판의 버튼으로 못 가고,
 * 아래 판이 Esc 를 받으면 묻는 판은 그대로 둔 채 **사진 보기가 닫힌다**(실제로 그랬다). 맨 위 판만 받는다.
 */
export function isCovered(node: HTMLElement): boolean {
  const layers = document.querySelectorAll<HTMLElement>('[aria-modal="true"]');
  const top = layers[layers.length - 1];
  return (
    !!top &&
    top !== node &&
    !node.contains(top) &&
    !!(node.compareDocumentPosition(top) & Node.DOCUMENT_POSITION_FOLLOWING)
  );
}

/** 탭으로 갈 수 있는 것들. 숨겨진 것·disabled 는 뺀다. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 떠 있는 판(모달·시트·드로어) 안에 포커스를 가둔다.
 *
 * 없으면 폼이 떠 있는 채로 Tab 을 누를 때 **뒤쪽 화면으로 새어 나간다** —
 * 보이지도 않는 사이드바 링크에 포커스가 가서 어디 있는지 알 수 없게 되고,
 * 엔터를 치면 엉뚱한 데로 간다(실제로 기념일 추가 모달에서 그랬다).
 *
 * 닫을 때는 **열기 전에 보던 자리로 포커스를 돌려준다**. 그러지 않으면
 * 목록 한가운데서 모달을 열었다 닫았을 때 다시 맨 위부터 탭해 내려와야 한다.
 *
 * ```tsx
 * const panel = useFocusTrap(open);
 * <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true"> … </div>
 * ```
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(open: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;

    const previous = document.activeElement as HTMLElement | null;

    const items = () =>
      [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || getComputedStyle(el).position === "fixed"
      );

    // 이미 안쪽에 포커스가 있으면 건드리지 않는다 — 폼의 autoFocus 를 뺏지 않으려고.
    if (!node.contains(document.activeElement)) node.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (isCovered(node)) return; // 위에 뜬 판이 가둔다
      const list = items();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      const inside = node.contains(active);
      if (e.shiftKey) {
        if (!inside || active === first || active === node) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    // capture 로 듣는다 — 안쪽 요소가 Tab 을 먼저 삼켜도 가두기는 돌아야 한다.
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      // 사라진 요소에 포커스를 주려 하면 조용히 실패한다 — 붙어 있을 때만.
      if (previous && previous.isConnected) previous.focus();
    };
  }, [open]);

  return ref;
}
