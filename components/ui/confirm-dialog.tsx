"use client";

import { useCallback, useRef, useState } from "react";
import { Modal } from "./modal";
import { Button } from "./button";

interface Ask {
  title: string;
  /** 무엇이 사라지는지 한 줄. 되돌릴 수 없다는 걸 분명히. */
  description?: string;
  /** 누르면 실행되는 버튼의 이름. 결과를 말한다("지우기", "비우기"). */
  confirmLabel?: string;
  emoji?: string;
}

/**
 * 되돌릴 수 없는 것을 지우기 전에 한 번 묻는다.
 *
 * **모든 삭제에 쓰지 않는다.** 잃는 것에 비례해서만 묻는다 —
 * 장보기 항목은 3초면 다시 담으니 묻지 않는 게 빠르고, 가족이 쓴 글이나
 * 포동이와 나눈 대화는 다시 만들 수 없으니 묻는다.
 *
 * `window.confirm` 대신 이걸 쓰는 이유: 브라우저 기본 대화상자는 사이트의 말투와
 * 모양을 따르지 않고, 무엇이 사라지는지 설명할 자리도 마땅치 않다.
 *
 * ```tsx
 * const { confirm, dialog } = useConfirm();
 * ...
 * if (!(await confirm({ title: "이 쪽지를 지울까요?", description: "다시 볼 수 없어요." }))) return;
 * ...
 * return (<> ... {dialog} </>);
 * ```
 */
export function useConfirm() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((options: Ask) => {
    setAsk(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    setAsk(null);
    resolver.current?.(ok);
    resolver.current = null;
  }, []);

  const dialog = (
    <Modal
      open={ask !== null}
      onClose={() => settle(false)}
      title={ask?.title}
      emoji={ask?.emoji ?? "🗑️"}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => settle(false)}>
            그대로 두기
          </Button>
          <Button variant="danger" onClick={() => settle(true)}>
            {ask?.confirmLabel ?? "지우기"}
          </Button>
        </>
      }
    >
      <p className="text-[0.9375rem] text-ink-soft">
        {ask?.description ?? "지우면 다시 볼 수 없어요."}
      </p>
    </Modal>
  );

  return { confirm, dialog };
}
