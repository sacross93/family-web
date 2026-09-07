"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui";
import type { BabyDetail, FamilyMember, Baby } from "@/lib/types";
import { BabySetup, type BabySetupPayload } from "./baby-setup";
import { BabyHero } from "./baby-hero";
import { BabySettingsModal, type BabySettingsPatch } from "./baby-settings-modal";

const JSON_HEADERS = { "Content-Type": "application/json" };

async function readError(res: Response, fallback: string) {
  const data = await res.json().catch(() => null);
  return (data?.error as string | undefined) ?? fallback;
}

export function BabyClient({
  initialBaby,
  members,
}: {
  initialBaby: BabyDetail | null;
  members: FamilyMember[];
}) {
  void members; // Task 5에서 사용
  const [baby, setBaby] = useState<BabyDetail | null>(initialBaby);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── 아기 생성 / 설정 ──
  async function createBaby(payload: BabySetupPayload) {
    const res = await fetch("/api/baby", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (!res || !res.ok) {
      alert(res ? await readError(res, "저장하지 못했어요.") : "저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    const created: Baby = await res.json();
    setBaby({ ...created, entries: [], checklist: [] });
  }

  async function saveSettings(patch: BabySettingsPatch) {
    if (!baby) return;
    const prev = baby;
    setBaby({ ...baby, ...patch, dueDate: new Date(patch.dueDate), birthDate: patch.birthDate ? new Date(patch.birthDate) : null });
    const res = await fetch("/api/baby", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ id: baby.id, ...patch }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setBaby(prev);
      alert("설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    const updated: Baby = await res.json();
    setBaby((b) => (b ? { ...b, ...updated } : b));
  }

  // ── 아기 없음: 첫 설정 ──
  if (!baby) {
    return (
      <div className="flex flex-col gap-6 pb-24">
        <PageHeader emoji="🌱" title="아기" description="함께 쓰는 임신·아기 일기" />
        <BabySetup onCreate={createBaby} />
      </div>
    );
  }

  // ── 아기 있음 ──
  return (
    <div className="flex flex-col gap-6 pb-24">
      <PageHeader emoji={baby.emoji} title={baby.nickname} description="함께 쓰는 아기 일기" />

      <BabyHero baby={baby} entries={baby.entries} onOpenSettings={() => setSettingsOpen(true)} />

      {settingsOpen && (
        <BabySettingsModal baby={baby} onClose={() => setSettingsOpen(false)} onSave={saveSettings} />
      )}
    </div>
  );
}
