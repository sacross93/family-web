import path from "path";
import { unlink } from "fs/promises";

/**
 * 올린 파일 지우기.
 *
 * 사진을 지우면 DB 행만 사라지고 **파일은 남아 있었다**. 배포에서는 그게
 *   - 무료 용량(Vercel Blob)을 계속 먹고,
 *   - 주소를 아는 사람은 "지운" 가족 사진을 그대로 볼 수 있다는 뜻이다.
 * 버튼이 "삭제" 라고 말했으면 지워져야 한다.
 *
 * 다만 **우리가 저장한 것만** 지운다. 사진은 주소를 붙여넣어 담을 수도 있어서,
 * 남의 사이트 주소를 지우려 들면 안 된다.
 */

/** 이 주소가 우리가 저장한 파일인가. 아니면 바깥 주소(붙여넣은 것)다. */
export type UploadKind = "local" | "blob" | "external";

export function uploadKind(url: string | null | undefined): UploadKind {
  if (!url) return "external";
  // 로컬 개발: /uploads/<파일명>
  if (url.startsWith("/uploads/")) return "local";
  // Vercel Blob: https://<id>.public.blob.vercel-storage.com/uploads/<파일명>
  try {
    const u = new URL(url);
    if (u.hostname.endsWith(".blob.vercel-storage.com")) return "blob";
  } catch {
    // 주소로 못 읽히면 우리 것이 아니다
  }
  return "external";
}

/**
 * `/uploads/abc.png` → `abc.png`. 경로를 벗어나려는 이름은 거른다.
 * (DB 값이라 믿을 만하지만, 파일을 지우는 자리라 한 번 더 막는다.)
 */
export function safeBasename(url: string): string | null {
  const clean = url.split("?")[0];
  const name = path.basename(clean);
  if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\")) return null;
  // 끝이 슬래시면 basename 이 **폴더 이름**을 돌려준다("/uploads/" → "uploads").
  // 파일 이름이 실제로 주소 끝에 붙어 있을 때만 받는다.
  if (!clean.endsWith("/" + name)) return null;
  return name;
}

/**
 * 파일 하나를 지운다. **지워졌는지(또는 지울 게 없었는지)** 를 돌려준다.
 *
 * 호출하는 쪽은 이 결과를 보고 DB 행을 지운다 — 순서가 중요하다.
 * 행을 먼저 지우면 파일 삭제가 실패했을 때 **어느 파일이었는지조차 모르는 고아**가
 * 남는다. 그게 바로 고치려던 상태다. 파일부터 지우고, 실패하면 행을 그대로 둔다.
 * 사용자는 "못 지웠어요" 를 보고 다시 누르면 된다.
 */
export async function removeUpload(url: string | null | undefined): Promise<boolean> {
  const kind = uploadKind(url);
  if (kind === "external" || !url) return true; // 지울 게 없다

  try {
    if (kind === "blob") {
      // 배포에는 토큰이 있다(없으면 애초에 blob 주소가 생기지 않는다).
      // 그래도 없다면 지울 방법이 없으니 성공했다고 하지 않는다.
      if (!process.env.BLOB_READ_WRITE_TOKEN) return false;
      const { del } = await import("@vercel/blob");
      await del(url);
      return true;
    }
    const name = safeBasename(url);
    if (!name) return true; // 우리 규칙의 주소가 아니다 — 지울 것도 없다
    await unlink(path.join(process.cwd(), "public", "uploads", name));
    return true;
  } catch (e) {
    // 이미 없으면 지워진 것과 같다.
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return true;
    return false;
  }
}

/** 여러 개를 한꺼번에. 하나라도 못 지우면 false. 같은 주소는 한 번만 부른다. */
export async function removeUploads(urls: (string | null | undefined)[]): Promise<boolean> {
  // 앨범 표지가 그 앨범의 첫 사진인 경우가 흔하다 — 같은 주소를 두 번 지우려 들지 않게.
  const unique = [...new Set(urls.filter(Boolean) as string[])];
  const results = await Promise.all(unique.map((u) => removeUpload(u)));
  return results.every(Boolean);
}

// ─────────────────────────────────────────────────────────────
// 마크다운 본문 속 사진
//
// 게시판 쪽지·아기 기록·계획 설명에는 글 안에 사진을 넣을 수 있다(MarkdownEditor).
// 그 사진들은 앨범에 매이지 않아, 글을 지워도 파일이 그대로 남아 있었다.
// 아기 교환일기에 올린 사진이 그렇다는 건, 지운 뒤에도 주소만 알면 볼 수 있다는 뜻이다.
//
// 여기는 **행을 먼저 지우고** 파일을 훑는다(사진·앨범과 반대다).
//   - 같은 사진이 다른 글에도 붙어 있을 수 있어, "아직 쓰이는가" 를 물어봐야 한다.
//     행을 먼저 지우면 그 물음이 그냥 "DB 어디든 이 주소가 있나" 가 되어 단순해진다.
//   - 글을 지우는 일을 파일 정리 실패로 막을 이유도 없다. 사진·앨범은 파일이 곧 내용이라
//     반대로 했지만, 여기서는 글이 본체다.
// ─────────────────────────────────────────────────────────────

/** `![설명](주소)` 와 `<img src="주소">` 에서 주소를 뽑는다. */
export function imageUrlsIn(markdown: string | null | undefined): string[] {
  if (!markdown) return [];
  const out: string[] = [];
  // ![alt](url "title")  — 괄호 안 첫 토큰만
  for (const m of markdown.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)>?[^)]*\)/g)) {
    out.push(m[1]);
  }
  for (const m of markdown.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    out.push(m[1]);
  }
  return [...new Set(out)];
}

/**
 * 이제 아무 데서도 쓰이지 않는 업로드 파일을 지운다.
 * **행을 지우거나 고친 뒤에** 부른다. 실패해도 던지지 않는다 — 글은 이미 정리됐다.
 */
export async function sweepUploads(urls: (string | null | undefined)[]): Promise<void> {
  const mine = [...new Set(urls.filter(Boolean) as string[])].filter(
    (u) => uploadKind(u) !== "external"
  );
  if (mine.length === 0) return;

  const { prisma } = await import("@/lib/prisma");
  await Promise.all(
    mine.map(async (url) => {
      try {
        // 글 안에 박힌 주소는 부분 일치로, 그 자체가 값인 곳은 정확히 본다.
        const [inBoard, inEntry, inPlan, inItem, asPhoto, asCover, asDeco, asSite] =
          await Promise.all([
            prisma.boardPost.count({ where: { content: { contains: url } } }),
            prisma.babyEntry.count({ where: { content: { contains: url } } }),
            prisma.plan.count({
              where: { OR: [{ description: { contains: url } }, { memo: { contains: url } }] },
            }),
            prisma.planItem.count({ where: { note: { contains: url } } }),
            prisma.photo.count({ where: { url } }),
            prisma.album.count({ where: { coverUrl: url } }),
            prisma.decoration.count({ where: { url } }),
            prisma.siteConfig.count({
              where: { OR: [{ brandImageUrl: url }, { heroImageUrl: url }] },
            }),
          ]);
        const used =
          inBoard + inEntry + inPlan + inItem + asPhoto + asCover + asDeco + asSite;
        if (used === 0) await removeUpload(url);
      } catch {
        // 확인에 실패하면 지우지 않는다 — 쓰이는 사진을 지우는 것보다 남기는 게 낫다.
      }
    })
  );
}
