import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { put } from "@vercel/blob";
import { extFor } from "@/lib/upload-kinds";
import { STORAGE_FULL_BODY, STORAGE_FULL_STATUS, admitUpload } from "@/lib/upload-guard";

export const runtime = "nodejs";
// GET 은 환경변수를 읽는다 — 빌드 때 한 번 찍어 두면 토큰을 나중에 넣어도 모른다.
export const dynamic = "force-dynamic";

// 프로덕션(Vercel): Blob 토큰이 있으면 클라우드 저장. 로컬: public/uploads.
// 이름을 `useBlob` 으로 두면 안 된다 — `use` 로 시작하면 eslint 가 **리액트 훅으로 보고**
// "훅을 async 함수 안에서 부를 수 없다" 같은 **헛된 오류 두 개**를 낸다. 여긴 API 라우트고
// 이건 그냥 환경변수를 보는 함수다. 헛된 오류는 진짜 오류를 묻는다.
const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

// ─────────────────────────────────────────────────────────────
// 화면은 이 라우트를 직접 부르지 않는다 — `lib/upload-client.ts` 를 거친다.
//
// 운영에서는 **사진이 이 함수를 지나가지 않는다.** Vercel 함수가 받는 본문은 4.5MB 가 끝이고
// (넘으면 413, 설정으로 못 바꾼다) 폰 원본은 3~12MB 다. 그래서 운영은 브라우저가 Blob 에 바로
// 올리고(`/api/upload/token` 이 표만 내준다), 이 POST 는 로컬(public/uploads)용으로 남는다.
// 어느 길로 갈지는 화면이 GET 으로 묻는다 — 읽기라서 `ui:audit` 의 "로그인 말고 쓰기 0" 을 안 깬다.
// ─────────────────────────────────────────────────────────────

/** `{ direct: true }` = 브라우저가 Blob 에 바로 올린다(운영). false = 이 POST 로 한 장씩(로컬). */
export async function GET() {
  return NextResponse.json({ direct: blobConfigured() });
}

export async function POST(req: NextRequest) {
  const form = await req.formData();

  // "files"(복수) + "file"(단수) 모두 허용
  const entries = [...form.getAll("files"), ...form.getAll("file")];
  const files = entries.filter((e): e is File => e instanceof File && e.size > 0);

  if (files.length === 0) {
    return NextResponse.json({ error: "올릴 사진이 없어요." }, { status: 400 });
  }

  const images = files.filter((f) => f.type.startsWith("image/"));

  // 저장 공간 문지기(lib/upload-guard.ts) — 직접 올리기 표와 같은 판단. 여기서는 실제 크기를 안다.
  const total = images.reduce((sum, f) => sum + f.size, 0);
  if (images.length > 0 && !(await admitUpload(total, images.length)).ok) {
    return NextResponse.json(STORAGE_FULL_BODY, { status: STORAGE_FULL_STATUS });
  }

  const urls: string[] = [];

  for (const file of images) {
    const filename = `${randomUUID()}${extFor(file.name, file.type)}`;

    if (blobConfigured()) {
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
