"use client";

import { useState } from "react";
import { Trash2, ChevronDown } from "lucide-react";
import { Modal, Button, Field, Input, Segmented, Avatar } from "@/components/ui";
import { MarkdownEditor } from "@/components/markdown-editor";
import { cn } from "@/lib/utils";
import { toDateInput, fromDateInput, kDate } from "@/lib/date";
import type { BabyEntryWithAuthor, FamilyMember } from "@/lib/types";
import { ENTRY_KINDS, KIND_META, MOODS, AUTHOR_STORAGE_KEY, type EntryKind } from "./baby-meta";
import { writeMe } from "@/lib/me";

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
  // 날짜·누가·컨디션은 접어 둔다 — 전부 기본값이 있고, 대개 그대로 쓴다.
  const [more, setMore] = useState(false);

  const meta = KIND_META[kind];
  const author = members.find((m) => m.id === authorId) ?? null;
  // 접힌 줄이 지금 값을 말한다 — 펴지 않고도 무엇으로 저장될지 알 수 있게.
  const dateLabel = dateStr === toDateInput(new Date()) ? "오늘" : kDate(fromDateInput(dateStr));
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
          if (authorId) {
            window.localStorage.setItem(AUTHOR_STORAGE_KEY, authorId);
            // 방금 "내가 썼다" 고 고른 것이다 — 포동이가 물어보지 않아도 알게 같은 값을 남긴다.
            writeMe(authorId);
          }
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
        {/* **쓰는 칸이 맨 위에 있다.**
            전에는 날짜 → 누가 → 종류 → 컨디션(이모지 여덟) 을 지나야 글 칸이 나왔다.
            "오늘 입덧이 심했다" 한 줄을 남기려고 다섯 가지를 정해야 했고,
            배포본의 일기는 **한 편도 없었다**. 나머지는 전부 기본값이 있다 —
            오늘, 일상, 지난번에 쓴 사람. 바꾸고 싶으면 아래를 펴면 된다. */}
        <MarkdownEditor
          value={content}
          onChange={setContent}
          placeholder={meta.placeholder}
          minHeight={180}
          autoFocus={!initial}
        />

        <Segmented
          value={kind}
          onChange={setKind}
          options={ENTRY_KINDS.map((k) => ({ value: k, label: `${KIND_META[k].emoji} ${KIND_META[k].label}` }))}
        />

        <div className="rounded-lg border border-line">
          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            aria-expanded={more}
            className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm text-ink-soft"
          >
            <span>{dateLabel}</span>
            {author && (
              <Avatar emoji={author.emoji} color={author.color} name={author.name} size="xs" />
            )}
            {mood && <span aria-label={`컨디션 ${mood}`}>{mood}</span>}
            <ChevronDown
              className={cn("ml-auto h-4 w-4 shrink-0 text-ink-faint transition", more && "rotate-180")}
            />
          </button>

          {more && (
            <div className="flex flex-col gap-4 border-t border-line px-4 py-4">
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
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
