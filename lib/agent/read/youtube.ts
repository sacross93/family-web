// 유튜브 watch 페이지에서 읽을거리를 뽑는다. **순수 함수** — 네트워크는 부르는 쪽이 한다.
//
// ⚠️ 자막 본문은 **못 가져온다.** 실측(2026-09-20-web-reading-findings.md §2)에서 직접·fmt 변종·
// 옛 엔드포인트·InnerTube 4개 클라이언트·**진짜 크롬 안**·공개 프록시(Piped·Invidious)가
// 전부 HTTP 200 에 빈 몸통이었다. baseUrl 에 `pot`(PO 토큰)이 없어서고, 그걸 만들려면
// 유튜브의 BotGuard JS 를 돌려야 한다. **브라우저를 지어도 안 풀린다.**
//
// 그래서 설명과 챕터로 답하되, 자막을 읽지 못했다는 사실을 함께 돌려준다.
// 안 돌려주면 모델이 "영상을 봤다"는 투로 말한다.

/** 유튜브에서 건진 것. `hasCaptions` 는 "자막이 있다"는 뜻이지 "우리가 읽었다"는 뜻이 아니다. */
export interface YoutubeInfo {
  videoId: string;
  title: string;
  author: string;
  /** 초. 알 수 없으면 0. */
  lengthSeconds: number;
  viewCount: string;
  description: string;
  chapters: string[];
  /** 자막 트랙이 존재하는 언어들. 본문은 못 읽는다. */
  captionLanguages: string[];
}

/** 유튜브 주소인가. 맞으면 영상 id 를 돌려준다. */
export function youtubeId(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") return clean(u.pathname.slice(1));
  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "music.youtube.com") return null;

  if (u.pathname === "/watch") return clean(u.searchParams.get("v") ?? "");
  // /shorts/ID · /embed/ID · /live/ID 도 같은 영상이다
  const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/]+)/);
  return m ? clean(m[1]) : null;
}

/** 영상 id 는 11자의 [A-Za-z0-9_-] 다. 아니면 주소를 잘못 읽은 것이다. */
function clean(id: string): string | null {
  const v = id.trim();
  return /^[A-Za-z0-9_-]{11}$/.test(v) ? v : null;
}

/** watch 페이지에 박혀 있는 JS 객체 하나를 떼어 온다. 중괄호 짝을 세어 끝을 찾는다. */
function sliceObject(html: string, marker: RegExp): unknown {
  const at = html.search(marker);
  if (at < 0) return null;
  const start = html.indexOf("{", at);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === "\\") {
      if (inString) escaped = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function get(o: unknown, ...path: string[]): unknown {
  let cur: unknown = o;
  for (const k of path) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/**
 * 챕터 제목들. `ytInitialData` 안에 `chapterRenderer` 로 들어 있다.
 *
 * 실측에서 3Blue1Brown 영상이 12개였다 — **사실상 영상의 목차**라서, 자막이 없는 지금
 * "무슨 내용이냐"에 답하는 가장 강한 재료다.
 */
export function extractChapters(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/"chapterRenderer":\{"title":\{"simpleText":"((?:[^"\\]|\\.){0,200})"/g)) {
    const title = m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    if (title.trim()) out.push(title.trim());
    if (out.length >= 60) break;
  }
  return out;
}

/** watch 페이지 HTML → 우리가 실제로 읽을 수 있는 것들. 못 읽으면 null. */
export function parseWatchPage(html: string, videoId: string): YoutubeInfo | null {
  const pr = sliceObject(html, /ytInitialPlayerResponse\s*=/);
  const details = get(pr, "videoDetails");
  if (!details) return null;

  const tracks = get(pr, "captions", "playerCaptionsTracklistRenderer", "captionTracks");
  const languages = Array.isArray(tracks)
    ? [...new Set(tracks.map((t) => str(get(t, "languageCode"))).filter(Boolean))]
    : [];

  const seconds = Number(str(get(details, "lengthSeconds")));

  return {
    videoId,
    title: str(get(details, "title")),
    author: str(get(details, "author")),
    lengthSeconds: Number.isFinite(seconds) ? seconds : 0,
    viewCount: str(get(details, "viewCount")),
    description: str(get(details, "shortDescription")),
    chapters: extractChapters(html),
    captionLanguages: languages,
  };
}

/** "19분 20초" — 사람이 읽는 길이. 0이면 빈 문자열. */
export function humanDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h && `${h}시간`, m && `${m}분`, s && `${s}초`].filter(Boolean).join(" ");
}

/**
 * 모델에게 넘길 글. **자막을 읽지 못했다는 사실이 본문 안에 들어간다** —
 * 이 문장을 빼면 모델이 영상을 본 것처럼 말한다.
 */
export function youtubeSummaryText(info: YoutubeInfo): string {
  const lines: string[] = [];
  lines.push(`제목: ${info.title}`);
  if (info.author) lines.push(`채널: ${info.author}`);
  const dur = humanDuration(info.lengthSeconds);
  if (dur) lines.push(`길이: ${dur}`);
  if (info.viewCount) lines.push(`조회수: ${info.viewCount}`);

  lines.push(
    info.captionLanguages.length
      ? `자막: ${info.captionLanguages.length}개 언어로 존재하지만 **내려받을 수 없었습니다**(유튜브가 막음). 아래는 자막이 아니라 설명과 챕터입니다.`
      : `자막: 없습니다. 아래는 설명과 챕터입니다.`
  );

  if (info.chapters.length) {
    lines.push("", `챕터 ${info.chapters.length}개:`, ...info.chapters.map((c, i) => `  ${i + 1}. ${c}`));
  }
  if (info.description) lines.push("", "설명:", info.description);
  return lines.join("\n");
}
