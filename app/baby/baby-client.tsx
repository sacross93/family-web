"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader, Button } from "@/components/ui";
import type { BabyDetail, FamilyMember, Baby, BabyEntryWithAuthor } from "@/lib/types";
import { BabySetup, type BabySetupPayload } from "./baby-setup";
import { BabyHero } from "./baby-hero";
import { BabySettingsModal, type BabySettingsPatch } from "./baby-settings-modal";
import { EntryModal, type EntryPayload } from "./entry-modal";
import { EntryTimeline, type EntryFilter } from "./entry-timeline";
import type { BabyChecklistItem } from "@/lib/types";
import { DEFAULT_CHECKLIST } from "./baby-meta";
import { BabyChecklist } from "./baby-checklist";

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
  const [baby, setBaby] = useState<BabyDetail | null>(initialBaby);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filter, setFilter] = useState<EntryFilter>("all");
  // null=닫힘, "new"=새 기록, entry=수정
  const [entryModal, setEntryModal] = useState<"new" | BabyEntryWithAuthor | null>(null);

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

  // ── 기록 ──
  function sortEntries(list: BabyEntryWithAuthor[]) {
    return [...list].sort((a, b) => {
      const d = new Date(b.date).getTime() - new Date(a.date).getTime();
      return d !== 0 ? d : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  async function saveEntry(payload: EntryPayload): Promise<boolean> {
    if (!baby) return false;
    const editing = entryModal && entryModal !== "new" ? entryModal : null;
    const res = await fetch(editing ? `/api/baby-entries/${editing.id}` : "/api/baby-entries", {
      method: editing ? "PATCH" : "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(editing ? payload : { babyId: baby.id, ...payload }),
    }).catch(() => null);
    if (!res || !res.ok) {
      alert(res ? await readError(res, "기록을 저장하지 못했어요.") : "기록을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      return false;
    }
    const saved: BabyEntryWithAuthor = await res.json();
    setBaby((b) =>
      b
        ? {
            ...b,
            entries: sortEntries(editing ? b.entries.map((e) => (e.id === saved.id ? saved : e)) : [saved, ...b.entries]),
          }
        : b
    );
    return true;
  }

  async function deleteEntry(entry: BabyEntryWithAuthor) {
    if (!baby) return;
    if (!confirm("이 기록을 지울까요?")) return;
    const prev = baby.entries;
    setBaby((b) => (b ? { ...b, entries: b.entries.filter((e) => e.id !== entry.id) } : b));
    setEntryModal(null);
    const res = await fetch(`/api/baby-entries/${entry.id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      setBaby((b) => (b ? { ...b, entries: prev } : b));
      alert("기록을 지우지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  // ── 체크리스트 ──
  async function addCheck(text: string) {
    if (!baby) return;
    const res = await fetch("/api/baby-checklist", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ babyId: baby.id, text }),
    }).catch(() => null);
    if (!res || !res.ok) return;
    const created: BabyChecklistItem = await res.json();
    setBaby((b) => (b ? { ...b, checklist: [...b.checklist, created] } : b));
  }

  async function addDefaultChecks() {
    if (!baby) return;
    const res = await fetch("/api/baby-checklist", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ babyId: baby.id, texts: DEFAULT_CHECKLIST }),
    }).catch(() => null);
    if (!res || !res.ok) return;
    const created: BabyChecklistItem[] = await res.json();
    setBaby((b) => (b ? { ...b, checklist: [...b.checklist, ...created] } : b));
  }

  async function toggleCheck(item: BabyChecklistItem) {
    const next = !item.done;
    setBaby((b) => (b ? { ...b, checklist: b.checklist.map((c) => (c.id === item.id ? { ...c, done: next } : c)) } : b));
    const res = await fetch(`/api/baby-checklist/${item.id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ done: next }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setBaby((b) => (b ? { ...b, checklist: b.checklist.map((c) => (c.id === item.id ? { ...c, done: item.done } : c)) } : b));
    }
  }

  async function removeCheck(id: string) {
    if (!baby) return;
    const prev = baby.checklist;
    setBaby((b) => (b ? { ...b, checklist: b.checklist.filter((c) => c.id !== id) } : b));
    const res = await fetch(`/api/baby-checklist/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) setBaby((b) => (b ? { ...b, checklist: prev } : b));
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
      <PageHeader emoji={baby.emoji} title={baby.nickname} description="함께 쓰는 아기 일기">
        <Button onClick={() => setEntryModal("new")}>
          <Plus className="h-4 w-4" /> 기록 남기기
        </Button>
      </PageHeader>

      <BabyHero baby={baby} entries={baby.entries} onOpenSettings={() => setSettingsOpen(true)} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:order-2">
          <div className="lg:sticky lg:top-6">
            <BabyChecklist
              items={baby.checklist}
              color={baby.color}
              onAdd={addCheck}
              onAddDefaults={addDefaultChecks}
              onToggle={toggleCheck}
              onRemove={removeCheck}
            />
          </div>
        </div>
        <div className="lg:order-1 lg:col-span-2">
          <EntryTimeline
            entries={baby.entries}
            filter={filter}
            onFilterChange={setFilter}
            dueDate={baby.dueDate}
            birthDate={baby.birthDate}
            onEdit={(e) => setEntryModal(e)}
            onDelete={deleteEntry}
            onCreate={() => setEntryModal("new")}
          />
        </div>
      </div>

      {settingsOpen && (
        <BabySettingsModal baby={baby} onClose={() => setSettingsOpen(false)} onSave={saveSettings} />
      )}
      {entryModal && (
        <EntryModal
          members={members}
          initial={entryModal === "new" ? null : entryModal}
          onClose={() => setEntryModal(null)}
          onSave={saveEntry}
          onDelete={entryModal === "new" ? undefined : () => deleteEntry(entryModal)}
        />
      )}
    </div>
  );
}
