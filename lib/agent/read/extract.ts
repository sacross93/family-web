// HTML 한 덩어리에서 읽을거리를 뽑아낸다. **네트워크도 DOM 도 건드리지 않는 순수 함수만** 둔다.
//
// 왜 정규식인가: 실측(2026-09-20)에서 주류 5/5 사이트가 이 방식으로 읽혔다. 우리가 필요한 건
// 정확한 트리가 아니라 "사람이 읽을 글"이라 거친 추출로 충분하다. 파서를 들이면 번들과
// 공급망이 늘어난다. 시험이 이 판단을 지킨다 — 실제 사이트 모양을 픽스처로 박아 뒀다.
//
// ⚠️ 이 파일의 정규식은 500KB 짜리 HTML 위를 지나간다. 중첩 수량자(`(a+)+`)를 쓰지 말 것.

/** 페이지에서 건진 조각들. 비어 있을 수 있고, 비었다는 것 자체가 신호다. */
export interface PageParts {
  title: string;
  /** meta description → og:description 순. 둘 다 없으면 빈 문자열. */
  description: string;
  siteName: string;
  /** application/ld+json 에서 건진 것. type 은 표시용, text 는 본문 후보. */
  jsonLd: { type: string; text: string }[];
  /** main/article 안쪽을 우선한 본문. 껍데기(nav·header·footer·aside)는 뺐다. */
  body: string;
  /** 상태 블롭에서 건진 글. body 가 비었을 때만 쓸 값이다. */
  blobText: string;
  /** 페이지가 스스로 내놓은 그림. 대표성이 높은 순. 절대 주소. */
  images: string[];
}

/**
 * 블롭에서 "글"로 인정할 최소 길이.
 *
 * 한국어 기준으로 잡았다 — "임신 초기에 알아두면 좋은 것들"이 17자다. 영어 기준으로 24자쯤 두면
 * 한국어 문장이 통째로 걸러진다. 짧은 키·id 는 길이가 아니라 아래 조건(공백이나 한글이 있을 것,
 * 주소가 아닐 것, 식별자 모양이 아닐 것)이 걸러 낸다.
 */
const MIN_BLOB_STRING = 16;

/** 껍데기로 보는 태그 — 통째로 버린다. */
const CHROME_TAGS = ["script", "style", "noscript", "template", "svg", "iframe", "nav", "header", "footer", "aside", "form", "select"];

/** 그림 주소에 이게 들어 있으면 내용이 아니라 장식으로 본다. */
const DECORATIVE = /(sprite|icon|logo|avatar|profile|blank|spacer|placeholder|1x1|pixel|tracking|badge|emoji|banner|og-default)/i;

/**
 * 블롭에서 건졌지만 사람이 읽을 글이 아닌 것들. 실측에서 실제로 맨 앞에 나왔다 —
 * 인스타는 우리가 보낸 User-Agent 가, terms.naver 는 Tailwind 클래스 목록이 첫 줄이었다.
 * 블롭 글은 본문이 비었을 때 모델이 **처음 보는 글**이라, 맨 앞의 쓰레기가 특히 나쁘다.
 */
const NOT_PROSE = [
  /Mozilla\/\d|AppleWebKit|Chrome\/\d|Gecko\)/,       // User-Agent
  /width=device-width|initial-scale=/,                  // meta viewport
  /^[a-z0-9]+(?:[-:/[\]][a-z0-9.%[\]]+)*(?:\s[a-z0-9]+(?:[-:/[\]][a-z0-9.%[\]]+)*){3,}$/, // CSS 클래스 나열
];

/** 글자(한글·라틴)가 이 비율은 돼야 사람이 읽는 글로 본다. */
const MIN_LETTER_RATIO = 0.4;

function isProse(s: string): boolean {
  if (NOT_PROSE.some((re) => re.test(s))) return false;
  // RSC 플라이트 조각(`}]}]}],null]}] 11:[`)처럼 구두점·숫자만 잔뜩인 문자열을 막는다.
  const letters = (s.match(/[A-Za-z\u3131-\uD79D]/g) ?? []).length;
  return letters / s.length >= MIN_LETTER_RATIO;
}

function firstMatch(html: string, re: RegExp): string {
  return (html.match(re)?.[1] ?? "").trim();
}

