"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Pencil,
  UploadCloud,
  Star,
  ExternalLink,
} from "lucide-react";
import {
  Button,
  ItemActions,
  EmptyState,
  Modal,
  Field,
  Input,
  Textarea,
  ColorPicker,
  Spinner,
  useToast,
  PhotoImg,
} from "@/components/ui";
import { type PaletteKey } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { kDateShort } from "@/lib/date";
import type { Album, Photo, AlbumWithPhotos } from "@/lib/types";
import { ORIGINAL, isStorageFull, uploadErrorMessage, uploadImage } from "@/lib/upload-client";

const JSON_HEADERS = { "Content-Type": "application/json" };

// 사진은 원본으로 저장된다(폰 사진 수 MB). 화면에는 칸 너비에 맞게 줄인 것이 간다 — 그 너비들.
// 2026-10-19 에 재 본 값(폭 → 그려진 CSS px). 레이아웃을 바꾸면 다시 재고 고칠 것.

/** 격자(`columns-2 md:columns-3`): 360→158 · 390→173 · 430→193 · 640→290 · 768→232 · 1024→219 · 1280→304 · 1536 이상→349. */
const GRID_SIZES =
  "(min-width: 1414px) 349px, (min-width: 1024px) calc((100vw - 367px) / 3), (min-width: 768px) calc((100vw - 72px) / 3), (min-width: 640px) calc((100vw - 60px) / 2), calc((100vw - 44px) / 2)";

/** 머리 배경(투명도 15%, 판 전체): 390→358 · 640→592 · 768→720 · 1024→680 · 1280→936 · 1536 이상→1072. */
const HERO_SIZES =
  "(min-width: 1416px) 1072px, (min-width: 1024px) calc(100vw - 344px), (min-width: 640px) calc(100vw - 48px), calc(100vw - 32px)";

/**
 * 사진 보기 판(창 `lg`, 높이 58dvh 상한): 360→320 · 390→350 · 430→390 · 672 이상→632.
 * 가로 사진 기준이다 — 세로 사진은 높이에 걸려 더 좁게 그려지니 조금 크게 받는다.
 */
const LIGHTBOX_SIZES = "(min-width: 672px) 632px, calc(100vw - 40px)";

