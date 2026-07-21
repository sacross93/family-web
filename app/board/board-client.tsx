"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Pin, PinOff, Sparkles } from "lucide-react";
import {
  PageHeader,
  Card,
  Button,
  ColorPicker,
  Avatar,
  IconButton,
  EmptyState,
  Modal,
} from "@/components/ui";
import { MarkdownEditor } from "@/components/markdown-editor";
import { MarkdownView } from "@/components/markdown-view";
import { DecorationSurface } from "@/components/decoration-surface";
import { palette, PALETTE_KEYS, type PaletteKey } from "@/lib/colors";
import { kDateShort } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { BoardPostWithAuthor, FamilyMember } from "@/lib/types";

/** 쪽지에 붙일 스티커 이모지 프리셋 */
const EMOJI_PRESETS = [
  "💬", "💛", "🎉", "🙏", "🍚", "☕",
  "🌸", "🐾", "✅", "😴", "🎂", "📢",
];

/** 코르크보드 느낌의 미세한 회전 (과하지 않게 -1.5deg ~ 1.5deg) */
const ROTATIONS = [
  "rotate-[-1.4deg]",
  "rotate-[1deg]",
  "rotate-[-0.6deg]",
  "rotate-[1.5deg]",
  "rotate-[0.4deg]",
  "rotate-[-1deg]",
  "rotate-[0.7deg]",
];

