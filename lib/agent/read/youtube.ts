// 유튜브 watch 페이지에서 읽을거리를 뽑는다. **순수 함수** — 네트워크는 부르는 쪽이 한다.
//
// **자막 본문을 가져오는 길은 하나뿐이다.** watch 페이지에 박힌 captionTracks[].baseUrl 은
// 빈 몸통을 돌려준다(HTTP 200, 0자 — 여러 갈래로 확인). 살아 있는 주소는 **ANDROID 클라이언트로
// InnerTube player 를 부른 응답**에 들어 있다. 이 경로는 youtube-transcript-api(파이썬)가 쓰는
// 방법이고, 그대로 옮겨 실측했다 — 한국어 자막 8,942자를 받았다.
//
// 어긋나면 안 되는 값 셋:
//   ① clientVersion "20.10.38"  — 19.09.37 로는 HTTP 400 이 온다
//   ② baseUrl 에서 `&fmt=srv3` 를 **뗀다**. fmt 를 붙이지 않는다(붙이면 빈 몸통)
//   ③ `&exp=xpe` 가 붙어 있으면 그 영상은 PO 토큰이 필요하다 — 포기하고 설명·챕터로 간다
//
// 자막을 못 받은 경우에는 설명과 챕터로 답하되, 못 읽었다는 사실을 함께 돌려준다.
// 안 돌려주면 모델이 "영상을 봤다"는 투로 말한다.

/** 챕터 한 칸. 시각까지 가져오는 이유는 아래 extractChapters 주석에 있다. */
export interface Chapter {
  title: string;
  startSeconds: number;
}

