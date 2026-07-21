import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

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

export async function POST(req: NextRequest) {
  const form = await req.formData();

  // "files"(복수) + "file"(단수) 모두 허용
  const entries = [...form.getAll("files"), ...form.getAll("file")];
  const files = entries.filter((e): e is File => e instanceof File && e.size > 0);

  if (files.length === 0) {
    return NextResponse.json({ error: "올릴 사진이 없어요." }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "public", "uploads");
  const urls: string[] = [];

  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const bytes = Buffer.from(await file.arrayBuffer());
    const filename = `${randomUUID()}${extFor(file)}`;
    await writeFile(path.join(dir, filename), bytes);
    urls.push(`/uploads/${filename}`);
  }

  if (urls.length === 0) {
    return NextResponse.json({ error: "이미지 파일만 올릴 수 있어요." }, { status: 400 });
  }

  return NextResponse.json({ urls });
}