/** `&amp;` 류를 되돌린다. 전체 엔티티 표를 갖지 않는다 — 글을 읽는 데 필요한 만큼만. */
function unescapeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&"); // 마지막이어야 한다 — &amp;lt; 가 < 로 두 번 풀리지 않게
}

function safeChar(code: number): string {
  return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

/** 줄을 나눌 블록 태그. 여기서 끊어야 메뉴 덩어리와 본문 문단이 서로 다른 줄이 된다. */
const BLOCK_TAGS = /^\/?(p|div|br|li|ul|ol|tr|td|th|h[1-6]|section|article|header|footer|nav|blockquote|pre|dd|dt|figure|figcaption|table|main|aside)$/i;

/**
 * 태그를 걷어낸다. **정규식이 아니라 한 번 훑는 스캐너**다.
 *
 * `<[^>]*>` 로는 속성값 안에 `>` 가 든 태그를 못 지운다 — 위키백과의
 * `data-mw='{"…":"</span>"}'` 같은 것이 그렇고, 실제로 본문에 `</span>"}'>` 가 12개 새어 나왔다.
 * 따옴표 안을 건너뛰며 훑으면 정확하고, 되돌아가지 않으니 500KB 에서도 안전하다.
 *
 * 블록 태그 자리에는 줄바꿈을, 나머지에는 공백을 남긴다(단어가 붙지 않게).
 */
export function removeTags(html: string): string {
  let out = "";
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);

    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end < 0 ? html.length : end + 3;
      out += " ";
      continue;
    }

    // 태그 이름을 읽어 블록인지 본다.
    let j = lt + 1;
    while (j < html.length && /[a-zA-Z/!?]/.test(html[j])) j++;
    const name = html.slice(lt + 1, j);

    // 따옴표 안의 `>` 는 태그 끝이 아니다.
    let quote = "";
    while (j < html.length) {
      const c = html[j];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === ">") break;
      j++;
    }
    out += BLOCK_TAGS.test(name) ? "\n" : " ";
    i = j + 1;
  }
  return out;
}

/** 태그를 걷어내고 공백을 정리한다. 줄 구분은 살린다 — 껍데기를 거르는 데 쓴다. */
export function stripTags(html: string): string {
  let out = html;
  for (const tag of CHROME_TAGS) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), " ");
    // 닫히지 않은 채 끝나는 경우(잘린 HTML)도 버린다
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*$`, "i"), " ");
  }
  return removeTags(out)
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** 이 길이 아래는 "짧은 줄" 로 본다. 메뉴 한 칸과 소제목이 여기 들어온다. */
const SHORT_LINE = 24;

/**
 * 메뉴·버튼 같은 껍데기 줄을 버린다.
 *
 * 실측(namu.wiki): 본문 앞 400자가 통째로 "최근 변경 최근 토론 특수 기능 … 편집 권한이
 * 부족합니다 …" 였다. 모델은 위에서부터 읽으므로 **맨 앞의 껍데기가 가장 나쁘다.**
 *
 * 가르는 기준: **짧은 줄이 짧은 줄들 사이에 있으면 메뉴, 긴 글 바로 앞에 있으면 소제목.**
 * 그냥 "짧으면 버린다" 로 하면 소제목("이름 [편집]", "AI가 요약한 핵심 내용")까지 날아간다.
 * 사이트 이름이나 낱말 목록으로 거르지 않는다 — 그런 규칙은 사이트마다 늘어나고 곧 틀린다.
 */
export function dropBoilerplate(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const isLong = lines.map((l) => l.length >= SHORT_LINE);

  const kept = lines.filter((_, i) => isLong[i] || isLong[i + 1]);
  // 전부 걸러졌다면 거르지 않은 편이 낫다 — 짧은 줄만으로 된 페이지도 있다.
  return kept.length ? kept.join("\n") : lines.join("\n");
}

/**
 * 본문이 들어 있을 만한 칸을 고른다. main·article 중 가장 긴 것, 없으면 body.
 *
 * **거의 빈 칸이면 믿지 않는다.** 마크업이 `<main>`·`<article>` 을 달아 놓고 그 안에
 * 껍데기만 넣어 둔 사이트가 있다. 그 경우 body 로 떨어져야 그나마 건질 게 남는다.
 * 비율이 아니라 절대 길이로 잰다 — 비율로 재면 "본문이 원래 없는 포털 첫 화면"에서
 * 엉뚱하게 body 로 떨어진다(실측 childcare.go.kr: main 1,867자 / body 3,796자인데 둘 다 껍데기).
 */
export function mainRegion(html: string): string {
  const body = html.match(/<body\b[^>]*>([\s\S]*)<\/body\s*>/i)?.[1] ?? html;

  const candidates: string[] = [];
  for (const tag of ["main", "article"]) {
    for (const m of html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, "gi"))) {
      candidates.push(m[1]);
    }
  }
  const byRole = html.match(/<div\b[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/div\s*>/i)?.[1];
  if (byRole) candidates.push(byRole);
  if (!candidates.length) return body;

  // 가장 긴 것 하나. 여러 개를 이으면 같은 글이 두 번 들어가는 사이트가 있다.
  const best = candidates.reduce((a, b) => (b.length > a.length ? b : a));
  return stripTags(best).length >= MAIN_MIN_CHARS ? best : body;
}

/** main/article 이 이만큼도 못 담고 있으면 마크업이 거짓말하는 것으로 본다. */
const MAIN_MIN_CHARS = 200;

/** 메타 한 줄. name= 과 property= 를 모두 보고, content 가 앞에 오는 순서도 받는다. */
function metaContent(html: string, key: string): string {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    firstMatch(html, new RegExp(`<meta[^>]+(?:name|property)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i")) ||
    firstMatch(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${k}["']`, "i"))
  );
}