/** 유튜브에서 건진 것. `captionLanguages` 는 "자막이 있다"는 뜻이지 "우리가 읽었다"는 뜻이 아니다. */
export interface YoutubeInfo {
  videoId: string;
  title: string;
  author: string;
  /** 초. 알 수 없으면 0. */
  lengthSeconds: number;
  viewCount: string;
  description: string;
  chapters: Chapter[];
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

/** InnerTube 를 부르는 데 필요한 열쇠. watch 페이지 HTML 에 박혀 있다. */
export function innertubeApiKey(html: string): string | null {
  return html.match(/"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/)?.[1] ?? null;
}

/** InnerTube player 를 부를 때 보낼 몸통. clientVersion 을 낮추면 400 이 온다(실측). */
export function playerRequestBody(videoId: string): Record<string, unknown> {
  return {
    context: { client: { clientName: "ANDROID", clientVersion: ANDROID_CLIENT_VERSION } },
    videoId,
  };
}

/** ⚠️ 이 값을 바꾸기 전에 실제로 자막이 오는지 확인할 것. 19.09.37 로는 HTTP 400 이었다. */
const ANDROID_CLIENT_VERSION = "20.10.38";

/** player 응답에서 자막 트랙들. 없으면 빈 배열. */
export function playerCaptionTracks(player: unknown): CaptionTrack[] {
  const tracks = get(player, "captions", "playerCaptionsTracklistRenderer", "captionTracks");
  if (!Array.isArray(tracks)) return [];
  return tracks
    .map((t) => ({
      languageCode: str(get(t, "languageCode")),
      baseUrl: str(get(t, "baseUrl")),
      isGenerated: str(get(t, "kind")) === "asr",
    }))
    .filter((t) => t.languageCode && t.baseUrl);
}

export interface CaptionTrack {
  languageCode: string;
  baseUrl: string;
  /** 자동 생성 자막인가. 사람이 단 자막보다 정확도가 낮다. */
  isGenerated: boolean;
}

/**
 * 어느 자막을 읽을지. 원하는 언어 순서대로 보되, **사람이 단 자막을 자동 생성보다 먼저** 고른다.
 * 하나도 안 맞으면 있는 것 중 첫 번째라도 읽는다 — 영어 자막이라도 없는 것보다 낫다.
 */
export function pickCaptionTrack(tracks: CaptionTrack[], prefer: string[]): CaptionTrack | null {
  for (const lang of prefer) {
    const manual = tracks.find((t) => t.languageCode === lang && !t.isGenerated);
    if (manual) return manual;
    const auto = tracks.find((t) => t.languageCode === lang);
    if (auto) return auto;
  }
  return tracks[0] ?? null;
}

/** 자막을 실제로 받을 주소. PO 토큰이 필요한 영상이면 null. */
export function captionUrl(track: CaptionTrack): string | null {
  // exp=xpe 는 "이 주소는 PO 토큰 없이는 안 준다"는 표시다.
  if (track.baseUrl.includes("&exp=xpe")) return null;
  // fmt 를 붙이지 않는다. srv3 가 붙어 있으면 뗀다 — 붙은 채로는 빈 몸통이 온다.
  return track.baseUrl.replace("&fmt=srv3", "");
}

/** 자막 XML → 이어 붙인 글. `<text start=".." dur="..">…</text>` 모양이다. */
export function parseCaptionXml(xml: string): string {
  const parts: string[] = [];
  for (const m of xml.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)) {
    const t = decodeCaption(m[1]).replace(/\s+/g, " ").trim();
    if (t) parts.push(t);
  }
  return parts.join(" ");
}

/** 자막 안의 엔티티. 두 번 인코딩된 경우가 있어 한 번 더 푼다. */
function decodeCaption(raw: string): string {
  const once = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  return once.includes("&") ? once.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&") : once;
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
 * 챕터. `ytInitialData` 안에 `chapterRenderer` 로 들어 있다.
 *
 * 실측에서 3Blue1Brown 영상이 12개였다 — **사실상 영상의 목차**라서, 자막이 없는 지금
 * "무슨 내용이냐"에 답하는 가장 강한 재료다.
 *
 * **시각(`timeRangeStartMillis`)까지 가져온다.** 제목만 주면 "3분쯤에 뭐라고 해?" 같은 물음에
 * 모델이 시각을 지어낸다(실측에서 실제로 그랬다). 시각이 있으면 "3분경은 X 챕터입니다"라고
 * 아는 것만 말할 수 있다.
 */
export function extractChapters(html: string): Chapter[] {
  const out: Chapter[] = [];
  const re = /"chapterRenderer":\{"title":\{"simpleText":"((?:[^"\\]|\\.){0,200})"\}(?:,"timeRangeStartMillis":(\d{1,12}))?/g;
  for (const m of html.matchAll(re)) {
    const title = m[1]
      .replace(/\\"/g, '"')
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\\\/g, "\\")
      .trim();
    if (!title) continue;
    out.push({ title, startSeconds: Math.floor(Number(m[2] ?? 0) / 1000) });
    if (out.length >= 60) break;
  }
  return out;
}

/** "0:00" · "1:02:03" — 챕터 앞에 붙일 시각. */
export function timeLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const parts = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  const head = parts[0] ? [parts[0], String(parts[1]).padStart(2, "0")] : [parts[1]];
  return [...head, String(parts[2]).padStart(2, "0")].join(":");
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
export function youtubeSummaryText(info: YoutubeInfo, caption?: FetchedCaption): string {
  const lines: string[] = [];
  lines.push(`제목: ${info.title}`);
  if (info.author) lines.push(`채널: ${info.author}`);
  const dur = humanDuration(info.lengthSeconds);
  if (dur) lines.push(`길이: ${dur}`);
  if (info.viewCount) lines.push(`조회수: ${info.viewCount}`);

  if (caption?.text) {
    // 어느 언어를 골랐는지, 그게 번역일 수 있는지까지 적는다.
    // 실측: 한국어 자막(영어 영상의 번역)을 주었더니 모델이 **영어 원문 인용처럼** 지어냈다.
    const others = info.captionLanguages.length > 1 ? ` (자막 ${info.captionLanguages.length}개 언어 중 고름)` : "";
    lines.push(
      `자막: ${caption.languageCode}${caption.isGenerated ? " · 자동 생성이라 받아쓰기 오류가 있을 수 있습니다" : ""}${others} 를 읽었습니다.`,
      "아래 자막은 **번역본일 수 있습니다.** 영상에서 실제로 한 말을 그대로 인용해 달라는 요청에는, 원문이 아니라 이 자막의 글임을 밝히세요."
    );
  } else {
    lines.push(
      info.captionLanguages.length
        ? `자막: ${info.captionLanguages.length}개 언어로 있지만 **내려받지 못했습니다.** 아래는 자막이 아니라 설명과 챕터입니다.`
        : `자막: 없습니다. 아래는 설명과 챕터입니다.`
    );
  }

  if (info.chapters.length) {
    // 자막이 없을 때는 챕터 시각이 "언제 무슨 말을 했나"에 대한 유일한 근거다.
    // 그 경계를 적어 두지 않으면 모델이 시각을 지어낸다(실측).
    const caveat = caption?.text ? "" : " (이 시각 정보 말고는 언제 무슨 말을 했는지 알 수 없습니다)";
    lines.push(
      "",
      `챕터 ${info.chapters.length}개${caveat}:`,
      ...info.chapters.map((c) => `  ${timeLabel(c.startSeconds)}  ${c.title}`)
    );
  }

  // 자막이 있으면 그게 내용이다. 설명은 대개 링크·홍보라 자리를 양보한다.
  if (caption?.text) lines.push("", "자막 전문:", caption.text);
  else if (info.description) lines.push("", "설명:", info.description);
  return lines.join("\n");
}

/** 실제로 읽어 온 자막. */
export interface FetchedCaption {
  languageCode: string;
  isGenerated: boolean;
  text: string;
}