/** Date | string | null → yyyy-MM-dd (date input용) */
function toDateInput(d?: Date | string | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export function AlbumDetailClient({
  initialAlbum,
}: {
  initialAlbum: AlbumWithPhotos;
}) {
  const { say } = useToast();
  const router = useRouter();

  const [album, setAlbum] = useState<Album>(initialAlbum);
  const [photos, setPhotos] = useState<Photo[]>(initialAlbum.photos);

  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const [busy, setBusy] = useState(false);

  // ── 라이트박스 좌우 이동 (키보드) ──
  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setLightbox((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
      } else if (e.key === "ArrowRight") {
        setLightbox((i) => (i === null ? i : (i + 1) % photos.length));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, photos.length]);

  // ── 사진 생성 (URL 또는 업로드 공통) ──
  async function createPhoto(url: string): Promise<Photo | null> {
    const res = await fetch("/api/photos", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ albumId: album.id, url }),
    });
    if (!res.ok) return null;
    const created: Photo = await res.json();
    setPhotos((prev) => [...prev, created]);
    return created;
  }

  // ── 사진 삭제 ──
  async function removePhoto(id: string) {
    const prev = photos;
    setPhotos((p) => p.filter((x) => x.id !== id));
    const res = await fetch(`/api/photos/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setPhotos(prev);
      say("사진을 못 지웠어요. 잠시 후 다시 해 주세요.", "error");
    }
  }

  // ── 앨범 삭제 ──
  async function deleteAlbum() {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/albums/${album.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/albums");
      router.refresh();
    } else {
      setBusy(false);
    }
  }

  // ── 커버 지정 ──
  async function setCover(url: string) {
    const res = await fetch(`/api/albums/${album.id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ coverUrl: url }),
    });
    if (res.ok) {
      const updated: Album = await res.json();
      setAlbum(updated);
    }
  }

  return (
    <div>
      {/* 뒤로가기 */}
      <Link
        href="/albums"
        className="mb-2 -ml-2 inline-flex items-center gap-1 px-2 py-2.5 text-sm font-semibold text-ink-soft transition hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" /> 앨범 목록
      </Link>

      {/* 앨범 헤더 — 다른 상세 화면(아기·계획)과 같은 진한 판. */}
      {/* `group` — 데스크톱의 `ItemActions` 아이콘이 `group-hover` 로 뜬다. 없으면 영영 투명하다. */}
      <section className="group on-chrome relative mb-7 overflow-hidden rounded-xl bg-gradient-to-br from-chrome via-chrome to-peach-soft p-6 sm:p-8">
        {album.coverUrl && (
          <>
            <PhotoImg
              src={album.coverUrl}
              alt=""
              aria-hidden
              maxWidth={1072}
              sizes={HERO_SIZES}
              className="absolute inset-0 h-full w-full object-cover opacity-15"
              loading="lazy"
            />
            {/* 덮개를 뗐다. 틀이 밝아진 뒤로 흰 겹을 얹으니 히어로가 **표백된 것처럼**
                희어져 로즈가 사라졌다. 대신 표지를 15% 로 낮춘다 — 가장 어두운 사진이
                와도 제목 6.4:1, 아래 한 줄 5.1:1 로 읽힌다(아래 줄은 진한 쪽으로 쓴다). */}
          </>
        )}
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-2xl">
              {album.emoji}
            </span>
            <div className="min-w-0">
              <h1 className="break-keep font-display text-2xl font-bold leading-tight text-chrome-ink sm:text-3xl">
                {album.title}
              </h1>
              {album.description && (
                <p className="mt-1.5 max-w-lg text-sm text-chrome-faint">
                  {album.description}
                </p>
              )}
              {/* 예전에는 색 이름표("라벤더")와 가운뎃점이 붙은 날짜가 섞여
                  `라벤더 · 사진 6장 / · 4월 6일` 처럼 줄이 깨져 보였다. */}
              <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-chrome-ink/90">
                <span className="font-num">사진 {photos.length}장</span>
                {album.takenOn && (
                  <span className="font-num">{kDateShort(album.takenOn)}</span>
                )}
              </div>
            </div>
          </div>
          {/* 아이콘 둘이 제목과 같은 줄을 먹어 폰에서 앨범 이름이 낱말 가운데서 끊겼다.
              다른 상세 화면(계획·게시판)과 같은 `…` 로 모은다. */}
          <ItemActions
            inline
            className="shrink-0"
            actions={[
              { label: "앨범 수정", icon: Pencil, onClick: () => setShowEdit(true) },
              { label: "앨범 삭제", icon: Trash2, onClick: () => setShowDelete(true), danger: true },
            ]}
          />
        </div>
      </section>

      {/* 사진 툴바 */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-ink">사진</h2>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> 사진 추가
        </Button>
      </div>

      {/* 사진 그리드 (masonry) */}
      {photos.length === 0 ? (
        <EmptyState
          emoji="📷"
          title="아직 담긴 사진이 없어요"
          description="이 앨범에 첫 사진을 올려볼까요?"
          action={
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" /> 사진 추가
            </Button>
          }
        />
      ) : (
        <div className="columns-2 gap-3 md:columns-3">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setLightbox(i)}
              className="group relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-md bg-sunken ring-1 ring-line transition hover:ring-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <PhotoImg
                src={photo.url}
                alt={photo.caption ?? "사진"}
                maxWidth={360}
                sizes={GRID_SIZES}
                className="w-full transition-transform duration-500 group-hover:scale-[1.04]"
                loading="lazy"
              />
              {/* 설명은 사진을 열었을 때 보인다. 여기서 손 얹어야만 뜨게 두면
                  폰에서는 있는 줄도 모른다(AGENTS.md). 격자는 훑는 자리다. */}
            </button>
          ))}
        </div>
      )}

      {/* 사진 추가 모달 */}
      <AddPhotoModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreate={createPhoto}
      />

      {/* 앨범 수정 모달 */}
      <EditAlbumModal
        open={showEdit}
        album={album}
        busy={busy}
        onClose={() => setShowEdit(false)}
        onSaved={(updated) => {
          setAlbum(updated);
          setShowEdit(false);
        }}
      />

      {/* 앨범 삭제 확인 */}
      <Modal
        open={showDelete}
        onClose={() => !busy && setShowDelete(false)}
        title="앨범을 삭제할까요?"
        emoji="🗑️"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowDelete(false)} disabled={busy}>
              취소
            </Button>
            <Button variant="danger" onClick={deleteAlbum} disabled={busy}>
              삭제
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          <b className="text-ink">{album.title}</b> 앨범과 담긴 사진 {photos.length}장이
          모두 사라져요. 되돌릴 수 없어요.
        </p>
      </Modal>

      {/* 라이트박스 */}
      <Lightbox
        photos={photos}
        index={lightbox}
        coverUrl={album.coverUrl}
        emoji={album.emoji}
        title={album.title}
        onClose={() => setLightbox(null)}
        onPrev={() =>
          setLightbox((i) => (i === null ? i : (i - 1 + photos.length) % photos.length))
        }
        onNext={() =>
          setLightbox((i) => (i === null ? i : (i + 1) % photos.length))
        }
        onDelete={(id) => {
          removePhoto(id);
          setLightbox(null);
        }}
        onSetCover={setCover}
        onCaptionSaved={(id, caption) =>
          setPhotos((prev) =>
            prev.map((p) => (p.id === id ? { ...p, caption } : p))
          )
        }
      />
    </div>
  );
}

