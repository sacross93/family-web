// 이미 올린 사진의 찍은 날 — 관리자 [찍은 날짜 채우기](`/api/photos/taken-at`)가 쓴다. **서버 전용**(fs).
//
// 왜 서버에서 읽나: 운영 사진은 Blob 주소(남의 출처)다. 브라우저가 읽으려면 Blob 이 교차 출처 읽기와
// Range 요청을 허락해야 하는데, 그건 로컬에서 확인할 길이 없다(로컬 사진은 같은 출처 `/uploads/`).
// 서버의 fetch 에는 그런 벽이 없다.
//
// Blob 규칙(AGENTS.md): `list()`·조각 올리기는 쓰지 않는다. 여기서 하는 것은 공개 주소에 대한 **평범한 GET**
// 뿐이고, 그것도 **앞 128KB 만** 받는다 — JPEG 의 EXIF 는 파일 맨 앞(APP1)에 있다.

import path from "path";
import { open } from "fs/promises";
import exifr from "exifr/dist/lite.esm.mjs";
import { EXIF_DATE_OPTIONS, isHeifLike, takenDayFromExif } from "@/lib/photo-date";
import { safeBasename, uploadKind } from "@/lib/uploads";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-kinds";

/** 처음 읽는 양. JPEG 는 이 안에 EXIF 가 다 있다. */
export const HEAD_BYTES = 128 * 1024;

/**
 * 찍은 날이 비어 있고 **우리가 올린** 사진(로컬·Blob). 붙여넣은 남의 주소는 읽으러 가지 않는다 —
 * 남의 서버에 요청을 보내는 일이고, 우리 것이 아니니 찍은 날을 채울 까닭도 없다.
 * (`contains` 는 대강 거르는 것이고, 실제로 읽을지는 `uploadKind` 가 정한다.)
 */
export const MISSING_TAKEN_AT = {
  takenAt: null,
  OR: [{ url: { startsWith: "/uploads/" } }, { url: { contains: ".blob.vercel-storage.com/" } }],
};

export type TakenRead =
  | { kind: "found"; day: string }
  /** 읽었는데 날짜 정보가 없다(메신저로 받은 사진 등). */
  | { kind: "none" }
  /** 파일을 못 읽었다(없어졌거나 저장소가 대답 안 함) — 다시 누르면 또 해 본다. */
  | { kind: "failed" };

/** 로컬 파일의 앞 `max` 바이트. */
async function readFileStart(file: string, max: number): Promise<Uint8Array> {
  const fh = await open(file, "r");
  try {
    const size = (await fh.stat()).size;
    const buf = Buffer.alloc(Math.min(max, size));
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    return new Uint8Array(buf.buffer, buf.byteOffset, bytesRead);
  } finally {
    await fh.close();
  }
}

/**
 * 공개 주소의 앞 `max` 바이트. Range 를 보내지만 **믿지는 않는다** — 저장소가 무시하고 파일 전체(200)를
 * 주더라도 `max` 까지만 받고 끊는다. 그래야 폰 원본(수 MB)을 장마다 통째로 받지 않는다.
 */
async function fetchStart(url: string, max: number): Promise<Uint8Array | null> {
  const res = await fetch(url, {
    headers: { range: `bytes=0-${max - 1}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok || !res.body) return null;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < max) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      size += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const out = new Uint8Array(Math.min(size, max));
  let at = 0;
  for (const p of parts) {
    if (at >= out.length) break;
    const take = Math.min(p.byteLength, out.length - at);
    out.set(p.subarray(0, take), at);
    at += take;
  }
  return out;
}

async function dayIn(bytes: Uint8Array, today: Date): Promise<string | null> {
  try {
    return takenDayFromExif(await exifr.parse(bytes, EXIF_DATE_OPTIONS), today);
  } catch {
    return null; // 잘린 파일·모르는 형식 — 날짜 없음과 같다
  }
}

/** 저장된 사진 주소에서 찍은 날을 읽는다. 남의 주소는 "없음" 으로 돌려준다(읽으러 가지 않는다). */
export async function readTakenDayFromUrl(url: string, today: Date = new Date()): Promise<TakenRead> {
  const kind = uploadKind(url);
  let read: (max: number) => Promise<Uint8Array | null>;
  if (kind === "local") {
    const name = safeBasename(url);
    if (!name) return { kind: "none" };
    const file = path.join(process.cwd(), "public", "uploads", name);
    read = (max) => readFileStart(file, max);
  } else if (kind === "blob") {
    read = (max) => fetchStart(url, max);
  } else {
    return { kind: "none" };
  }

  const head = await read(HEAD_BYTES).catch(() => null);
  if (!head) return { kind: "failed" };
  const day = await dayIn(head, today);
  if (day) return { kind: "found", day };

  // HEIC 는 EXIF 가 앞쪽에 있다는 보장이 없다 — 앞부분에서 못 찾았을 때 **이 형식만** 끝까지 읽는다.
  // 드물다: 사파리에서 올린 HEIC 는 JPEG 로 바뀌어 올라갔고, 크롬·안드로이드에서 올린 HEIC 만 남아 있다.
  if (head.length >= HEAD_BYTES && isHeifLike(head)) {
    const whole = await read(MAX_UPLOAD_BYTES).catch(() => null);
    if (!whole) return { kind: "failed" };
    const later = await dayIn(whole, today);
    if (later) return { kind: "found", day: later };
  }
  return { kind: "none" };
}
