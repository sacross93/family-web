// 올리려는 사진의 찍은 날 — 앨범에 사진을 더할 때 **올리기 전에** 원본 File 에서 읽는다.
//
// 왜 올리기 전인가: `uploadImage` 는 HEIC 를 브라우저가 읽을 수 있으면(사파리) JPEG 로 바꿔 올리는데,
// 캔버스로 다시 그린 JPEG 에는 EXIF 가 없다(`lib/upload-client.ts`). 원본에서 읽어야 아이폰 사진도 날짜가 남는다.
// 그리고 **어느 길로 올라가든**(로컬 `/api/upload`·운영 Blob 직접) 같은 값이 `/api/photos` 로 간다.
//
// 읽기만 한다 — File 은 손대지 않고 그대로 `uploadImage` 로 간다(원본 저장 규칙, AGENTS.md).

import { EXIF_DATE_OPTIONS, takenDayFromExif } from "@/lib/photo-date";

/** "yyyy-MM-dd" 또는 null(날짜 정보가 없거나 못 읽음). 던지지 않는다 — 날짜 때문에 사진을 못 올리면 안 된다. */
export async function readTakenDay(file: File): Promise<string | null> {
  try {
    // exifr 는 사진을 올릴 때만 받는다(lite, gzip 12KB). 앨범 화면을 여는 것만으로는 싣지 않는다.
    const { default: exifr } = await import("exifr/dist/lite.esm.mjs");
    // File 을 그대로 준다 — exifr 가 필요한 앞부분만 조각으로 읽는다(수 MB 를 통째로 메모리에 올리지 않는다).
    return takenDayFromExif(await exifr.parse(file, EXIF_DATE_OPTIONS));
  } catch {
    return null;
  }
}
