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
 * 파일 하나를 지운다. 실패해도 던지지 않는다 — DB 행은 이미 사라진 뒤라,
 * 파일 정리가 안 됐다고 사용자에게 오류를 보일 이유가 없다.
 */
export async function removeUpload(url: string | null | undefined): Promise<void> {
  const kind = uploadKind(url);
  if (kind === "external" || !url) return;

  try {
    if (kind === "blob") {
      if (!process.env.BLOB_READ_WRITE_TOKEN) return;
      const { del } = await import("@vercel/blob");
      await del(url);
      return;
    }
    const name = safeBasename(url);
    if (!name) return;
    await unlink(path.join(process.cwd(), "public", "uploads", name));
  } catch {
    // 이미 없거나 권한이 없을 수 있다. 조용히 넘어간다.
  }
}

/** 여러 개를 한꺼번에. 하나가 실패해도 나머지는 계속한다. */
export async function removeUploads(urls: (string | null | undefined)[]): Promise<void> {
  await Promise.all(urls.map((u) => removeUpload(u)));
}
