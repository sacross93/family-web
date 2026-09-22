// 화면 점검 — 폰/데스크톱 두 폭에서 전 페이지를 돌며 세 가지를 잰다.
//
//   1. 가로 스크롤      (AGENTS.md: 가로 스크롤 금지)
//   2. 가려짐            떠 있는 것(하단 탭바·물어보기)이 글자나 버튼을 덮는가
//   3. 페이지 길이       몇 화면어치인가 — 짧을수록 좋다는 뜻은 아니고, 늘어나면 눈에 띄게
//   4. `…` 메뉴          펼친 항목이 잘리지 않는가, 바깥을 누르면 닫히는가 (폰만)
//   5. 탭 타깃           폰에서 누를 수 있는 넓이가 40px 이상인가, 서로 훔치지 않는가
//   6. 키보드            포커스 표시가 보이는가, 떠 있는 판이 탭을 가두는가
//   7. 글자 확대         브라우저 글자 크기를 1.5배로 해도 글이 잘리지 않는가
//
// 4번이 있는 이유: 조상에 overflow-hidden 이 있으면 메뉴가 잘려 아래 항목을 아예
// 누를 수 없고(계획 상세에서 "수정·삭제" 가 그랬다), 조상에 transform 이 있으면
// 바깥 탭이 먹지 않는다(게시판 쪽지). 둘 다 닫힌 버튼만 봐서는 안 보인다.
//
// 가려짐은 두 가지로 나눠 본다.
//   - **글자**: 맨 아래까지 내렸을 때만 문제로 센다. 스크롤 도중 탭바 밑으로 글이 지나가는
//     것은 모든 모바일 앱이 그렇고, 더 내리면 읽힌다.
//   - **누를 수 있는 것**: 어느 자리에서든 문제다. 글은 스쳐 지나가면 그만이지만 버튼은
//     그 자리에서 누르면 **다른 것이 눌린다**. 아기 기록의 `…` 가 물어보기 FAB 에 덮여
//     일기를 고치려고 누르면 AI 채팅이 열렸다. "더 내리면 된다" 로는 안 되는 종류다.
//
// 쓰기:  npm run dev  또는 npm start  (다른 터미널)
//        node scripts/ui-audit.mjs [기준URL] [아이디] [비밀번호]
//
// 이 검사는 아무것도 올리지 않으므로 **운영 빌드(`npm start`)로 재는 편이 낫다** —
// dev 는 화면이 더 늦게 그려져 '느리다' 를 잘못 재게 된다(26조각에서 그랬다).
// 반대로 `ui-flows` 는 사진을 올리므로 반드시 `npm run dev` 여야 한다.
//
// playwright 는 이 저장소의 의존성이 아니다(브라우저 내려받기가 무겁다).
// 이미 깔린 것을 찾아 쓰고, 없으면 `npx playwright install chromium` 을 알려 준다.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const BASE = process.argv[2] || "http://localhost:3000";

// 이 저장소가 지금 말하는 값. 화면이 이것과 다르면 **옛 빌드를 재고 있는 것**이다.
// 색만으로는 못 잡는다(팔레트는 그대로 두고 모서리만 바꾼 날이 있었다) — 둘 다 본다.
// 같은 값을 서로 다르게 적는 두 가지를 맞춰 준다: `0.625rem`↔`.625rem`, `#ffffff`↔`#fff`
// (둘 다 실제로 어긋났다 — 화면에 오는 CSS 는 줄여 쓰여 있다).
const norm = (v) =>
  v.trim().toLowerCase()
    .replace(/^([0-9.]+)rem$/, (_, n) => `${parseFloat(n)}rem`)
    .replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/, (_, r, g, b) => `#${r}${r}${g}${g}${b}${b}`);
const WANT = (() => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const out = {};
  for (const [, name, value] of css.matchAll(/(--(?:color|radius)-[a-z-]+):\s*([^;]+);/g)) {
    const v = norm(value);
    // 브라우저가 사용자 정의 속성을 **적힌 그대로** 돌려주는 꼴만 고른다.
    // (`0.625rem` 은 `.625rem` 으로 돌아오므로 `norm` 이 맞춰 준다.)
    if (/^(#[0-9a-f]{6}|[0-9.]+rem)$/.test(v)) out[name] = v;
  }
  return out;
})();
const USER = process.argv[3] || process.env.AUDIT_USER;
const PASS = process.argv[4] || process.env.AUDIT_PASS;

const PATHS = [
  "/", "/todos", "/shopping", "/albums", "/calendar",
  "/baby", "/board", "/anniversaries", "/plans",
  // 관리자도 사람이 쓰는 화면이다. "관리자 전용" 이라고 검사에서 빼 두니
  // 폰에서 4화면짜리로 남아 있었다.
  "/admin",
];

/**
 * 상세 페이지도 돈다 — 목록만 보면 놓친다.
 * 계획 상세의 `…` 메뉴가 카드 overflow 에 잘려 폰에서 수정·삭제를 아예 못 눌렀는데,
 * `/plans` 만 검사해서는 보이지 않았다. id 는 로그인한 뒤 API 로 알아온다.
 */
async function detailPaths(page) {
  const j = async (u) => page.evaluate(async (u) => {
    try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; }
  }, u);
  const out = [];
  const plans = await j("/api/plans");
  const albums = await j("/api/albums");
  const planId = plans?.[0]?.id ?? plans?.plans?.[0]?.id;
  const albumId = albums?.[0]?.id ?? albums?.albums?.[0]?.id;
  if (planId) out.push(`/plans/${planId}`);
  if (albumId) out.push(`/albums/${albumId}`);
  return out;
}
const WIDTHS = [
  { w: 390, h: 844, tag: "폰" },
  // 안드로이드 대부분이 360 이다. 390(아이폰)만 보다 할일의 요일 칸이 37px 인 것을
  // 놓쳤다 — 390 에서는 42px 라 통과했다. 30px 차이가 규칙 하나를 통째로 숨겼다.
  { w: 360, h: 800, tag: "안드로이드폰" },
  // 사이드바는 lg(1024px)부터다. 그 아래 태블릿은 폰과 같은 셸(상단바 + 하단 탭바)을
  // 쓰면서 격자만 2열이 된다 — 둘 다 검사해 봐야 안다.
  { w: 768, h: 1024, tag: "태블릿" },
  { w: 1280, h: 900, tag: "데스크톱" },
];

/** 이미 깔린 playwright 를 찾는다. 없으면 null. */

/**
 * 이름 없는 입력칸 훑기.
 *
 * 스크린리더는 칸의 이름을 라벨(`<label for>`)·aria-label 순으로 찾는다.
 * 우리 `Field` 는 라벨을 그리기만 하고 칸에 **붙이지는 않고** 있었다 — 그래서
 * 이름을 자리표시(placeholder)가 혼자 떠받치고 있었고, 로그인에서 중복이라 지웠더니
 * 칸 이름이 통째로 사라졌다. 자리표시는 글자를 넣으면 사라지므로 이름이 아니다.
 *
 * **폼은 대개 모달 안에 있다.** 목록 화면만 훑으면 이 검사는 거의 아무것도 못 본다 —
 * 처음 만들었을 때 실제로 그랬다(라벨 연결을 도로 끊어 봐도 0건이었다).
 * 그래서 로그인 화면과 **열어 본 모달**까지 함께 훑는다.
 */
