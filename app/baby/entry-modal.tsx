"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal, Button, Field, Input, Segmented, Avatar } from "@/components/ui";
import { MarkdownEditor } from "@/components/markdown-editor";
import { cn } from "@/lib/utils";
import { toDateInput } from "@/lib/date";
import type { BabyEntryWithAuthor, FamilyMember } from "@/lib/types";
import { ENTRY_KINDS, KIND_META, MOODS, AUTHOR_STORAGE_KEY, type EntryKind } from "./baby-meta";

export interface EntryPayload {
  /** "yyyy-MM-dd" */
  date: string;
  kind: EntryKind;
  mood: string | null;
  content: string;
  authorId: string | null;
}

function rememberedAuthor(members: FamilyMember[], initial?: string | null) {
  if (initial && members.some((m) => m.id === initial)) return initial;
  try {
    const saved = window.localStorage.getItem(AUTHOR_STORAGE_KEY);
    if (saved && members.some((m) => m.id === saved)) return saved;
  } catch {
    /* localStorage 접근 불가 환경 */
  }
  return members[0]?.id ?? "";
}

/** 기록 작성(initial 없음) / 수정(initial 있음). 부모가 조건부 마운트하므로 열릴 때 초기화됨 */
export function EntryModal({
  members,
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  members: FamilyMember[];
  initial?: BabyEntryWithAuthor | null;
  onClose: () => void;
  onSave: (payload: EntryPayload) => Promise<boolean>;
  onDelete?: () => void;
}) {
  const [authorId, setAuthorId] = useState(() => rememberedAuthor(members, initial?.authorId));
  const [dateStr, setDateStr] = useState(toDateInput(initial?.date ?? new Date()));
  const [kind, setKind] = useState<EntryKind>((initial?.kind as EntryKind) ?? "diary");
  const [mood, setMood] = useState<string | null>(initial?.mood ?? null);
  const [content, setContent] = useState(initial?.content ?? "");
  const [busy, setBusy] = useState(false);

  const meta = KIND_META[kind];
  const canSave = content.trim().length > 0 && dateStr.length > 0 && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    try {
      const ok = await onSave({
        date: dateStr,
        kind,
        mood: kind === "diary" ? mood : null,
        content: content.trim(),
        authorId: authorId || null,
      });
      if (ok) {
        try {
          if (authorId) window.localStorage.setItem(AUTHOR_STORAGE_KEY, authorId);
        } catch {
          /* ignore */
        }
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "기록 고치기" : "기록 남기기"}
      emoji={meta.emoji}
      size="lg"
      footer={
        <>
          {initial && onDelete && (
            <Button variant="danger" onClick={onDelete} className="mr-auto">
              <Trash2 className="h-4 w-4" /> 삭제
            </Button>
          )}
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
        <div className="flex flex-wrap items-end gap-4">
          {members.length > 0 && (
            <Field label="누가">
              <div className="flex flex-wrap gap-1.5 pt-1">
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setAuthorId(m.id)}
                    aria-pressed={authorId === m.id}
                    aria-label={m.name}
                    className={cn(
                      "rounded-full transition",
                      authorId === m.id ? "ring-2 ring-primary ring-offset-1" : "opacity-50 hover:opacity-100"
                    )}
                  >
                    <Avatar emoji={m.emoji} color={m.color} name={m.name} size="md" />
                  </button>
                ))}
              </div>
            </Field>
          )}
          <Field label="날짜" className="min-w-[160px] flex-1">
            <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
          </Field>
        </div>

        <Field label="종류">
          <Segmented
            value={kind}
            onChange={setKind}
            options={ENTRY_KINDS.map((k) => ({ value: k, label: `${KIND_META[k].emoji} ${KIND_META[k].label}` }))}
          />
        </Field>

        {kind === "diary" && (
          <Field label="오늘 컨디션" hint="선택이에요. 다시 누르면 지워져요.">
            <div className="flex flex-wrap gap-1.5 pt-1">
              {MOODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMood(mood === m ? null : m)}
                  aria-pressed={mood === m}
                  aria-label={`컨디션 ${m}`}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full text-xl transition",
                    mood === m ? "bg-primary-soft ring-2 ring-primary" : "bg-sunken hover:bg-line"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </Field>
        )}

        <Field label="내용">
          <MarkdownEditor
            value={content}
            onChange={setContent}
            placeholder={meta.placeholder}
            minHeight={180}
            autoFocus={!initial}
          />
        </Field>
      </div>
    </Modal>
  );
}
