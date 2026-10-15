"use client";

import { useState } from "react";
import { Modal, Button, CheckCircle } from "@/components/ui";
import { cn } from "@/lib/utils";

const CHOICES: { keep: boolean; title: string; description: string }[] = [
  { keep: true, title: "이 기간의 기록 남기기", description: "일기는 그대로 두고 준비 단계로 돌아가요." },
  {
    keep: false,
    title: "이 기간의 기록 지우기",
    description: "임신을 확인한 뒤 쓴 일기·체크리스트와 올린 사진이 사라져요. 다시 볼 수 없어요.",
  },
];

/**
 * 준비 단계로 돌아가기. 남길지 지울지 **골라야** 버튼이 켜진다 — 미리 골라 두지 않는다.
 * 어느 쪽이든 기본값이 되면 고르지 않고 누른 사람의 기록이 그 기본값대로 된다.
 *
 * 문구는 **이유를 말하지 않는다.** 왜 돌아가는지는 이 화면이 물을 일이 아니다.
 */
export function BackToPrepModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  /** 서버가 바꾼 뒤에만 돌아온다. 실패하면 부모가 알리고 이 창은 그대로 남는다. */
  onConfirm: (keep: boolean) => Promise<void>;
}) {
  const [keep, setKeep] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (keep === null || busy) return;
    setBusy(true);
    try {
      await onConfirm(keep);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="준비 단계로 돌아갈까요?"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant={keep === false ? "danger" : "primary"} onClick={confirm} disabled={keep === null || busy}>
            준비 단계로
          </Button>
        </>
      }
    >
      <div role="radiogroup" aria-label="이 기간의 기록" className="flex flex-col gap-2.5">
        {CHOICES.map((c) => {
          const checked = keep === c.keep;
          return (
            <button
              key={String(c.keep)}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => setKeep(c.keep)}
              className={cn(
                "flex min-h-11 w-full items-start gap-3 rounded-md border px-4 py-3.5 text-left transition",
                checked ? "border-primary bg-primary-soft" : "border-line-strong bg-surface hover:bg-sunken"
              )}
            >
              <CheckCircle checked={checked} color="rose" size="sm" className="mt-0.5" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[0.9375rem] font-semibold text-ink">{c.title}</span>
                <span className="text-xs text-ink-soft">{c.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