async function unnamedInputs(page) {
  return page.evaluate(() => {
    const named = (el) => {
      if (el.getAttribute("aria-label")?.trim()) return true;
      if (el.getAttribute("aria-labelledby")) return true;
      if (el.getAttribute("title")?.trim()) return true;
      if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return true;
      if (el.closest("label")) return true;
      return false;
    };
    return [...document.querySelectorAll("input, textarea, select")]
      .filter((el) => el.type !== "hidden" && el.offsetParent !== null && !named(el))
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.type ?? "",
        hint: (el.placeholder || el.name || "").slice(0, 40),
      }));
  });
}

function findPlaywright() {
  const roots = [
    join(process.cwd(), "node_modules"),
    join(homedir(), ".npm/_npx"),
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const direct = join(root, "playwright/index.mjs");
    if (existsSync(direct)) return direct;
    for (const d of readdirSync(root)) {
      const p = join(root, d, "node_modules/playwright/index.mjs");
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/** playwright 가 깔아 둔 크로미움 실행 파일. 버전이 어긋나도 있는 걸 쓴다. */
function findChromium() {
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  const linux = join(homedir(), ".cache/ms-playwright");
  for (const dir of [cache, linux]) {
    if (!existsSync(dir)) continue;
    const shells = readdirSync(dir)
      .filter((d) => d.startsWith("chromium"))
      .sort()
      .reverse();
    for (const s of shells) {
      for (const rel of [
        "chrome-headless-shell-mac-arm64/chrome-headless-shell",
        "chrome-headless-shell-linux/chrome-headless-shell",
        "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
        "chrome-linux/chrome",
      ]) {
        const p = join(dir, s, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  return undefined; // playwright 가 알아서 찾게 둔다
}

/** 페이지 안에서 도는 검사. 떠 있는 것과 잎 요소의 사각형이 실제로 겹치는지 본다. */
const probeOcclusion = (interactiveOnly = false) => {
  const floats = [...document.querySelectorAll("body *")].filter((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return (
      s.position === "fixed" &&
      s.display !== "none" &&
      s.visibility !== "hidden" &&
      r.width > 8 &&
      r.height > 8 &&
      !el.closest("[data-nextjs-toast], nextjs-portal")
    );
  });
  const sel = interactiveOnly
    ? "a[href], button, input, select, textarea, [role='button']"
    : "a, button, input, li, p, h1, h2, h3, span, td";
  const leaves = [...document.querySelectorAll(sel)].filter((el) => {
    if (el.querySelector("a,button,input,p,h1,h2,h3")) return false;
    if (floats.some((f) => f.contains(el) || el.contains(f))) return false;
    const r = el.getBoundingClientRect();
    return (
      r.width > 4 &&
      r.height > 4 &&
      getComputedStyle(el).visibility !== "hidden" &&
      (el.textContent || "").trim()
    );
  });
  const hit = (a, b) =>
    !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  const out = [];
  // 화면 맨 아래에 폭 전체로 붙은 것 = 하단 탭바. 모든 모바일 앱이 그렇고 화면 가장자리라
  // 거기를 눌러 콘텐츠를 집으려는 사람은 없다. 그 밖에 콘텐츠 한가운데 떠 있는 것은 다르다 —
  // 그 자리를 누르면 엉뚱한 게 눌린다(우하단에 떠 있던 물어보기가 그랬다).
  const isBottomBar = (r) =>
    interactiveOnly && r.left <= 1 && r.right >= innerWidth - 1 && r.bottom >= innerHeight - 1;

  for (const f of floats) {
    const fr = f.getBoundingClientRect();
    if (isBottomBar(fr)) continue;
    const label = (f.getAttribute("aria-label") || f.tagName).slice(0, 30);
    for (const el of leaves) {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;
      if (!hit(fr, r)) continue;
      // 진짜로 그 위에 있는지 — 가운데를 짚어 최상위 요소가 떠 있는 쪽인지 본다.
      const cx = Math.max(r.left, fr.left) + Math.min(r.right, fr.right) - Math.max(r.left, fr.left) / 2;
      const mx = (Math.max(r.left, fr.left) + Math.min(r.right, fr.right)) / 2;
      const my = (Math.max(r.top, fr.top) + Math.min(r.bottom, fr.bottom)) / 2;
      const topEl = document.elementFromPoint(mx, my);
      if (interactiveOnly && !(topEl && (f === topEl || f.contains(topEl)))) continue;
      void cx;
      out.push({
        float: label,
        covered:
          (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30) ||
          el.tagName,
      });
    }
  }
  return out;
};

/** 펼친 `…` 메뉴의 항목이 잘리거나 화면 밖으로 나가지 않았는가. */
const probeMenu = () => {
  const menu = document.querySelector("[data-item-menu]");
  if (!menu) return [];
  const bad = [];
  for (const b of menu.querySelectorAll("button")) {
    const r = b.getBoundingClientRect();
    const label = (b.textContent || "").trim();
    if (r.bottom > innerHeight || r.top < 0) {
      bad.push({ label, why: "화면 밖에 있음" });
      continue;
    }
    for (let el = b.parentElement; el; el = el.parentElement) {
      const s = getComputedStyle(el);
      if (s.overflow === "visible" || s.overflow === "") continue;
      const pr = el.getBoundingClientRect();
      if (r.bottom > pr.bottom + 1 || r.right > pr.right + 1 || r.top < pr.top - 1) {
        bad.push({ label, why: "조상의 overflow 에 잘림" });
        break;
      }
    }
  }
  return bad;
};

/**
 * 폰에서 누를 수 있는 넓이(DESIGN.md §9 는 40px 이상).
 * **보이는 크기가 아니라 실제로 눌리는 넓이**를 잰다 — `.tap-target`(globals.css)이
 * 보이지 않는 가짜 요소로 넓혀 두는 자리가 있어서, getBoundingClientRect 만으로는
 * 장보기 체크 동그라미가 영영 24px 로 보인다.
 * 넓힌 영역이 옆 버튼의 한가운데를 훔치는지도 같이 본다.
 */
const probeTapTargets = () => {
  const skip = (el) => !el || el.closest("nextjs-portal, [data-nextjs-toast]");
  const hit = (el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const reach = (dx, dy) => {
      let last = 0;
      for (let d = 2; d <= 30; d += 2) {
        const t = document.elementFromPoint(cx + dx * d, cy + dy * d);
        if (t && (t === el || el.contains(t))) last = d; else break;
      }
      return last;
    };
    // reach 는 **중심에서** 잰 거리다. 폭을 또 더하면 두 배로 세어,
    // 24px 짜리 동그라미가 46px 로 나온다(실제로 그렇게 새고 있었다).
    return {
      // 실제 크기보다 작게 나올 수는 없다(reach 는 30px 에서 멈춘다).
      w: Math.max(Math.round(r.width), reach(1, 0) + reach(-1, 0)),
      h: Math.max(Math.round(r.height), reach(0, 1) + reach(0, -1)),
    };
  };

  // 화면 위아래에 붙어 있는 막대의 실제 높이 — 그 안쪽에 걸친 요소는 재지 않는다.
  // 막대에 가려진 채로 재면 위로 짚어 나가는 측정이 막혀 실제보다 작게 나온다.
  let topBar = 0, bottomBar = 0;
  for (const e of document.querySelectorAll("body *")) {
    const st = getComputedStyle(e);
    if (st.position !== "fixed" && st.position !== "sticky") continue;
    const br = e.getBoundingClientRect();
    if (br.width < innerWidth - 2 || br.height < 8) continue;
    if (br.top <= 1) topBar = Math.max(topBar, br.bottom);
    if (br.bottom >= innerHeight - 1) bottomBar = Math.max(bottomBar, innerHeight - br.top);
  }

  const small = [];
  const stolen = [];
  const seen = new Set();
  for (const el of document.querySelectorAll("button, a[href], [role='checkbox'], input:not([type='hidden'])")) {
    const r = el.getBoundingClientRect();
    // 화면 가장자리에 걸친 것은 재지 않는다 — 위/아래로 짚어 나가는 측정이 화면 밖에서
    // 잘려 실제보다 작게 나온다. 여러 스크롤 위치에서 훑으므로 언젠가는 가운데에 온다.
    if (r.width < 4 || r.height < 4) continue;
    if (r.top < topBar + 24 || r.bottom > innerHeight - bottomBar - 24) continue;
    if (skip(el) || getComputedStyle(el).visibility === "hidden") continue;
    // **문장 속 인라인 링크는 재지 않는다** — WCAG 2.5.8 의 inline 예외다.
    // 글 한가운데 낱말 링크를 40px 로 키우면 문단이 망가진다(홈의 "콩이 8주 2일" 한 줄이 그렇다).
    // "옆에 다른 글자가 같이 있는, 인라인으로 흐르는 링크" 만 뺀다 — 혼자 서 있는 링크는 그대로 잰다.
    // 옆에 **다른 글자나 인라인 조각**이 같이 흐르면 문장 속이다. 이웃이 `<span>` 인 경우도
    // 있다(홈의 "콩이 8주 2일" 이 그렇다) — 텍스트 노드만 세면 못 잡는다.
    // 플렉스 툴바의 아이콘 링크는 여기 안 걸린다: 플렉스 자식은 display 가 블록화되므로
    // 아래 `inline` 검사에서 떨어져 나간다.
    if (el.tagName === "A" && el.parentElement && getComputedStyle(el).display.startsWith("inline")) {
      const beside = [...el.parentElement.childNodes].some(
        (n) =>
          n !== el &&
          ((n.nodeType === 3 && n.nodeValue.trim()) ||
            (n.nodeType === 1 && getComputedStyle(n).display.startsWith("inline")))
      );
      if (beside) continue;
    }
    const label = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().replace(/\s+/g, " ").slice(0, 20);

    // 한가운데를 눌렀을 때 자기가 잡히는가 (넓힌 영역끼리 겹쳐 남의 것을 훔치는 경우).
    // 화면 위아래에 늘 붙어 있는 막대(상단바·하단 탭바)에 깔린 것은 뺀다 —
    // 조금만 굴리면 나온다. 가려짐 검사와 같은 기준이다.
    const inEdgeBar = (node) => {
      for (let e = node; e; e = e.parentElement) {
        const st = getComputedStyle(e);
        if (st.position !== "fixed" && st.position !== "sticky") continue;
        const br = e.getBoundingClientRect();
        const fullWidth = br.left <= 1 && br.right >= innerWidth - 1;
        if (fullWidth && (br.bottom >= innerHeight - 1 || br.top <= 1)) return true;
      }
      return false;
    };
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (top && !skip(top) && !inEdgeBar(top) && top !== el && !el.contains(top) && !top.contains(el)) {
      stolen.push({ label, by: (top.getAttribute("aria-label") || top.textContent || top.tagName).trim().slice(0, 20) });
    }

    if (Math.min(r.width, r.height) >= 40) continue;
    const h = hit(el);
    if (Math.min(h.w, h.h) >= 40) continue;
    const key = label + r.width + r.height;
    if (seen.has(key)) continue;
    seen.add(key);
    small.push({ label, 보임: `${Math.round(r.width)}×${Math.round(r.height)}`, 눌림: `${h.w}×${h.h}` });
  }
  return { small, stolen };
};

// ⏱️ **폭은 동시에 돈다.** 순서대로 돌 때 5분 43초였고, 그 정도면 내가 감사 돌리기를
// 망설이게 된다 — 망설이는 검사는 안 돌리는 검사다. 지금은 2분 24초.
// 폭마다 브라우저 컨텍스트가 따로라 서로 볼 일이 없다. 결과가 같은 것을 확인했다
// (표 53줄·문제 0건·폭·경로 해시 일치), 검사가 여전히 무는 것도 확인했다
// (꾸미기 버튼 이름을 틀리게 하면 1건, 로즈 잉크를 옛 값으로 되돌리면 38건).
const pwPath = findPlaywright();
if (!pwPath) {
  console.error("playwright 를 못 찾았어요. `npx playwright install chromium` 뒤에 다시 돌려 주세요.");
  process.exit(1);
}
const { chromium } = await import(pwPath);

const browser = await chromium.launch({ executablePath: findChromium() });

// ── 이 감사는 **읽기만 한다** ────────────────────────────
// 그래서 운영에 대고 돌려도 된다(`npm run ui:audit https://…`). 실제로 재 보니 감사가
// 보내는 GET 아닌 요청은 **로그인 하나뿐**이다 — 만들지도 지우지도 않고,
// `POST /api/agent` 도 없어서 가족의 ChatGPT 사용량도 안 쓴다.
// (반대로 `ui-flows` 는 실제로 만들고 지운다 — 그건 로컬 전용이다.)
//
// **말로만 두지 않는다.** 누군가 `…` 메뉴에서 삭제를 눌러 보는 단계를 넣는 날
// 이 문장은 조용히 거짓이 된다. 그래서 감사가 제 요청을 스스로 세고,
// 로그인 말고 쓰는 것이 하나라도 있으면 오류로 올린다.
const writes = [];
const watchWrites = (target) => {
  target.on("request", (r) => {
    if (r.method() === "GET") return;
    const u = r.url().replace(BASE, "");
    if (u.startsWith("/api/auth/login")) return; // 로그인은 감사가 하는 유일한 쓰기다
    writes.push(`${r.method()} ${u}`);
  });
  return target;
};
const _newContext = browser.newContext.bind(browser);
browser.newContext = async (...a) => watchWrites(await _newContext(...a));
const _newPage = browser.newPage.bind(browser);
browser.newPage = async (...a) => watchWrites(await _newPage(...a));
const problems = [];
const rows = [];

// ── 먼저: 이 서버가 정말 지금 빌드를 내주고 있는가 ────────
// 오늘 세 번 돌려 두 번이 **거짓말** 이었다. 20분 전에 띄워 둔 `next start` 가 포트를
// 잡고 있었고(`pkill -f "next start"` 는 프로세스 이름이 `next-server` 라 안 맞는다),
// 그 서버가 옛 HTML 을 내주는 사이 `.next` 만 새로 빌드돼서 **스타일시트가 500** 이었다.
// 화면이 통째로 민짜인데 검사는 그냥 "840건" 이라고만 했다 — 원인을 못 짚어 준다.
// 스타일이 안 먹은 화면에서는 무엇을 재도 뜻이 없으므로, 재기 전에 멈춘다.
{
  const page = await browser.newPage();
  const res = await page.goto(BASE + "/login", { waitUntil: "networkidle" }).catch(() => null);
  if (!res || !res.ok()) {
    console.error(`${BASE} 가 응답하지 않아요. 서버부터 띄워 주세요.`);
    process.exit(1);
  }
  const bad = await page.evaluate(() =>
    [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href)
  );
  const dead = [];
  for (const href of bad) {
    const r = await page.request.get(href).catch(() => null);
    if (!r || !r.ok()) dead.push(`${href.replace(/^.*\/\//, "")} → ${r ? r.status() : "없음"}`);
  }
  // 토큰이 실제로 먹었는지 — **색깔로 판정하지 않는다.** 처음엔 "바탕이 흰색이면 CSS 가
  // 안 붙은 것"으로 썼는데, 바탕을 흰색으로 바꾼 날 이 장치가 통째로 거짓 양성이 됐다.
  // 팔레트가 또 바뀌어도 안 흔들리게 **토큰이 값을 내놓는지**만 본다.
  const probe = await page.evaluate((names) => {
    const root = getComputedStyle(document.documentElement);
    const got = {};
    for (const n of names) got[n] = root.getPropertyValue(n).trim();
    return got;
  }, ["--color-chrome", "--color-ink", ...Object.keys(WANT)]);
  await page.close();

  // **붙었는가**(비어 있지 않은가)와 **이 저장소의 값인가**는 다른 질문이다.
  // 오늘 모서리를 키운 뒤 옛 서버(포트 3000)를 재면서 "말풍선 꼬리가 멀쩡하다" 는
  // 결론을 낼 뻔했다 — 색 토큰은 멀쩡히 값을 내놓고 있었기 때문이다. 그래서
  // 값을 **globals.css 에서 읽어** 대조한다(상수로 박지 않는다 — 박으면 다음 판에 썩는다).
  const stale = Object.entries(WANT).filter(([n, want]) => probe[n] && norm(probe[n]) !== want);
  if (dead.length || !probe["--color-chrome"] || !probe["--color-ink"]) {
    console.error("스타일이 안 먹은 화면입니다 — 잰 값이 전부 거짓이 되므로 멈춥니다.");
    if (dead.length) console.error("  못 받은 스타일시트: " + dead.join(", "));
    console.error(`  토큰: --color-chrome="${probe["--color-chrome"]}" --color-ink="${probe["--color-ink"]}" (비어 있으면 CSS 가 안 붙은 것)`);
    console.error("  옛 서버가 포트를 잡고 있는지 보세요:  lsof -nP -iTCP:3000 -sTCP:LISTEN");
    console.error("  그 다음:  npm run build && npm start");
    process.exit(1);
  }
  if (stale.length) {
    console.error(`${BASE} 는 **옛 빌드**입니다 — 고친 것이 아직 안 올라가 있어 재 봐야 소용없습니다.`);
    for (const [n, want] of stale) console.error(`  ${n}: 화면 "${probe[n]}" ≠ globals.css "${want}"`);
    console.error("  옛 서버가 포트를 잡고 있는지 보세요:  lsof -nP -iTCP:3000 -sTCP:LISTEN");
    console.error("  운영을 재는 중이면 배포가 끝났는지 먼저 보세요.");
    process.exit(1);
  }
}

// **네 폭을 동시에 돈다.** 폭마다 브라우저 컨텍스트가 따로라 서로 볼 일이 없다 —
// 순서대로 돌리면 이 구간만 198초였고, 그러면 내가 감사 돌리기를 망설이게 된다.
// (`problems` 는 순서가 뜻을 갖지 않는다. `rows` 는 표라서 아래에서 폭 순으로 다시 세운다.)
await Promise.all(
  WIDTHS.map(async ({ w, h, tag }) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();

  // 로그인 화면부터 본다 — 가족이 제일 먼저 보는 곳인데, 로그인한 뒤에 도는 검사만
  // 있으면 영영 안 재진다.
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  {
    const { height, overflow } = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    rows.push({ tag, path: "/login", height, screens: +(height / h).toFixed(1), overflow });
    if (overflow > 0) problems.push(`${tag} /login: 가로 스크롤 ${overflow}px`);
    if (w < 1024) {
      const { small } = await page.evaluate(probeTapTargets);
      for (const s2 of small) {
        problems.push(`${tag} /login: "${s2.label}" 이 작다 — 보임 ${s2.보임}, 눌림 ${s2.눌림} (40px 이상이어야)`);
      }
    }
    for (const f of await unnamedInputs(page)) {
      problems.push(`${tag} /login: 이름 없는 입력칸 <${f.tag} ${f.type}> (${f.hint})`);
    }
  }

  if (USER && PASS) {
    // 로그인은 **이름이 아니라 구조로** 짚는다. 칸 이름이 깨지는 것이 바로 이 검사가
    // 잡으려는 것인데, 로그인 자체가 이름에 기대고 있으면 깨진 순간 스크립트가
    // 통째로 죽어 나머지 검사가 전부 안 돌았다 — 한 가지 고장이 눈 전체를 가렸다.
    await page.locator('input[autocomplete="username"]').fill(USER);
    await page.locator('input[autocomplete="current-password"]').fill(PASS);
    await page.getByRole("button", { name: "로그인" }).click();
    await page.waitForURL(BASE + "/", { timeout: 15000 });
  }

  const paths = [...PATHS, ...(USER && PASS ? await detailPaths(page) : [])];

  for (const path of paths) {
    // **화면 하나가 실패해도 나머지는 돈다.** 운영에 대고 돌렸더니 한 화면에서
    // "Execution context was destroyed"(재는 중에 화면이 옮겨갔다)가 나면서
    // **감사 전체가 죽었다** — 그러고는 아무것도 못 본 채 끝났다.
    // 이 파일이 위에서 스스로 경계한 바로 그 모양이다: "한 가지 고장이 눈 전체를 가렸다".
    // 실패는 **오류로 올리고** 다음 화면으로 간다.
    try {
    await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(250);

    const { height, overflow } = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    rows.push({ tag, path, height, screens: +(height / h).toFixed(1), overflow });
    if (overflow > 0) problems.push(`${tag} ${path}: 가로 스크롤 ${overflow}px`);

    for (const f of await unnamedInputs(page)) {
      problems.push(`${tag} ${path}: 이름 없는 입력칸 <${f.tag} ${f.type}> (${f.hint})`);
    }

    // **폼이 있는 모달을 열어서도 본다.** 화면에 그냥 놓인 칸은 몇 개 안 되고
    // 대부분은 모달 안에 있다 — 안 열어 보면 이 검사는 거의 빈손으로 지나간다.
    const opener = page
      .getByRole("button", { name: /추가|만들기|남기기|새 / })
      .first();
    if (await opener.isVisible().catch(() => false)) {
      await opener.click().catch(() => {});
      await page.waitForTimeout(600);
      if (await page.locator('[role="dialog"]').first().isVisible().catch(() => false)) {
        for (const f of await unnamedInputs(page)) {
          problems.push(`${tag} ${path}(모달): 이름 없는 입력칸 <${f.tag} ${f.type}> (${f.hint})`);
        }
      }
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(350);
    }

    // 누를 수 있는 것은 어느 자리에서든 덮이면 안 된다 — 위·가운데·아래를 다 본다.
    const seen = new Set();
    for (const frac of [0, 0.5, 1]) {
      await page.evaluate((f) => window.scrollTo(0, document.body.scrollHeight * f), frac);
      await page.waitForTimeout(220);
      for (const o of await page.evaluate(probeOcclusion, true)) {
        const key = `${o.float}→${o.covered}`;
        if (seen.has(key)) continue;
        seen.add(key);
        problems.push(`${tag} ${path}: "${o.float}" 가 누를 수 있는 "${o.covered}" 를 덮음`);
      }
    }

    // 글자는 맨 아래까지 내린 뒤에도 덮여 있을 때만 — 그건 영영 못 읽는 것이다.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(250);
    for (const o of await page.evaluate(probeOcclusion, false)) {
      problems.push(`${tag} ${path}: "${o.float}" 가 "${o.covered}" 를 덮음`);
    }

    // 탭 타깃은 폰에서만 문제다(마우스는 정확하다).
    // **페이지를 끝까지 굴려 가며** 본다 — 첫 화면만 재면 스크롤 아래의 작은 것을 놓친다.
    // (계획 준비물의 20px 체크 동그라미가 그래서 안 잡혔다.)
    if (w < 1024) {
      const seenTap = new Set();
      const steps = await page.evaluate((vh) =>
        Math.min(12, Math.ceil(document.documentElement.scrollHeight / (vh * 0.8))), h);
      for (let i = 0; i < Math.max(1, steps); i++) {
        await page.evaluate(([vh, n]) => window.scrollTo(0, vh * 0.8 * n), [h, i]);
        await page.waitForTimeout(200);
        const { small, stolen } = await page.evaluate(probeTapTargets);
        for (const s2 of small) {
          const key = "s" + s2.label + s2.보임;
          if (seenTap.has(key)) continue;
          seenTap.add(key);
          problems.push(`${tag} ${path}: "${s2.label}" 이 작다 — 보임 ${s2.보임}, 눌림 ${s2.눌림} (40px 이상이어야)`);
        }
        for (const s2 of stolen) {
          const key = "t" + s2.label + s2.by;
          if (seenTap.has(key)) continue;
          seenTap.add(key);
          problems.push(`${tag} ${path}: "${s2.label}" 한가운데를 누르면 "${s2.by}" 가 눌린다`);
        }
      }
    }

    // `…` 메뉴는 폰에서만 뜬다.
    if (w < 1024) {
      await page.evaluate(() => window.scrollTo(0, 0));
      const more = page.getByRole("button", { name: "더보기" }).first();
      if (await more.count()) {
        await more.click().catch(() => {});
        await page.waitForTimeout(300);
        for (const bad of await page.evaluate(probeMenu)) {
          problems.push(`${tag} ${path}: "${bad.label}" 가 ${bad.why}`);
        }
        // 바깥을 눌러 닫히는지 — 메뉴 밖 왼쪽 위를 누른다.
        await page.mouse.click(20, 300);
        await page.waitForTimeout(250);
        if (await page.evaluate(() => !!document.querySelector('[data-item-menu]'))) {
          problems.push(`${tag} ${path}: \`…\` 메뉴가 바깥을 눌러도 닫히지 않음`);
        }
      }
    }
    } catch (e) {
      problems.push(`${tag} ${path}: 재다가 멈췄습니다 — ${String(e).split("\n")[0].slice(0, 90)}`);
    }
  }
  await ctx.close();
  })
);
// 폭이 섞여 들어왔으니 표를 폭 순으로 다시 세운다(한 폭 안의 차례는 그대로다 — 안정 정렬).
{
  const order = new Map(WIDTHS.map((x, i) => [x.tag, i]));
  rows.sort((a, b) => (order.get(a.tag) ?? 0) - (order.get(b.tag) ?? 0));
}

// ── 글자 확대 ────────────────────────────────────────────
// 브라우저·폰의 "글자 크기" 를 키운 사람에게도 읽혀야 한다. 화면 확대(zoom)와 달리
// 글자만 커지므로 한 줄에 밀어 넣은 레이아웃이 깨진다 — 장보기 "우유" 가 "두" 로
// 잘렸던 적이 있다. 크기 단위가 px 면 아예 안 커지는데, 그건 그것대로 위계가 깨진다.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  if (USER && PASS) {
    await page.goto(BASE + "/login");
    // 로그인은 **이름이 아니라 구조로** 짚는다. 칸 이름이 깨지는 것이 바로 이 검사가
    // 잡으려는 것인데, 로그인 자체가 이름에 기대고 있으면 깨진 순간 스크립트가
    // 통째로 죽어 나머지 검사가 전부 안 돌았다 — 한 가지 고장이 눈 전체를 가렸다.
    await page.locator('input[autocomplete="username"]').fill(USER);
    await page.locator('input[autocomplete="current-password"]').fill(PASS);
    await page.getByRole("button", { name: "로그인" }).click();
    await page.waitForURL(BASE + "/", { timeout: 15000 });
  }
  for (const path of PATHS) {
    await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
    await page.addStyleTag({ content: "html { font-size: 24px !important; }" });
    await page.waitForTimeout(350);
    // 진짜 먹었는지 확인하고 센다 — 안 먹은 채로 "이상 없음" 이라 하면 안 된다.
    const root = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    if (root < 23) {
      problems.push(`글자 확대: ${path} 에서 확대가 적용되지 않아 재지 못했다`);
      continue;
    }
    const { over, cut } = await page.evaluate(() => {
      const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const cut = [];
      for (const el of document.querySelectorAll("*")) {
        if (el.children.length) continue;
        const t = (el.textContent || "").trim();
        if (t.length < 2) continue;
        if (el.getBoundingClientRect().width < 4) continue;
        // 반 넘게 잘려 못 읽는 것만 — 긴 이름이 말줄임되는 건 정상이다.
        if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth * 2) {
          cut.push(`${t.slice(0, 12)}(${el.clientWidth}<${el.scrollWidth})`);
        }
      }
      return { over, cut: [...new Set(cut)].slice(0, 4) };
    });
    if (over > 0) problems.push(`글자 확대: ${path} 가로 스크롤 ${over}px`);
    for (const c of cut) problems.push(`글자 확대: ${path} 에서 "${c}" 가 반 넘게 잘린다`);
  }
  await ctx.close();
}

// ── 키보드 ──────────────────────────────────────────────
// 포커스 표시가 없으면 탭으로 다닐 때 지금 어디인지 알 수 없고,
// 떠 있는 판(모달·시트·드로어)이 탭을 가두지 않으면 보이지도 않는 뒤쪽 화면으로
// 포커스가 새어 나가 엉뚱한 곳에서 엔터가 눌린다.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  if (USER && PASS) {
    await page.goto(BASE + "/login");
    // 로그인은 **이름이 아니라 구조로** 짚는다. 칸 이름이 깨지는 것이 바로 이 검사가
    // 잡으려는 것인데, 로그인 자체가 이름에 기대고 있으면 깨진 순간 스크립트가
    // 통째로 죽어 나머지 검사가 전부 안 돌았다 — 한 가지 고장이 눈 전체를 가렸다.
    await page.locator('input[autocomplete="username"]').fill(USER);
    await page.locator('input[autocomplete="current-password"]').fill(PASS);
    await page.getByRole("button", { name: "로그인" }).click();
    await page.waitForURL(BASE + "/", { timeout: 15000 });
  }
  await page.waitForTimeout(500);

  const focusInfo = () =>
    page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el.closest("nextjs-portal")) return null;
      const st = getComputedStyle(el);
      return {
        label: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().replace(/\s+/g, " ").slice(0, 20),
        marked: (st.outlineStyle !== "none" && parseFloat(st.outlineWidth) > 0) || st.boxShadow !== "none",
      };
    });

  const unmarked = new Set();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const f = await focusInfo();
    if (f && !f.marked) unmarked.add(f.label);
  }
  for (const label of unmarked) problems.push(`키보드: "${label}" 에 포커스 표시가 없다`);

  // 떠 있는 판이 탭을 가두는가
  const traps = [
    ["모달", async () => {
      await page.goto(BASE + "/anniversaries", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: /기념일 추가|첫 기념일/ }).first().click();
    }, ".fixed.inset-0.z-50"],
    ["인공 포동이 시트", async () => {
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      const b = page.getByRole("button", { name: "인공 포동이에게 물어보기" });
      if (await b.count()) await b.first().click(); else throw new Error("skip");
    }, '[role="dialog"][aria-label="인공 포동이에게 물어보기"]'],
  ];
  for (const [name, openIt, sel] of traps) {
    try {
      await openIt();
    } catch {
      continue; // 그 화면이 없으면 건너뛴다(예: 포동이가 꺼져 있음)
    }
    await page.waitForTimeout(800);
    const leaked = new Set();
    for (let i = 0; i < 22; i++) {
      await page.keyboard.press("Tab");
      const out = await page.evaluate((s) => {
        const el = document.activeElement;
        const panel = document.querySelector(s);
        if (!el || !panel || el.closest("nextjs-portal")) return null;
        return panel.contains(el) ? null : (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 18);
      }, sel);
      if (out) leaked.add(out);
    }
    for (const l of leaked) problems.push(`키보드: ${name} 이 열려 있는데 탭이 "${l}" 로 새어 나간다`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
  await ctx.close();
}

// ── 줄바꿈 ──────────────────────────────────────────────
// 한글은 **어절 단위로** 끊어야 읽힌다. 브라우저 기본값은 CJK 를 글자 아무 데서나
// 잘라서 "무엇이든 좋 / 아요." 가 된다 — 폰 1곳·데스크톱 6곳에서 그러고 있었고,
// 스크린샷으로는 눈에 잘 안 띄는 종류의 흉함이다.
// 재는 법: 글자 한 자씩 Range 를 잡아 top 이 바뀌는 지점을 찾고, 그 경계의 앞뒤가
// 둘 다 한글이면(= 띄어쓰기가 아니면) 낱말 한가운데서 끊긴 것이다.
{
  const scan = () => {
    const HANGUL = /[\uac00-\ud7a3]/;
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = node.nodeValue;
      if (!t || t.trim().length < 4 || !HANGUL.test(t)) continue;
      if (!node.parentElement || !node.parentElement.offsetParent) continue;
      if (node.parentElement.closest("nextjs-portal")) continue;
      const r = new Range();
      let prevTop = null;
      for (let i = 0; i < t.length; i++) {
        r.setStart(node, i);
        r.setEnd(node, i + 1);
        const rect = r.getBoundingClientRect();
        if (!rect.height) continue;
        const top = Math.round(rect.top);
        if (prevTop !== null && top > prevTop + 2 && HANGUL.test(t[i - 1]) && HANGUL.test(t[i])) {
          out.push(t.slice(Math.max(0, i - 5), i) + "/" + t.slice(i, i + 5));
        }
        prevTop = top;
      }
    }
    return [...new Set(out)].slice(0, 3);
  };
  await Promise.all(
    WIDTHS.map(async ({ w, h, tag }) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      if (USER && PASS) {
        await page.goto(BASE + "/login");
        await page.locator('input[autocomplete="username"]').fill(USER);
        await page.locator('input[autocomplete="current-password"]').fill(PASS);
        await page.getByRole("button", { name: "로그인" }).click();
        await page.waitForURL(BASE + "/", { timeout: 15000 });
      }
      for (const path of PATHS) {
        await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
        for (const bad of await page.evaluate(scan)) {
          problems.push(`${tag} ${path}: 낱말 한가운데서 줄바꿈 — …${bad}…`);
        }
      }
      await ctx.close();
    })
  );
}