/** application/ld+json. 깨진 것은 조용히 건너뛴다 — 하나가 깨졌다고 나머지를 버릴 이유가 없다. */
export function extractJsonLd(html: string): { type: string; text: string }[] {
  const out: { type: string; text: string }[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const nodes = Array.isArray(parsed)
      ? parsed
      : ((parsed as Record<string, unknown>)?.["@graph"] as unknown[]) ?? [parsed];
    for (const node of nodes) {
      if (typeof node !== "object" || node === null) continue;
      const o = node as Record<string, unknown>;
      const type = Array.isArray(o["@type"]) ? String(o["@type"][0]) : String(o["@type"] ?? "");
      const text = [o.articleBody, o.description, o.text].find((v) => typeof v === "string" && v.trim());
      if (type || text) out.push({ type: type || "(무명)", text: typeof text === "string" ? text.trim() : "" });
    }
  }
  return out;
}

/** 재귀로 문자열만 긁는다. 깊이를 제한한다 — 블롭은 깊고 크다. */
function harvestStrings(value: unknown, out: string[], depth = 0): void {
  if (depth > 12 || out.length > 400) return;
  if (typeof value === "string") {
    if (value.length >= MIN_BLOB_STRING && /[\s\u3131-\uD79D]/.test(value) && !/^https?:\/\//.test(value) && isProse(value)) {
      out.push(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) harvestStrings(v, out, depth + 1);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value)) harvestStrings(v, out, depth + 1);
  }
}

/**
 * 상태 블롭에서 읽을 글을 건진다.
 *
 * 실측(2026-09-20): 인스타그램은 본문이 **9자**인데 `application/json` 블롭이 **508KB** 였다.
 * gist 가 알려준 이 기법이 이 조사에서 가장 값졌다. 다만 gist 의 `__NEXT_DATA__` 목록은 낡았다 —
 * 요즘 Next(App Router)는 `self.__next_f` 조각으로 나간다.
 */
