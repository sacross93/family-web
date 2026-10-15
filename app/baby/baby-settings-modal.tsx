"use client";

import { useState } from "react";
import { Modal, Button, Field, Input, ColorPicker, Checkbox } from "@/components/ui";
import type { PaletteKey } from "@/lib/colors";
import { toDateInput } from "@/lib/date";
import type { Pregnancy } from "@/lib/types";
import { ResetSection } from "./journey-settings-modal";

export interface BabySettingsPatch {
  nickname: string;
  emoji: string;
  color: PaletteKey;
  /** "yyyy-MM-dd" */
  dueDate: string;
  /** "yyyy-MM-dd" 또는 null(지움) */
  birthDate: string | null;
}

/**
 * 임신 설정. 부모가 `{open && <BabySettingsModal/>}` 로 마운트하므로 열릴 때마다 pregnancy 값으로 초기화됨.
 * 홈 표시는 단계와 무관한 페이지 설정이라 이 폼의 저장과 따로 간다 — 누르는 즉시 저장된다.
 */
export function BabySettingsModal({
  pregnancy,
  showOnHome,
  onClose,
  onSave,
  onToggleHome,
  onBackToPrep,
  onReset,
}: {
  pregnancy: Pregnancy;
  showOnHome: boolean;
  onClose: () => void;
  onSave: (patch: BabySettingsPatch) => Promise<void>;
  onToggleHome: (v: boolean) => void;
  /** 준비 단계로 돌아가기 — 남길지 지울지 묻는 창은 부모가 연다. */
  onBackToPrep: () => void;
  /** 처음부터 다시 시작(모두 지우기). 묻고 지우는 일은 부모가 한다. */
  onReset: () => void;
}) {
  const [nickname, setNickname] = useState(pregnancy.nickname);
  const [emoji, setEmoji] = useState(pregnancy.emoji);
  const [color, setColor] = useState<PaletteKey>(pregnancy.color as PaletteKey);
  const [dueStr, setDueStr] = useState(toDateInput(pregnancy.dueDate));
  const [birthStr, setBirthStr] = useState(pregnancy.birthDate ? toDateInput(pregnancy.birthDate) : "");
  const [busy, setBusy] = useState(false);

  const canSave = nickname.trim().length > 0 && dueStr.length > 0 && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    try {
      await onSave({
        nickname: nickname.trim(),
        emoji: emoji.trim() || "🌱",
        color,
        dueDate: dueStr,
        birthDate: birthStr || null,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="임신 설정"
      emoji={emoji || "🌱"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button onClick={save} disabled={!canSave}>
            저장
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-[88px_1fr]">
          <Field label="이모지">
            <Input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              className="text-center text-xl"
              maxLength={4}
              aria-label="이모지"
            />
          </Field>
          <Field label="태명">
            <Input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} />
          </Field>
        </div>
        <Field label="색">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Field label="출산 예정일">
          <Input type="date" value={dueStr} onChange={(e) => setDueStr(e.target.value)} />
        </Field>
        <Field label="출생일" hint="아기가 태어나면 넣어 주세요. 주차 대신 '태어난 지 N일'로 바뀌어요.">
          <div className="flex gap-2">
            <Input
              type="date"
              value={birthStr}
              onChange={(e) => setBirthStr(e.target.value)}
              className="flex-1"
            />
            {birthStr && (
              <Button variant="ghost" onClick={() => setBirthStr("")}>
                지우기
              </Button>
            )}
          </div>
        </Field>
        <label className="flex cursor-pointer items-center gap-3 rounded-md bg-sunken px-4 py-3">
          <Checkbox checked={showOnHome} onChange={onToggleHome} color={color} label="홈에 보여주기" />
          <span className="flex flex-col">
            <span className="text-[0.9375rem] font-semibold text-ink">홈에 보여주기</span>
            <span className="text-xs text-ink-soft">홈 화면에 주차와 최근 기록 카드를 띄워요.</span>
          </span>
        </label>
        {/* 단계를 바꾸는 두 구역은 아래 단추줄(취소·저장)이 아니라 본문 맨 끝에 줄을 그어 떼어 둔다
            — 저장 옆에 세우면 폰 폭에서 넘치고, 잘못 누르기도 쉽다. */}
        <div className="mt-2 flex flex-col gap-2 border-t border-line pt-4">
          <span className="text-[0.9375rem] font-semibold text-ink">준비 단계로 돌아가기</span>
          <span className="text-xs text-ink-soft">
            주기 기록과 준비 때 일기는 그대로예요. 이 기간의 기록은 남길지 지울지 다음 화면에서 골라요.
          </span>
          <Button variant="outline" size="sm" onClick={onBackToPrep} className="mt-1 self-start">
            준비 단계로
          </Button>
        </div>
        <ResetSection onReset={onReset} />
      </div>
    </Modal>
  );
}
