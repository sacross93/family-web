"use client";

import { useState } from "react";
import { Modal, Button, Field, Input, Segmented, ColorPicker } from "@/components/ui";
import type { PaletteKey } from "@/lib/colors";
import { dueDateFromLmp, fromDateInput, kDate, toDateInput } from "@/lib/date";

export interface PregnancyStartPayload {
  /** 비우면 서버가 "우리 아기" 로 둔다 */
  nickname: string;
  emoji: string;
  color: PaletteKey;
  /** "yyyy-MM-dd" — 둘 중 하나만 보낸다 */
  dueDate?: string;
  lmpDate?: string;
}

type DateMode = "due" | "lmp";

/**
 * 임신을 확인했어요: 태명(선택) + 예정일(또는 마지막 생리일)로 임신 단계를 시작한다.
 * 예전엔 "아기가 없으면 첫 화면" 카드였다 — 이제 준비 단계 페이지가 늘 있으니 그 위의 모달이다.
 */
export function PregnancyStartModal({
  lastPeriodStart,
  onClose,
  onStart,
}: {
  /** 가장 최근 생리 시작일(오늘까지). 있으면 "마지막 생리일" 로 미리 채운다 — 이미 적어 둔 날을 또 묻지 않게. */
  lastPeriodStart: Date | null;
  onClose: () => void;
  onStart: (payload: PregnancyStartPayload) => Promise<void>;
}) {
  const [nickname, setNickname] = useState("");
  const [emoji, setEmoji] = useState("🌱");
  const [color, setColor] = useState<PaletteKey>("rose");
  const [mode, setMode] = useState<DateMode>(lastPeriodStart ? "lmp" : "due");
  // 칸마다 따로 들고 있는다 — 미리 채운 마지막 생리일이 "출산 예정일" 로 바꿨을 때
  // 그대로 남아 과거 날짜가 예정일로 읽히지 않게.
  const [dates, setDates] = useState<Record<DateMode, string>>({
    due: "",
    lmp: lastPeriodStart ? toDateInput(lastPeriodStart) : "",
  });
  const [busy, setBusy] = useState(false);

  const dateStr = dates[mode];
  const due = dateStr ? (mode === "due" ? fromDateInput(dateStr) : dueDateFromLmp(fromDateInput(dateStr))) : null;
  const canSave = !!due && !busy;

  async function submit() {
    if (!canSave) return;
    setBusy(true);
    try {
      await onStart({
        nickname: nickname.trim(),
        emoji: emoji.trim() || "🌱",
        color,
        ...(mode === "due" ? { dueDate: dateStr } : { lmpDate: dateStr }),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="임신을 확인했어요"
      emoji="🌱"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button onClick={submit} disabled={!canSave}>
            시작하기
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="태명">
          <Input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="비워 두면 '우리 아기'"
            maxLength={20}
          />
        </Field>

        {/* 폰에서는 색 여섯 개(232px)가 이모지 칸 옆에 다 못 들어가 여섯째가 다음 줄로 밀렸다.
            좁을 때는 위아래로 놓는다. */}
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
          <Field label="색">
            <ColorPicker value={color} onChange={setColor} className="pt-1.5 sm:pt-1.5" />
          </Field>
        </div>

        <Field label="날짜" hint={due ? `출산 예정일 ${kDate(due)}` : "둘 중 아는 날짜를 넣어 주세요."}>
          <div className="flex flex-col gap-2">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "due", label: "출산 예정일" },
                { value: "lmp", label: "마지막 생리일" },
              ]}
              className="self-start"
            />
            <Input
              type="date"
              value={dateStr}
              onChange={(e) => setDates((d) => ({ ...d, [mode]: e.target.value }))}
            />
          </div>
        </Field>
      </div>
    </Modal>
  );
}