export function extractBlobText(html: string): string {
  const chunks: string[] = [];

  const jsonBlocks = [
    ...[...html.matchAll(/<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)].map((m) => m[1]),
    html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script\s*>/i)?.[1] ?? "",
    html.match(/<script[^>]+id=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script\s*>/i)?.[1] ?? "",
  ].filter(Boolean);

  for (const block of jsonBlocks) {
    try {
      harvestStrings(JSON.parse(block.trim()), chunks);
    } catch {
      // JSON 이 아니면 넘어간다. 아래 날문자열 긁기가 받아 준다.
    }
  }

  // window.__X__ = {...} 계열과 App Router 조각은 JSON 이 아니거나 이스케이프돼 있다 → 날것으로 긁는다.
  const raw = [
    ...[...html.matchAll(/self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.){0,200000})"\]\)/g)].map((m) => m[1]),
    html.match(/window\.__NUXT__\s*=([\s\S]{0,200000}?)<\/script\s*>/)?.[1] ?? "",
    html.match(/window\.__INITIAL_STATE__\s*=([\s\S]{0,200000}?)<\/script\s*>/)?.[1] ?? "",
    html.match(/window\.__PRELOADED_STATE__\s*=([\s\S]{0,200000}?)<\/script\s*>/)?.[1] ?? "",
  ].filter(Boolean);

  for (const block of raw) {
    const unescaped = block.replace(/\\"/g, '"').replace(/\\n/g, " ").replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => safeChar(parseInt(h, 16)));
    for (const m of unescaped.matchAll(/"([^"\\]{16,2000})"/g)) {
      const s = m[1];
      if (/[\s\u3131-\uD79D]/.test(s) && !/^https?:\/\//.test(s) && !/^[$a-zA-Z0-9_\-/.]+$/.test(s) && isProse(s)) chunks.push(s);
      if (chunks.length > 400) break;
    }
  }

  // 같은 문장이 블롭에 여러 번 들어 있는 게 흔하다.
  return [...new Set(chunks)].join(" ").replace(/\s+/g, " ").trim();
}

/** 그림 주소를 대표성 높은 순으로. 상대 주소는 절대 주소로 바꾸고, 못 바꾸면 버린다. */
export function extractImages(html: string, baseUrl: string, main: string): string[] {
  const out: string[] = [];
  const add = (raw: string | undefined) => {
    if (!raw || out.length >= 8) return;
    const v = unescapeEntities(raw.trim());
    if (!v || v.startsWith("data:") || DECORATIVE.test(v)) return;
    try {
      const abs = new URL(v, baseUrl).toString();
      if (!/^https?:$/.test(new URL(abs).protocol)) return;
      if (!out.includes(abs)) out.push(abs);
    } catch {
      // 주소가 아니면 버린다
    }
  };

  add(metaContent(html, "og:image"));
  add(metaContent(html, "twitter:image"));
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    const urls = [...m[1].matchAll(/"(?:image|contentUrl|thumbnailUrl)"\s*:\s*"([^"]+)"/g)].map((x) => x[1]);
    urls.forEach(add);
  }
  for (const m of main.matchAll(/<img\b[^>]*?\bsrc=["']([^"']+)["']/gi)) add(m[1]);

  return out;
}

/** 페이지에서 건질 수 있는 것 전부. 순서는 §20.2 의 계단과 같다. */
export function extractPage(html: string, baseUrl: string): PageParts {
  const main = mainRegion(html);
  return {
    title: unescapeEntities(firstMatch(html, /<title[^>]*>([\s\S]{0,500}?)<\/title\s*>/i)).replace(/\s+/g, " "),
    description: unescapeEntities(metaContent(html, "description") || metaContent(html, "og:description")),
    siteName: unescapeEntities(metaContent(html, "og:site_name")),
    jsonLd: extractJsonLd(html),
    body: dropBoilerplate(unescapeEntities(stripTags(main))),
    blobText: extractBlobText(html),
    images: extractImages(html, baseUrl, main),
  };
}

/**
 * 차단당한 것인가.
 *
 * 실측: coupang.com 이 본문 316자짜리 `Access Denied` 를 HTTP 200 으로 줬다.
 * 이걸 "내용"으로 넘기면 모델이 그걸 요약해서 태연히 거짓말한다.
 */
export function looksBlocked(status: number, title: string, body: string): boolean {
  if (status === 403 || status === 429) return true;
  const hay = `${title} ${body.slice(0, 600)}`;
  const denied = /(access denied|forbidden|are you a robot|captcha|보안문자|접근이 거부|비정상적인 접근|잠시 후 다시 시도)/i.test(hay);
  // 긴 페이지에 이 말이 섞인 건 그냥 내용일 수 있다. 짧은데 이 말이 있으면 차단이다.
  return denied && body.length < 1500;
}
