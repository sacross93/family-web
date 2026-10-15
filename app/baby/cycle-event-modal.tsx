"use client";

import { useState } from "react";
import { Modal, Button, Field, Input, Segmented } from "@/components/ui";
import { toDateInput } from "@/lib/date";
import { CYCLE_KIND_META, TEST_RESULTS, TEST_RESULT_META, type CycleKind, type TestResult } from "@/lib/cycle";

export interface CycleEventPayload {
  /** "yyyy-MM-dd" */
  date: string;
  kind: CycleKind;
  /** 테스트기만. 그 밖은 null */
  result: TestResult | null;
}

/** 주기 기록 하나 적기. 부모가 `{kind && <CycleEventModal/>}` 로 마운트하므로 열릴 때마다 오늘로 시작한다. */
export function CycleEventModal({
  kind,
  onClose,
  onSave,
}: {
  kind: CycleKind;
  onClose: () => void;
  /** 저장에 성공하면 true — 그때만 닫는다(실패하면 고른 날짜가 남아 다시 누를 수 있게). */
  onSave: (payload: CycleEventPayload) => Promise<boolean>;
}) {
  const meta = CYCLE_KIND_META[kind];
  const isTest = kind === "ovulationTest";
  const [dateStr, setDateStr] = useState(toDateInput(new Date()));
  // 테스트기 결과는 **미리 골라 두지 않는다** — 기본값이 있으면 고르지 않고 저장해
  // 실제와 다른 결과가 남는다. 고르기 전엔 저장이 꺼져 있다.
  const [result, setResult] = useState<TestResult | "">("");
  const [busy, setBusy] = useState(false);

  const canSave = dateStr.length > 0 && (!isTest || result !== "") && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    try {
      const ok = await onSave({ date: dateStr, kind, result: isTest && result ? result : null });
      if (ok) onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={meta.label}
      emoji={meta.emoji}
      size="sm"
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
        <Field label="날짜">
          <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
        </Field>
        {isTest && (
          <Field label="결과">
            <Segmented<TestResult | "">
              value={result}
              onChange={setResult}
              options={TEST_RESULTS.map((r) => ({ value: r, label: TEST_RESULT_META[r].label }))}
              className="self-start"
            />
          </Field>
        )}
      </div>
    </Modal>
  );
}
