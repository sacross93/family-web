import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCurrentUser } from "@/lib/current-user";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, isUploadPath } from "@/lib/upload-kinds";
import { parseDeclaredSize } from "@/lib/blob-budget";
import { STORAGE_FULL_BODY, STORAGE_FULL_STATUS, admitUpload } from "@/lib/upload-guard";

export const runtime = "nodejs";

// 운영에서 사진을 **브라우저가 Blob 에 바로** 올릴 수 있게 짧은 표(client token)를 내준다.
//
// 왜: Vercel 함수가 받는 본문은 4.5MB 가 끝이다(넘으면 413, 설정으로 못 바꾼다). 앨범·스티커는
// 원본 그대로 저장하기로 했고 폰 원본은 3~12MB 라 `/api/upload` POST 로는 운영에서 못 올린다.
// 그래서 사진은 함수를 거치지 않고, 이 라우트는 "이 경로에 이 형식으로 올려도 된다" 는 표만 쓴다.
//
// **`onUploadCompleted` 를 일부러 두지 않는다.** 두면 올리기가 끝났을 때 Vercel 이 이 라우트를
// **다시 부르는데**, 그 요청에는 가족의 로그인 쿠키가 없어 `proxy.ts` 가 401 로 막는다(그렇다고
// 이 경로를 로그인 없이 열 이유도 없다). 대신 화면이 지금까지처럼 주소를 받아 `/api/photos`·
// `/api/decorations` 에 직접 적는다 — 로컬과 운영이 같은 흐름이다.
//
// 표에 넣는 조건: 로그인한 가족만 · 경로는 `uploads/<uuid><확장자>` 만(무작위 꼬리 없이 — 그 모양에
// 기대는 곳이 셋 있다, `lib/upload-kinds.ts`) · 형식은 로컬 라우트와 같게 · 한 장 50MB 까지 ·
// **저장 공간이 막는 선(90%) 안에서만**(넘으면 507 STORAGE_FULL — 브라우저는 clientPayload 로 크기를 알려 준다).

const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export async function POST(request: Request): Promise<NextResponse> {
  // 토큰이 없으면(로컬) 이 길은 없다. handleUpload 는 토큰부터 찾고 던지므로 여기서 먼저 본다.
  if (!blobConfigured()) {
    return NextResponse.json({ error: "직접 올리기를 쓰지 않는 곳이에요." }, { status: 404 });
  }

  // 로그인한 가족만. proxy.ts 가 이미 막지만, 표를 내주는 자리라 한 번 더 본다.
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "요청을 읽지 못했어요." }, { status: 400 });
  }
  // 우리는 표 발급만 한다(완료 알림은 받지 않는다 — 위 설명).
  if (body?.type !== "blob.generate-client-token") {
    return NextResponse.json({ error: "요청을 읽지 못했어요." }, { status: 400 });
  }

  const pathname = body.payload?.pathname;
  if (typeof pathname !== "string" || !isUploadPath(pathname)) {
    return NextResponse.json({ error: "사진을 올릴 수 없어요." }, { status: 400 });
  }

  // 저장 공간 문지기(lib/upload-guard.ts) — Hobby 한도를 넘으면 저장소 전체가 멈춘다.
  // 크기는 브라우저가 알려 준 값이라 믿지 않는다: 표의 maximumSizeInBytes(= 남은 양까지)를 Blob 이 지킨다.
  const admission = await admitUpload(parseDeclaredSize(body.payload?.clientPayload));
  if (!admission.ok) {
    return NextResponse.json(STORAGE_FULL_BODY, { status: STORAGE_FULL_STATUS });
  }

  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (p) => {
        if (p !== pathname) throw new Error("bad pathname");
        return {
          allowedContentTypes: [...ALLOWED_UPLOAD_TYPES],
          maximumSizeInBytes: Math.min(MAX_UPLOAD_BYTES, admission.maximumSizeInBytes),
          addRandomSuffix: false,
        };
      },
    });
    return NextResponse.json(result);
  } catch {
    // 까닭은 싣지 않는다 — 토큰·경로 같은 것이 오류 문구로 새지 않게.
    return NextResponse.json({ error: "사진을 올릴 수 없어요." }, { status: 400 });
  }
}
