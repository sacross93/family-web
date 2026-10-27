// 사진의 "찍은 날" — EXIF 에서 읽어 `Photo.takenAt` 에 **날짜만** 적는다.
//
// 순수 함수만 둔다(브라우저·서버 둘 다 쓴다). 파일을 읽는 쪽은 `photo-date-client.ts`(올릴 때)와
// `photo-date-server.ts`(관리자 [찍은 날짜 채우기]) 둘이고, 둘 다 같은 옵션·같은 해석을 여기서 가져간다.
//
// **시간대를 한 번도 거치지 않는다.** EXIF 의 시각은 "찍은 곳의 벽시계" 이고 시간대가 없다.
// exifr 의 기본값(`reviveValues`)은 그것을 **읽는 기계의 시간대**로 Date 를 만든다 — 같은 사진이
// 서울 폰에서는 0시 30분, UTC 서버에서는 전날 15시 30분이 된다. 그래서 가공 안 한 글자
// ("2024:03:02 00:30:00")를 받아 앞의 날짜만 잘라 "2024-03-02" 로 보낸다. 서버는 그것을
// `parseDateInput` 으로 **서버 로컬 자정**에 놓는다(`fromDateInput` 과 같은 규칙 — 기념일·할일과 같다).

/**
 * exifr 에 넘기는 옵션. 클라이언트·서버가 같은 것을 쓴다.
 *
 * - 전역 `pick` 은 쓰지 않는다 — lite 빌드에서 `undefined is not iterable` 로 던진다(실측, 7.1.3).
 *   대신 EXIF 묶음 안에서만 고른다. IFD0 은 끌 수 없다(EXIF 묶음으로 가는 길이 거기 있다) — 그 태그들도
 *   같이 오지만 안 쓴다.
 * - `reviveValues: false` — 위의 시간대 문제. 날짜를 글자 그대로 받는다.
 * - 수정한 날(IFD0 `ModifyDate`)은 쓰지 않는다. "찍음" 이라고 보여 줄 날짜인데, 그건 파일을
 *   마지막으로 고친 날이다(편집 앱으로 내보낸 날·스캔한 날).
 * - `as const` 를 붙이지 않는다 — exifr 의 타입이 고칠 수 있는 배열을 받는다.
 */
export const EXIF_DATE_OPTIONS = {
  ifd1: false,
  gps: false,
  interop: false,
  xmp: false,
  exif: { pick: ["DateTimeOriginal", "CreateDate"] },
  reviveValues: false,
};

/**
 * EXIF 날짜 글자 → "yyyy-MM-dd". 못 믿을 값이면 null.
 *
 * 걸러내는 것: 빈 값·"0000:00:00 00:00:00"(시계를 안 맞춘 카메라가 쓴다)·없는 날짜(2월 30일)·
 * 1900년 전·**내일보다 뒤**(시계가 틀린 카메라 — "찍음" 으로 보여 줄 수 없다). 하루 여유는
 * 찍은 곳이 서울보다 시간이 앞선 곳일 수 있어서다.
 */
export function exifDay(raw: unknown, today: Date = new Date()): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || mo < 1 || mo > 12 || d < 1) return null;
  // 달력에 있는 날인가 — 2월 30일은 3월 2일로 넘어가 버린다.
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  const tomorrow = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (check.getTime() > tomorrow) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** exifr 결과 → 찍은 날. 찍은 순간(`DateTimeOriginal`) → 디지털로 기록한 순간(`CreateDate`). 없으면 null. */
export function takenDayFromExif(tags: unknown, today: Date = new Date()): string | null {
  if (!tags || typeof tags !== "object") return null;
  const t = tags as Record<string, unknown>;
  return exifDay(t.DateTimeOriginal, today) ?? exifDay(t.CreateDate, today);
}

/**
 * HEIF/HEIC/AVIF 인가(파일 첫 바이트의 `ftyp` 상자). JPEG 와 달리 EXIF 가 파일 앞에 있다는 보장이 없어서,
 * 서버가 앞부분만 읽고 못 찾으면 이 경우에만 더 읽는다.
 */
export function isHeifLike(head: Uint8Array): boolean {
  if (head.length < 12) return false;
  const box = String.fromCharCode(head[4], head[5], head[6], head[7]);
  if (box !== "ftyp") return false;
  const brand = String.fromCharCode(head[8], head[9], head[10], head[11]);
  return /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|avif|avis)$/.test(brand);
}

/** "2024년 3월 2일 찍음" — 사진 보기의 작은 한 줄. */
export function takenLabel(d: Date | string): string {
  const date = new Date(d);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 찍음`;
}
