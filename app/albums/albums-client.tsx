"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Images } from "lucide-react";
import {
  PageHeader,
  Card,
  Button,
  EmptyState,
  Modal,
  Field,
  Input,
  Textarea,
  ColorPicker,
  useToast,
} from "@/components/ui";
import { palette, type PaletteKey } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { kDateShort } from "@/lib/date";
import type { AlbumWithCount } from "@/lib/types";

const JSON_HEADERS = { "Content-Type": "application/json" };

export function AlbumsClient({
  initialAlbums,
}: {
  initialAlbums: AlbumWithCount[];
}) {
  const { say } = useToast();
  const [albums, setAlbums] = useState<AlbumWithCount[]>(initialAlbums);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);

  // 새 앨범 폼
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("📸");
  const [color, setColor] = useState<PaletteKey>("peach");
  const [takenOn, setTakenOn] = useState("");

  function resetForm() {
    setTitle("");
    setDescription("");
    setEmoji("📸");
    setColor("peach");
    setTakenOn("");
  }

  function closeCreate() {
    if (busy) return;
    setShowCreate(false);
    resetForm();
  }

  async function createAlbum() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/albums", {
        method: "POST",
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
        const created: AlbumWithCount = await res.json();
        setAlbums((prev) => [created, ...prev]);
        setShowCreate(false);
        resetForm();
      }
    } catch {
      // 네트워크가 끊기면 fetch 는 거부된다 — catch 가 없으면 조용히 사라진다.
      say("앨범을 못 만들었어요. 연결을 확인해 주세요.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        emoji="📸"
        title="사진첩"
        description="테마별로 모아 보는 우리 가족의 추억"
        summary={albums.length > 0 ? `앨범 ${albums.length}개` : undefined}
      >
        {/* 목록이 비면 아래 빈 화면의 초대가 같은 일을 한다 — 같은 버튼을 한 화면에
            두 번 두지 않는다(DESIGN.md §1 "화면당 강조는 하나만"). */}
        {albums.length > 0 && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> 새 앨범
          </Button>
        )}
      </PageHeader>

      {albums.length === 0 ? (
        <EmptyState
          emoji="📸"
          title="아직 앨범이 없어요"
          description="첫 추억을 담아볼까요?"
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> 새 앨범 만들기
            </Button>
          }
        />
      ) : (
        /* 폰에서도 두 칸. 한 칸이면 앨범 하나가 420px 이라 세 개만 있어도 세 화면이다 —
           사진첩은 훑는 화면이지 읽는 화면이 아니다. */
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {albums.map((album) => {
            const pal = palette(album.color);
            return (
              <Link
                key={album.id}
                href={`/albums/${album.id}`}
                className="group block animate-fade-up"
              >
                <Card interactive flush className="h-full overflow-hidden">
                  {/* 커버 */}
                  <div
                    className={cn(
                      "relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-gradient-to-br",
                      pal.gradient
                    )}
                  >
                    {album.coverUrl ? (
                      <img
                        src={album.coverUrl}
                        alt={album.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-5xl transition-transform duration-500 group-hover:scale-110">
                        {album.emoji}
                      </span>
                    )}
                    <span className="font-num absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-surface/90 px-2.5 py-1 text-xs font-semibold text-ink shadow-sm backdrop-blur-sm">
                      <Images className="h-3.5 w-3.5" />
                      {album._count.photos}
                    </span>
                  </div>

                  {/* 정보 — 색 이름표("라벤더")를 뗐다. 색은 분류를 뜻해야 하는데
                      여기서는 **색 이름 그 자체**가 적혀 있어 아무것도 알려주지 않았다. */}
                  <div className="flex flex-col gap-0.5 p-3">
                    <h3 className="truncate font-semibold text-ink">{album.title}</h3>
                    <p className="truncate text-xs text-ink-faint">
                      {album.takenOn ? kDateShort(album.takenOn) : album.description}
                    </p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* 새 앨범 만들기 */}
      <Modal
        open={showCreate}
        onClose={closeCreate}
        title="새 앨범"
        emoji={emoji || "📸"}
        footer={
          <>
            <Button variant="ghost" onClick={closeCreate} disabled={busy}>
              취소
            </Button>
            <Button onClick={createAlbum} disabled={!title.trim() || busy}>
              만들기
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="앨범 이름">
            <Input
              placeholder="예: 발리 가족여행"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createAlbum()}
              autoFocus
            />
          </Field>

          <Field label="설명" hint="한 줄로 이 앨범을 소개해 주세요.">
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
    </div>
  );
}