// ── 글자 대비 (화면에 그려진 대로) ──────────────────────
// `lib/colors.contrast.test.ts` 는 **토큰 짝** 을 잰다 — "로즈 잉크가 로즈 soft 위에서".
// 그런데 진짜 문제는 **어느 잉크가 어느 판에 얹혔느냐** 다. 사이드바의 파스텔 잉크는
// 흰 판 위에 놓이는데 그 짝은 아무도 안 재고 있었고, 그래서 37곳이 통과한 채 나갔다.
// 여기서는 조상들을 타고 올라가 실제 배경을 합성해서 잰다.
// 이모지는 제 색으로 그려지므로 `color` 를 재 봐야 뜻이 없다 — 뺀다.
{
  const scan = () => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]; return (hi + 0.05) / (lo + 0.05); };
    const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
    // 사진·그라디언트 위 글자는 한 색으로 잴 수 없다 — 건너뛴다(눈으로 본다).
    const bgOf = (el) => {
      let cur = el, acc = null;
      while (cur) {
        const cs = getComputedStyle(cur);
        if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
        const c = parse(cs.backgroundColor);
        if (c && c.a > 0) {
          acc = acc ? over(acc, c) : c;
          if (acc.a >= 0.999) return acc;
        }
        cur = cur.parentElement;
      }
      return null;
    };
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el.children.length || el.closest("nextjs-portal")) continue;
      const text = (el.textContent || "").trim();
      if (!text) continue;
      if (!text.replace(/[\p{Extended_Pictographic}\p{Emoji_Component}️‍\s]/gu, "")) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.opacity === "0") continue;
      const fg = parse(cs.color);
      if (!fg || fg.a === 0) continue;
      const bg = bgOf(el);
      if (!bg) continue;
      const size = parseFloat(cs.fontSize);
      const need = size >= 24 || (size >= 18.66 && (Number(cs.fontWeight) || 400) >= 700) ? 3 : 4.5;
      const cr = ratio(fg.a < 1 ? over(fg, bg) : fg, bg);
      if (cr < need) out.push(`"${text.slice(0, 14)}" ${cr.toFixed(2)}:1 (${need} 필요, ${Math.round(size)}px)`);
    }
    return [...new Set(out)].slice(0, 5);
  };

  // ── 판이 판 위에서 보이는가 ─────────────────────────────
  // 대비(명도)만으로는 못 가른다: 라벤더 쪽지는 분홍 페이지와 대비 1.03 이지만
  // **색상이 달라** 잘 보인다. 사람 눈에 가까운 ΔE(Lab 거리)로 잰다.
  // 이 판의 기준선은 9.3 — 포동이의 흰 카드가 대화 바탕에서 떨어진 만큼이다.
  // 하루에 네 번 같은 것에 걸렸다: 오류 토스트 2.9 · 내 말풍선 3.1 ·
  // 로즈 쪽지 2.9 · 캘린더 "오늘" 3.1. 전부 "연한 판을 연한 판 위에" 였다.
  const plates = () => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
    const lab = (c) => {
      const r = lin(c.r), g = lin(c.g), b = lin(c.b);
      const X = r * 0.4124 + g * 0.3576 + b * 0.1805, Y = r * 0.2126 + g * 0.7152 + b * 0.0722, Z = r * 0.0193 + g * 0.1192 + b * 0.9505;
      const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
      const fx = f(X / 0.95047), fy = f(Y), fz = f(Z / 1.08883);
      return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
    };
    const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
    const bgFrom = (el) => {
      let cur = el, acc = null;
      while (cur) {
        const cs = getComputedStyle(cur);
        if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
        const c = parse(cs.backgroundColor);
        if (c && c.a > 0) { acc = acc ? over(acc, c) : c; if (acc.a >= 0.999) return acc; }
        cur = cur.parentElement;
      }
      return null;
    };
    const key = (c) => `${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)}`;
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el.closest("nextjs-portal")) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.opacity === "0") continue;
      if (cs.backgroundImage && cs.backgroundImage !== "none") continue;
      const own = parse(cs.backgroundColor);
      if (!own || own.a === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height < 1600) continue;                 // 작은 점·막대는 판이 아니다
      if ((parseFloat(cs.borderTopLeftRadius) || 0) < 4) continue; // 둥근 "판" 만
      const behind = bgFrom(el.parentElement);
      if (!behind) continue;
      const plate = own.a < 1 ? over(own, behind) : own;
      if (key(plate) === key(behind)) continue;                // 같은 색이면 분리하려던 게 아니다
      // 판은 **채움 아니면 가장자리**로 정의된다. 테두리가 충분히 떨어져 있으면 형태는 보인다.
      const bw = parseFloat(cs.borderTopWidth) || 0;
      const bc = parse(cs.borderTopColor);
      const edge = bw >= 1 && bc && bc.a > 0 ? dE(bc.a < 1 ? over(bc, behind) : bc, behind) : 0;
      const d = dE(plate, behind);
      if (d < 7 && edge < 7) {
        const label = (el.getAttribute("aria-label") || (el.textContent || "").trim() || el.tagName).slice(0, 18);
        out.push(`"${label}" ΔE ${d.toFixed(1)} (테두리 ${edge.toFixed(1)}) ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    return [...new Set(out)].slice(0, 4);
  };

  // ── 버튼 글자가 두 줄로 접히는가 ─────────────────────────
  // 꾸미기 툴바의 `사진 추가` 가 알약 안에서 **"사진 / 추가"** 로 접혀 있었다.
  // 손으로 만든 <button> 이라 `Button` 의 `whitespace-nowrap` 이 없었던 것.
  // **직접 붙은 글자**만 본다 — 제목·설명이 각각 자식으로 들어간 메뉴 항목은 원래 두 줄이다.
  const wrapped = () => {
    const out = [];
    for (const el of document.querySelectorAll("button,a[href]")) {
      if (el.closest("nextjs-portal")) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const direct = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue.trim()).join(" ").trim();
      if (!direct || direct.length < 2) continue;
      const range = document.createRange();
      let lines = 0;
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.nodeValue.trim()) continue;
        range.selectNodeContents(n);
        lines = Math.max(lines, new Set([...range.getClientRects()].map((x) => Math.round(x.top))).size);
      }
      if (lines > 1) out.push(`"${direct.slice(0, 18)}" ${lines}줄`);
    }
    return [...new Set(out)].slice(0, 4);
  };

  // 꾸미기 모드에 **실제로 들어가 봤는지** 센다. 0이면 검사가 조용히 아무것도 안 한 것이다 —
  // 그런 검사는 "문제 없음" 이라고 말하면서 아무것도 지키지 않는다. 오늘 두 번 당했다.
  let decoVisits = 0;
  await Promise.all(
    WIDTHS.filter((x) => x.w !== 768).map(async ({ w, h, tag }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    if (USER && PASS) {
      await page.goto(BASE + "/login");
      await page.locator('input[autocomplete="username"]').fill(USER);
      await page.locator('input[autocomplete="current-password"]').fill(PASS);
      await page.getByRole("button", { name: "로그인" }).click();
      await page.waitForURL(BASE + "/", { timeout: 15000 });
    }
    for (const path of PATHS) {
      await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
      for (const bad of await page.evaluate(scan)) problems.push(`${tag} ${path}: 대비 부족 — ${bad}`);
      for (const bad of await page.evaluate(plates)) problems.push(`${tag} ${path}: 판이 바탕에 묻힌다 — ${bad}`);
      for (const bad of await page.evaluate(wrapped)) problems.push(`${tag} ${path}: 버튼 글자가 접힌다 — ${bad}`);

      // **꾸미기 모드도 본다.** 감사가 한 번도 안 들어가 본 화면이고, 실제로 거기서
      // `사진 추가` 가 두 줄로 접히고 `완료` 가 36px(규칙은 40px)이었다.
      const deco = page.getByRole("button", { name: /^(꾸미기|이 페이지 꾸미기)$/ }).first();
      // 꾸미기를 켜기 **전에** 있던 조작들을 적어 둔다 — 켠 뒤에 새로 생긴 것만 재려고.
      // 본문의 체크 동그라미까지 재면 뜻이 없다: 스티커 층이 위에 깔려 `elementFromPoint`
      // 로 짚어 나가는 측정이 막혀 24×24 로 나오는데, 꾸미는 중에 할일을 누를 일도 없다.
      const beforeDeco = new Set(
        await page.evaluate(() =>
          [...document.querySelectorAll("button, a[href], [role='checkbox']")].map(
            (e) => (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 20)
          )
        )
      );
      if (await deco.isVisible().catch(() => false)) {
        await deco.click().catch(() => {});
        await page.waitForTimeout(700);
        // 툴바가 떴는지로 확인한다 — 버튼만 누르고 모드가 안 켜졌으면 아래 검사가 공허하다.
        if (await page.getByRole("button", { name: "마치기" }).first().isVisible().catch(() => false)) decoVisits++;
        for (const bad of await page.evaluate(wrapped)) problems.push(`${tag} ${path}(꾸미기): 버튼 글자가 접힌다 — ${bad}`);
        for (const bad of await page.evaluate(scan)) problems.push(`${tag} ${path}(꾸미기): 대비 부족 — ${bad}`);
        // 탭 타깃은 **같은 probe** 로 잰다. 손으로 쓴 스캔은 globals.css 가 넓혀 둔 누름 영역을
        // 모르고 보이는 크기만 재서, 24px 짜리 체크 동그라미를 전부 오류로 올렸다.
        if (w < 1024) {
          // 데스크톱은 마우스라 36px 을 허용한다(DESIGN.md §9) — 폰에서만 잡는다.
          const { small } = await page.evaluate(probeTapTargets);
          for (const s of small) {
            if (beforeDeco.has(s.label)) continue; // 꾸미기가 만든 것만 — 본문은 이미 위에서 쟀다
            problems.push(`${tag} ${path}(꾸미기): "${s.label}" 이 작다 — 눌림 ${s.눌림}`);
          }
        }
        await page.getByRole("button", { name: "마치기" }).first().click().catch(() => {});
        // 편집 상태는 localStorage 에 남는다 — 다음 화면이 꾸미기로 열리지 않게 지운다.
        await page.evaluate(() => { try { localStorage.removeItem("podong_edit_mode"); } catch {} });
        await page.waitForTimeout(350);
      }

      // **모달 안도 본다.** 겹쳐 뜨는 판은 목록 화면을 훑는 것만으로는 한 번도 안 재진다 —
      // 오류 토스트가 페이지와 1.02:1 인 채로 오래 살아남은 것이 그래서였다(그건 눈으로 찾았다).
      const opener = page.getByRole("button", { name: /추가|만들기|남기기|새 / }).first();
      if (await opener.isVisible().catch(() => false)) {
        await opener.click().catch(() => {});
        await page.waitForTimeout(600);
        if (await page.locator('[role="dialog"]').first().isVisible().catch(() => false)) {
          for (const bad of await page.evaluate(scan)) {
            problems.push(`${tag} ${path}(모달): 대비 부족 — ${bad}`);
          }
          for (const bad of await page.evaluate(plates)) {
            problems.push(`${tag} ${path}(모달): 판이 바탕에 묻힌다 — ${bad}`);
          }
        }
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(350);
      }
    }
    await ctx.close();
    })
  );
  if (decoVisits === 0) {
    problems.push("꾸미기 모드에 한 번도 못 들어갔습니다 — 그 검사는 아무것도 보지 못했습니다");
  }
}

// ── 탭 제목과 제목 구조 ──────────────────────────────────
// 열 화면이 전부 `포동 · 우리 가족 공간` 한 줄이었다 — 탭도, 즐겨찾기도, 방문 기록도,
// 뒤로가기 목록도 같은 글자라 어느 게 어느 화면인지 알 수 없었다.
// `/baby` 는 `h1` 이 아예 없었다(자체 히어로라 `PageHeader` 를 안 쓴다) — 스크린리더로
// 들어오면 이 화면이 무엇인지 말해 주는 줄이 하나도 없다.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  if (USER && PASS) {
    await page.goto(BASE + "/login");
    await page.locator('input[autocomplete="username"]').fill(USER);
    await page.locator('input[autocomplete="current-password"]').fill(PASS);
    await page.getByRole("button", { name: "로그인" }).click();
    await page.waitForURL(BASE + "/", { timeout: 15000 });
  }
  const seen = new Map();
  // 상세 화면(앨범·계획)까지 본다 — **가족이 실제로 즐겨찾기 하는 자리**인데
  // 목록 화면의 제목이 자식 구간으로 안 내려와서 루트 기본값이 그대로 나오고 있었다.
  const titlePaths = [...PATHS, ...(USER && PASS ? await detailPaths(page) : [])];
  for (const path of titlePaths) {
    await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
    const title = (await page.title()).trim();
    const h1 = await page.evaluate(() => document.querySelectorAll("h1").length);
    if (!title) problems.push(`${path}: 탭 제목이 비었다`);
    else {
      const other = seen.get(title);
      if (other) problems.push(`${path}: 탭 제목이 ${other} 과 같다 — "${title}"`);
      else seen.set(title, path);
    }
    if (h1 !== 1) problems.push(`${path}: h1 이 ${h1}개 (하나여야 한다)`);
  }
  await ctx.close();
}

await browser.close();

if (writes.length) {
  const counts = writes.reduce((m, w) => { m[w] = (m[w] || 0) + 1; return m; }, {});
  for (const [what, n] of Object.entries(counts)) {
    problems.push(`감사가 **쓰기 요청**을 보냈습니다 (${n}회): ${what} — 감사는 읽기만 해야 합니다`);
  }
}

console.table(rows);
if (problems.length === 0) {
  console.log("✓ 가로 스크롤 없음 · 가려지는 것 없음 · `…` 메뉴 정상 · 탭 타깃 40px 이상 · 키보드 정상 · 글자 1.5배에서도 읽힘 · 입력칸에 이름 있음 · 한글이 어절로 끊김 · 그려진 글자가 전부 AA · 판이 바탕에서 떠 보임 · 버튼 글자가 한 줄 · 꾸미기 모드도 정상 · 화면마다 탭 제목이 다르고 h1 이 하나");
} else {
  console.log(`⚠ ${problems.length}건`);
  for (const p of problems) console.log("  -", p);
  process.exitCode = 1;
}
