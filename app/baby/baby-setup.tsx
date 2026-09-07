"use client";

import { useState } from "react";
import { Card, Button, Field, Input, Segmented, ColorPicker } from "@/components/ui";
import type { PaletteKey } from "@/lib/colors";
import { dueDateFromLmp, fromDateInput, kDate } from "@/lib/date";

export interface BabySetupPayload {
  nickname: string;
  emoji: string;
  color: PaletteKey;
  /** ISO. 서버는 dueDate 를 그대로 저장 */
  dueDate: string;
}

type DateMode = "due" | "lmp";

/** 아기가 아직 없을 때: 태명 + 예정일(또는 마지막 생리일)로 시작 */
export function BabySetup({ onCreate }: { onCreate: (p: BabySetupPayload) => Promise<void> }) {
  const [nickname, setNickname] = useState("");
  const [emoji, setEmoji] = useState("🌱");
  const [color, setColor] = useState<PaletteKey>("rose");
  const [mode, setMode] = useState<DateMode>("due");
  const [dateStr, setDateStr] = useState("");
  const [busy, setBusy] = useState(false);

  const due = dateStr
    ? mode === "due"
      ? fromDateInput(dateStr)
      : dueDateFromLmp(fromDateInput(dateStr))
    : null;
  const canSave = nickname.trim().length > 0 && !!due && !busy;

  async function submit() {
    if (!canSave || !due) return;
    setBusy(true);
    try {
      await onCreate({
        nickname: nickname.trim(),
        emoji: emoji.trim() || "🌱",
        color,
        dueDate: due.toISOString(),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <div>
        <p className="text-lg font-bold text-ink">우리 아기 이야기를 시작해 볼까요? 🌱</p>
        <p className="mt-1 text-sm text-ink-soft">
          태명과 예정일만 있으면 돼요. 나중에 언제든 고칠 수 있어요.
        </p>
      </div>

      <Field label="태명">
        <Input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="예: 콩이"
          maxLength={20}
          autoFocus
        />
      </Field>

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
        <Field label="색">
          <ColorPicker value={color} onChange={setColor} className="pt-1.5" />
        </Field>
      </div>

      <Field
        label="날짜"
        hint={due ? `출산 예정일 ${kDate(due)}` : "둘 중 아는 날짜를 넣어 주세요."}
      >
        <div className="flex flex-col gap-2">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "due", label: "출산 예정일" },
              { value: "lmp", label: "마지막 생리일" },
            ]}
          />
          <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
        </div>
      </Field>

      <Button size="lg" onClick={submit} disabled={!canSave}>
        시작하기
      </Button>
    </Card>
  );
}
