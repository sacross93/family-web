// 읽어 온 글을 한 턴에 들어갈 크기로 줄인다. **줄였다는 사실을 숨기지 않는 것이 이 파일의 전부다.**
//
// 실측(2026-09-20): namu.wiki 한 문서가 43,270자였고 상한은 3,000자다. 8%도 안 되는 양을
// `…` 하나 붙여 넘기면, 모델은 그게 전부인 줄 알고 "문서에는 그런 내용이 없다"고 답한다.
// 이 저장소가 네 번 잡은 실수와 같은 종류다 — 확인 안 된 것을 확인한 것처럼 보여주지 않는다.

/** 잘라낸 결과. `text` 에는 이미 꼬리표가 붙어 있다. */
export interface Budgeted {
  text: string;
  /** 원본 글자 수. 안 잘렸으면 text 길이와 같다. */
  original: number;
  truncated: boolean;
}

/** 잘린 글 뒤에 붙는 꼬리표. 몇 분의 몇을 봤는지 숫자로 말한다. */
export function truncationNote(kept: number, original: number): string {
  const percent = Math.max(1, Math.round((kept / original) * 100));
  return `\n\n…(글이 길어 여기까지만 읽었습니다. 전체 ${original.toLocaleString("ko-KR")}자 중 앞부분 ${kept.toLocaleString("ko-KR")}자, 약 ${percent}%입니다.)`;
}

/** 문장이 끊기지 않게 자를 자리를 찾는다. 뒤에서 이만큼 안쪽까지만 되돌아본다. */
const LOOKBACK = 300;

/** 글을 상한에 맞춰 줄인다. 자를 때는 문장 끝을 찾아 자르고, 잘랐으면 꼬리표를 붙인다. */
export function budget(text: string, maxChars: number): Budgeted {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  const original = clean.length;
  if (original <= maxChars || maxChars <= 0) {
    return { text: clean, original, truncated: false };
  }

  const head = clean.slice(0, maxChars);
  // 문장 끝(., !, ?, 。, 다./요.) 이나 줄바꿈에서 끊는다. 없으면 그냥 자른다.
  const cut = Math.max(
    head.lastIndexOf("\n"),
    head.lastIndexOf(". "),
    head.lastIndexOf("다. "),
    head.lastIndexOf("요. "),
    head.lastIndexOf("! "),
    head.lastIndexOf("? "),
    head.lastIndexOf("。")
  );
  const kept = cut > maxChars - LOOKBACK ? head.slice(0, cut + 1).trimEnd() : head.trimEnd();

  return { text: kept + truncationNote(kept.length, original), original, truncated: true };
}

/**
 * 계단에서 고른 칸들을 하나의 글로 엮는다.
 *
 * 순서가 중요하다 — 모델이 위에서부터 읽는다. 제목·설명이 먼저 오고 본문이 뒤에 온다.
 * 본문이 잘려도 제목과 설명은 온전히 남는다.
 */
export function composeRead(parts: {
  title: string;
  description: string;
  siteName: string;
  /** 본문(또는 블롭에서 건진 글). 이것만 예산에 걸린다. */
  body: string;
  /** 본문을 어디서 건졌는지. 블롭에서 건졌으면 그렇다고 말한다. */
  bodySource: "본문" | "블롭" | "요약정보";
  maxChars: number;
}): { text: string; truncated: boolean; original: number } {
  const head: string[] = [];
  if (parts.title) head.push(`제목: ${parts.title}`);
  if (parts.siteName) head.push(`사이트: ${parts.siteName}`);
  if (parts.description) head.push(`설명: ${parts.description}`);

  if (!parts.body) {
    return { text: head.join("\n"), truncated: false, original: 0 };
  }

  // 블롭에서 건진 글은 화면에 보이는 순서대로가 아니다. 그 사실을 적어 둔다 —
  // 안 적으면 모델이 뒤죽박죽인 조각을 "글의 흐름"으로 읽는다.
  if (parts.bodySource === "블롭") {
    head.push("(아래 내용은 페이지에 보이는 글이 아니라 페이지가 실어 보낸 데이터에서 건진 것이라, 순서가 뒤섞여 있을 수 있습니다.)");
  }

  const b = budget(parts.body, parts.maxChars);
  return { text: [...head, "", b.text].join("\n"), truncated: b.truncated, original: b.original };
}