/* ─────────────────────────────────────────────
   사진 추가 (드래그&드롭 + 파일선택 + URL)
   ───────────────────────────────────────────── */
function AddPhotoModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (url: string) => Promise<Photo | null>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  function close() {
    if (busy) return;
    setUrlInput("");
    setError(null);
    setAddedCount(0);
    setDragOver(false);
    onClose();
  }

  async function uploadFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    // 앨범 사진은 **원본 그대로** 저장한다(가족이 고른 방향). 화면에는 줄인 것이 간다(lib/img.ts).
    // 한 장씩 올리고 곧바로 앨범에 적는다 — 한 장이 실패해도 나머지는 들어가고,
    // 올렸는데 앨범에 못 적힌 파일이 무더기로 남지 않는다.
    let ok = 0;
    let full: unknown = null;
    try {
      for (const [i, file] of images.entries()) {
        setProgress({ done: i, total: images.length });
        try {
          const url = await uploadImage(file, ORIGINAL);
          if (await onCreate(url)) ok += 1;
        } catch (e) {
          // 저장 공간이 찼으면 남은 장도 안 들어간다 — 멈추고 그 까닭을 알린다. 그 밖엔 이 장만 건너뛴다.
          if (isStorageFull(e)) {
            full = e;
            break;
          }
        }
      }
      if (ok > 0) setAddedCount((c) => c + ok);
      if (full) {
        setError(uploadErrorMessage(full));
      } else if (ok < images.length) {
        setError(
          ok === 0
            ? "사진을 못 올렸어요. 잠시 후 다시 시도해 주세요."
            : `${images.length - ok}장은 못 올렸어요. 잠시 후 다시 시도해 주세요.`,
        );
      }
    } finally {
      setBusy(false);
      setProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function addFromUrl() {
    const u = urlInput.trim();
    if (!u || busy) return;
    setBusy(true);
    setError(null);
    const created = await onCreate(u);
    setBusy(false);
    if (created) {
      setUrlInput("");
      setAddedCount((c) => c + 1);
    } else {
      setError("사진을 못 올렸어요. 주소를 확인해 주세요.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="사진 추가"
      emoji="🖼️"
      footer={
        <Button variant="ghost" onClick={close} disabled={busy}>
          {addedCount > 0 ? `완료 (${addedCount}장 추가됨)` : "닫기"}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {/* 드롭존 */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            uploadFiles(Array.from(e.dataTransfer.files));
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragOver
              ? "border-primary bg-primary-soft/60"
              : "border-line-strong bg-sunken/40"
          )}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-ink-soft shadow-sm">
            {busy ? <Spinner className="h-6 w-6" /> : <UploadCloud className="h-6 w-6" />}
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">
              {busy ? (
                <>
                  올리는 중이에요…
                  {progress && progress.total > 1 && (
                    <span className="font-num">
                      {" "}
                      ({progress.done + 1}/{progress.total})
                    </span>
                  )}
                </>
              ) : (
                "여기로 사진을 끌어다 놓으세요"
              )}
            </p>
            <p className="mt-0.5 text-xs text-ink-faint">
              여러 장을 한 번에 올릴 수 있어요
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) =>
              e.target.files && uploadFiles(Array.from(e.target.files))
            }
          />
          <Button
            variant="soft"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            파일 선택
          </Button>
        </div>

        {/* 구분선 */}
        <div className="flex items-center gap-3 text-xs font-semibold text-ink-faint">
          <span className="h-px flex-1 bg-line" />
          또는 링크로
          <span className="h-px flex-1 bg-line" />
        </div>

        {/* URL 입력 */}
        <div className="flex gap-2">
          <Input
            placeholder="사진 주소 붙여넣기 (https://…)"
            aria-label="사진 주소"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addFromUrl()}
            className="flex-1"
          />
          <Button onClick={addFromUrl} disabled={!urlInput.trim() || busy}>
            추가
          </Button>
        </div>

        {error && <p className="text-sm text-danger-ink">{error}</p>}
      </div>
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   앨범 수정
   ───────────────────────────────────────────── */
function EditAlbumModal({
  open,
  album,
  busy: parentBusy,
  onClose,
  onSaved,
}: {
  open: boolean;
  album: Album;
  busy: boolean;
  onClose: () => void;
  onSaved: (updated: Album) => void;
}) {
  const [title, setTitle] = useState(album.title);
  const [description, setDescription] = useState(album.description ?? "");
  const [emoji, setEmoji] = useState(album.emoji);
  const [color, setColor] = useState<PaletteKey>(album.color as PaletteKey);
  const [takenOn, setTakenOn] = useState(toDateInput(album.takenOn));
  const [busy, setBusy] = useState(false);

  // 모달을 열 때마다 현재 앨범 값으로 초기화
  // 모달을 열 때마다 **지금 앨범 값**으로 되돌린다(고치다 닫은 흔적이 남지 않게).
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle(album.title);
      setDescription(album.description ?? "");
      setEmoji(album.emoji);
      setColor(album.color as PaletteKey);
      setTakenOn(toDateInput(album.takenOn));
    }
  }, [open, album]);

  async function save() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/albums/${album.id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          title,
          description,
          emoji,
          color,
          takenOn: takenOn || null,
        }),
      });
      if (res.ok) {
        const updated: Album = await res.json();
        onSaved(updated);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title="앨범 수정"
      emoji={emoji || "📸"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy || parentBusy}>
            취소
          </Button>
          <Button onClick={save} disabled={!title.trim() || busy}>
            저장
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="앨범 이름">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </Field>

        <Field label="설명">
          <Textarea
            placeholder="어떤 추억인가요?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <div className="flex gap-3">
          <Field label="이모지" className="w-24">
            <Input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={4}
              className="text-center text-xl"
            />
          </Field>
          <Field label="촬영 날짜" className="flex-1">
            <Input
              type="date"
              value={takenOn}
              onChange={(e) => setTakenOn(e.target.value)}
            />
          </Field>
        </div>

        <Field label="색">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
      </div>
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   라이트박스 (원본 크게 · 캡션 · 커버지정 · 삭제)
   ───────────────────────────────────────────── */
function Lightbox({
  photos,
  index,
  coverUrl,
  emoji,
  title,
  onClose,
  onPrev,
  onNext,
  onDelete,
  onSetCover,
  onCaptionSaved,
}: {
  photos: Photo[];
  index: number | null;
  coverUrl: string | null;
  emoji: string;
  title: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDelete: (id: string) => void;
  onSetCover: (url: string) => void;
  onCaptionSaved: (id: string, caption: string | null) => void;
}) {
  const photo = index !== null ? photos[index] : null;
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // 다른 사진으로 넘어가면 캡션 칸도 그 사진 것으로 바꾼다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCaption(photo?.caption ?? "");
  }, [photo?.id, photo?.caption]);

  if (index === null || !photo) return null;

  const isCover = coverUrl === photo.url;
  const dirty = caption.trim() !== (photo.caption ?? "");

  async function saveCaption() {
    if (!photo || saving || !dirty) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/photos/${photo.id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ caption: caption.trim() }),
      });
      if (res.ok) {
        const updated: Photo = await res.json();
        onCaptionSaved(photo.id, updated.caption);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={index !== null}
      onClose={onClose}
      title={title}
      emoji={emoji}
      size="lg"
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onSetCover(photo.url)}
            disabled={isCover}
          >
            <Star className={cn("h-4 w-4", isCover && "fill-current")} />
            {isCover ? "커버 사진" : "커버로 설정"}
          </Button>
          <Button variant="danger" onClick={() => onDelete(photo.id)}>
            <Trash2 className="h-4 w-4" /> 삭제
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="relative flex items-center justify-center overflow-hidden rounded-md bg-sunken">
          <PhotoImg
            src={photo.url}
            alt={photo.caption ?? "사진"}
            maxWidth={632}
            sizes={LIGHTBOX_SIZES}
            className="mx-auto max-h-[58dvh] w-auto max-w-full"
          />
          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={onPrev}
                aria-label="이전 사진"
                className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface/85 text-ink shadow-sm backdrop-blur-sm transition hover:bg-surface"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={onNext}
                aria-label="다음 사진"
                className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface/85 text-ink shadow-sm backdrop-blur-sm transition hover:bg-surface"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
          <span className="font-num absolute bottom-2 right-2 rounded-full bg-ink/55 px-2.5 py-1 text-xs font-semibold text-white">
            {index + 1} / {photos.length}
          </span>
        </div>

        {/* 화면에는 줄인 사진이 뜬다. 저장된 원본(폰으로 찍은 그대로)은 여기서 연다. */}
        <div className="-mt-2 flex justify-end">
          <Button
            href={photo.url}
            target="_blank"
            rel="noopener noreferrer"
            prefetch={false}
            variant="ghost"
            size="sm"
          >
            <ExternalLink className="h-4 w-4" /> 원본 보기
          </Button>
        </div>

        <Field label="캡션">
          <div className="flex gap-2">
            <Input
              placeholder="이 순간을 한 줄로 남겨보세요"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveCaption()}
              className="flex-1"
            />
            <Button variant="soft" onClick={saveCaption} disabled={!dirty || saving}>
              저장
            </Button>
          </div>
        </Field>
      </div>
    </Modal>
  );
}