function sortPosts(list: BoardPostWithAuthor[]) {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function toKey(color?: string | null): PaletteKey {
  return color && (PALETTE_KEYS as string[]).includes(color)
    ? (color as PaletteKey)
    : "butter";
}

export function BoardClient({
  initialPosts,
  members,
}: {
  initialPosts: BoardPostWithAuthor[];
  members: FamilyMember[];
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [content, setContent] = useState("");
  const [emoji, setEmoji] = useState("💬");
  const [color, setColor] = useState<PaletteKey>("butter");
  const [authorId, setAuthorId] = useState<string>(members[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<BoardPostWithAuthor | null>(null);
  const [decoratingId, setDecoratingId] = useState<string | null>(null);

  const pinnedCount = posts.filter((p) => p.pinned).length;

  async function addPost() {
    if (!content.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          emoji,
          color,
          authorId: authorId || null,
        }),
      });
      if (res.ok) {
        const created: BoardPostWithAuthor = await res.json();
        setPosts((prev) => sortPosts([created, ...prev]));
        setContent("");
        setEmoji("💬");
      }
    } finally {
      setBusy(false);
    }
  }

  async function togglePin(post: BoardPostWithAuthor) {
    const next = !post.pinned;
    setPosts((prev) =>
      sortPosts(prev.map((p) => (p.id === post.id ? { ...p, pinned: next } : p)))
    );
    const res = await fetch(`/api/board/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: next }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setPosts((prev) =>
        sortPosts(
          prev.map((p) => (p.id === post.id ? { ...p, pinned: post.pinned } : p))
        )
      );
    }
  }

  async function remove(id: string) {
    const prev = posts;
    setPosts((p) => p.filter((x) => x.id !== id));
    const res = await fetch(`/api/board/${id}`, { method: "DELETE" }).catch(
      () => null
    );
    if (!res || !res.ok) setPosts(prev);
  }

  function applyEdit(updated: BoardPostWithAuthor) {
    setPosts((prev) =>
      sortPosts(prev.map((p) => (p.id === updated.id ? updated : p)))
    );
  }

  return (
    <div>
      <PageHeader
        emoji="📌"
        title="가족 게시판"
        description="냉장고 문에 붙이는 우리 가족 한마디"
      />

      {/* 새 쪽지 붙이기 */}
      <Card className="mb-6 flex flex-col gap-3">
        <MarkdownEditor
          value={content}
          onChange={setContent}
          placeholder="가족에게 한마디 남겨보세요 💛 (제목·굵게·목록·체크박스·사진까지 마크다운으로!)"
          minHeight={120}
        />
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink-faint">스티커</span>
            <EmojiPicker value={emoji} onChange={setEmoji} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink-faint">쪽지 색</span>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          {members.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink-faint">작성자</span>
              <AuthorPicker
                members={members}
                value={authorId}
                onChange={setAuthorId}
              />
            </div>
          )}
          <div className="ml-auto">
            <Button onClick={addPost} disabled={!content.trim() || busy}>
              <Plus className="h-4 w-4" /> 붙이기
            </Button>
          </div>
        </div>
      </Card>

      {/* 메모 벽 */}
      {posts.length === 0 ? (
        <EmptyState
          emoji="💛"
          title="아직 쪽지가 없어요"
          description="첫 한마디를 붙여보세요! 💛"
        />
      ) : (
        <>
          {pinnedCount > 0 && (
            <p className="mb-3 px-1 text-sm text-ink-soft">
              고정된 쪽지 <span className="font-num font-bold">{pinnedCount}</span>개가
              맨 위에 있어요 📌
            </p>
          )}
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
            {posts.map((post, i) => (
              <NoteCard
                key={post.id}
                post={post}
                rotation={ROTATIONS[i % ROTATIONS.length]}
                decorating={decoratingId === post.id}
                onToggleDecorate={() =>
                  setDecoratingId((cur) => (cur === post.id ? null : post.id))
                }
                onEdit={() => setEditing(post)}
                onPin={() => togglePin(post)}
                onRemove={() => remove(post.id)}
              />
            ))}
          </div>
        </>
      )}

      {editing && (
        <EditModal
          post={editing}
          members={members}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            applyEdit(updated);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   쪽지 한 장
   ───────────────────────────────────────────── */
function NoteCard({
  post,
  rotation,
  decorating,
  onToggleDecorate,
  onEdit,
  onPin,
  onRemove,
}: {
  post: BoardPostWithAuthor;
  rotation: string;
  decorating: boolean;
  onToggleDecorate: () => void;
  onEdit: () => void;
  onPin: () => void;
  onRemove: () => void;
}) {
  const pal = palette(post.color);
  return (
    <div
      className={cn(
        "group relative mb-4 break-inside-avoid rounded-3xl p-5 pt-7 shadow-sm transition-all duration-300 animate-pop-in",
        pal.soft,
        // 고정 쪽지는 핀, 일반 쪽지는 워시테이프
        post.pinned ? "ring-2 ring-inset ring-primary/25" : "tape",
        decorating
          ? "z-20 rotate-0 shadow-pop ring-2 ring-primary/40"
          : cn(rotation, "hover:z-10 hover:rotate-0 hover:shadow-pop")
      )}
    >
      {/* 고정 핀 */}
      {post.pinned && (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-3 left-1/2 z-[6] -translate-x-1/2 select-none text-2xl drop-shadow-sm"
        >
          📌
        </span>
      )}

      {/* 호버 액션 */}
      <div
        className={cn(
          "absolute right-2.5 top-2.5 z-[6] flex gap-1 transition lg:group-hover:opacity-100 lg:group-focus-within:opacity-100",
          decorating ? "opacity-100" : "opacity-100 lg:opacity-0"
        )}
      >
        <IconButton
          variant="surface"
          size="sm"
          aria-label="사진 꾸미기"
          onClick={onToggleDecorate}
          className={decorating ? "text-primary" : undefined}
        >
          <Sparkles className="h-4 w-4" />
        </IconButton>
        <IconButton
          variant="surface"
          size="sm"
          aria-label={post.pinned ? "고정 해제" : "맨 위에 고정"}
          onClick={onPin}
          className={post.pinned ? "text-primary" : undefined}
        >
          {post.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        </IconButton>
        <IconButton variant="surface" size="sm" aria-label="수정" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </IconButton>
        <IconButton
          variant="surface"
          size="sm"
          aria-label="삭제"
          onClick={onRemove}
          className="hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>

      {/* 내용 + 사진 꾸미기 표면 */}
      <DecorationSurface
        surfaceKey={`board:${post.id}`}
        canEdit
        variant="embedded"
        clip
        showTrigger={false}
        editing={decorating}
        onEditingChange={(b) => {
          if (!b && decorating) onToggleDecorate();
        }}
        className="isolate"
      >
        <div className="mb-2 text-3xl leading-none">{post.emoji || "💬"}</div>
        <MarkdownView>{post.content}</MarkdownView>

        <div className="mt-4 flex items-center gap-2 border-t border-ink/5 pt-3">
          {post.author ? (
            <>
              <Avatar
                emoji={post.author.emoji}
                color={post.author.color}
                name={post.author.name}
                size="xs"
              />
              <span className={cn("text-sm font-semibold", pal.ink)}>
                {post.author.name}
              </span>
            </>
          ) : (
            <span className="text-sm font-semibold text-ink-soft">우리 가족</span>
          )}
          <span className="ml-auto text-xs text-ink-faint">
            {kDateShort(post.createdAt)}
          </span>
        </div>
      </DecorationSurface>
    </div>
  );
}

/* ─────────────────────────────────────────────
   수정 모달
   ───────────────────────────────────────────── */
function EditModal({
  post,
  members,
  onClose,
  onSaved,
}: {
  post: BoardPostWithAuthor;
  members: FamilyMember[];
  onClose: () => void;
  onSaved: (updated: BoardPostWithAuthor) => void;
}) {
  const [content, setContent] = useState(post.content);
  const [emoji, setEmoji] = useState(post.emoji || "💬");
  const [color, setColor] = useState<PaletteKey>(toKey(post.color));
  const [authorId, setAuthorId] = useState<string>(post.authorId ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!content.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/board/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          emoji,
          color,
          authorId: authorId || null,
        }),
      });
      if (res.ok) {
        const updated: BoardPostWithAuthor = await res.json();
        onSaved(updated);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="쪽지 수정"
      emoji="✏️"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button onClick={save} disabled={!content.trim() || busy}>
            저장
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <MarkdownEditor value={content} onChange={setContent} minHeight={140} autoFocus />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink-faint">스티커</span>
          <EmojiPicker value={emoji} onChange={setEmoji} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink-faint">쪽지 색</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        {members.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink-faint">작성자</span>
            <AuthorPicker
              members={members}
              value={authorId}
              onChange={setAuthorId}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   재사용: 이모지 / 작성자 선택
   ───────────────────────────────────────────── */
function EmojiPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (e: string) => void;
}) {
  return (
    <div className="flex max-w-[16rem] flex-wrap gap-1">
      {EMOJI_PRESETS.map((e) => {
        const active = value === e;
        return (
          <button
            key={e}
            type="button"
            onClick={() => onChange(e)}
            aria-label={`이모지 ${e}`}
            aria-pressed={active}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full text-lg transition active:scale-90",
              active
                ? "bg-sunken ring-2 ring-primary"
                : "hover:bg-sunken"
            )}
          >
            {e}
          </button>
        );
      })}
    </div>
  );
}

function AuthorPicker({
  members,
  value,
  onChange,
}: {
  members: FamilyMember[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {members.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          aria-pressed={value === m.id}
          aria-label={m.name}
          className={cn(
            "rounded-full transition",
            value === m.id
              ? "ring-2 ring-primary ring-offset-1"
              : "opacity-50 hover:opacity-100"
          )}
        >
          <Avatar emoji={m.emoji} color={m.color} name={m.name} size="sm" />
        </button>
      ))}
    </div>
  );
}
