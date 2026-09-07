"use client";

import { useState } from "react";
import { Modal, Button, Field, Input, ColorPicker, Checkbox } from "@/components/ui";
import type { PaletteKey } from "@/lib/colors";
import { toDateInput } from "@/lib/date";
import type { Baby } from "@/lib/types";

export interface BabySettingsPatch {
  nickname: string;
  emoji: string;
  color: PaletteKey;
  /** "yyyy-MM-dd" */
  dueDate: string;
  /** "yyyy-MM-dd" 또는 null(지움) */
  birthDate: string | null;
  showOnHome: boolean;
}

/** 부모가 `{open && <BabySettingsModal/>}` 로 마운트하므로 열릴 때마다 baby 값으로 초기화됨 */
export function BabySettingsModal({
  baby,
  onClose,
  onSave,
}: {
  baby: Baby;
  onClose: () => void;
  onSave: (patch: BabySettingsPatch) => Promise<void>;
}) {
  const [nickname, setNickname] = useState(baby.nickname);
  const [emoji, setEmoji] = useState(baby.emoji);
  const [color, setColor] = useState<PaletteKey>(baby.color as PaletteKey);
  const [dueStr, setDueStr] = useState(toDateInput(baby.dueDate));
  const [birthStr, setBirthStr] = useState(baby.birthDate ? toDateInput(baby.birthDate) : "");
  const [showOnHome, setShowOnHome] = useState(baby.showOnHome);
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
        showOnHome,
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
      title="아기 설정"
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
        <div className="grid grid-cols-[88px_1fr] gap-3">
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
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-sunken px-4 py-3">
          <Checkbox checked={showOnHome} onChange={setShowOnHome} color={color} label="홈에 보여주기" />
          <span className="flex flex-col">
            <span className="text-[15px] font-semibold text-ink">홈에 보여주기</span>
            <span className="text-xs text-ink-soft">홈 화면에 주차와 최근 기록 카드를 띄워요.</span>
          </span>
        </label>
      </div>
    </Modal>
  );
}
