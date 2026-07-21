import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { put } from "@vercel/blob";

export const runtime = "nodejs";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/heic": ".heic",
  "image/svg+xml": ".svg",
};

function extFor(file: File): string {
  const fromName = path.extname(file.name || "").toLowerCase();
  if (fromName) return fromName;
  return EXT_BY_TYPE[file.type] || ".jpg";
}

// 프로덕션(Vercel): Blob 토큰이 있으면 클라우드 저장. 로컬: public/uploads.
const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export async function POST(req: NextRequest) {
  const form = await req.formData();

  // "files"(복수) + "file"(단수) 모두 허용
  const entries = [...form.getAll("files"), ...form.getAll("file")];
  const files = entries.filter((e): e is File => e instanceof File && e.size > 0);

  if (files.length === 0) {
    return NextResponse.json({ error: "올릴 사진이 없어요." }, { status: 400 });
  }

  const urls: string[] = [];

  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const filename = `${randomUUID()}${extFor(file)}`;

    if (useBlob()) {
      // ── 클라우드(Vercel Blob) 저장 ──
      const blob = await put(`uploads/${filename}`, file, {
        access: "public",
        contentType: file.type,
      });
      urls.push(blob.url);
    } else {
      // ── 로컬 파일 저장 (개발용) ──
      const bytes = Buffer.from(await file.arrayBuffer());
      const dir = path.join(process.cwd(), "public", "uploads");
      await writeFile(path.join(dir, filename), bytes);
      urls.push(`/uploads/${filename}`);
    }
  }

  if (urls.length === 0) {
    return NextResponse.json({ error: "이미지 파일만 올릴 수 있어요." }, { status: 400 });
  }

  return NextResponse.json({ urls });
}
