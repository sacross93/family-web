// 사용자가 입력한 사이트 주소를 다루는 헬퍼. (참고 사이트 카드 — /baby)

/** 스킴이 이미 붙어 있는지 (예: "https:", "javascript:", "ftp:") */
const HAS_SCHEME = /^[a-z][a-z0-9+-]*:/i;

/** 사용자 입력 주소를 안전한 http(s) URL 문자열로 정규화. 못 쓰는 값이면 null. */
export function normalizeUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw) return null;

  const candidate = HAS_SCHEME.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!parsed.hostname) return null;
  return parsed.toString();
}

/** 표시용 도메인. "https://www.a.co.kr/x?y=1" → "a.co.kr" */
export function displayDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
