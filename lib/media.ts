// 메모 콘텐츠에서 유튜브/이미지 추출 헬퍼

const YT_SOURCE =
  "(?:youtube\\.com\\/(?:watch\\?v=|embed\\/|shorts\\/|live\\/)|youtu\\.be\\/)([A-Za-z0-9_-]{11})";

/** 텍스트에서 유튜브 영상 ID들 (중복 제거) */
export function youtubeIds(text: string): string[] {
  const re = new RegExp(YT_SOURCE, "g");
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) ids.add(m[1]);
  return [...ids];
}

/** 마크다운 속 첫 이미지 URL */
export function firstImageUrl(text: string): string | null {
  const m = text.match(/!\[[^\]]*\]\(([^)\s]+)/);
  return m ? m[1] : null;
}

/** 미리보기용: 마크다운 기호 제거한 순수 텍스트 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // 이미지
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // 링크 → 텍스트
    .replace(/^[#>\-*\s]+/gm, "") // 줄머리 기호
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
