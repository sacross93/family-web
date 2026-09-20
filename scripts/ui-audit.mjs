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
// 쓰기:  npm run dev  (다른 터미널)
//        node scripts/ui-audit.mjs [기준URL] [아이디] [비밀번호]
//
// playwright 는 이 저장소의 의존성이 아니다(브라우저 내려받기가 무겁다).
// 이미 깔린 것을 찾아 쓰고, 없으면 `npx playwright install chromium` 을 알려 준다.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const BASE = process.argv[2] || "http://localhost:3000";
const USER = process.argv[3] || process.env.AUDIT_USER;
const PASS = process.argv[4] || process.env.AUDIT_PASS;

const PATHS = [
  "/", "/todos", "/shopping", "/albums", "/calendar",
  "/baby", "/board", "/anniversaries", "/plans",
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
  // 사이드바는 lg(1024px)부터다. 그 아래 태블릿은 폰과 같은 셸(상단바 + 하단 탭바)을
  // 쓰면서 격자만 2열이 된다 — 둘 다 검사해 봐야 안다.
  { w: 768, h: 1024, tag: "태블릿" },
  { w: 1280, h: 900, tag: "데스크톱" },
];

/** 이미 깔린 playwright 를 찾는다. 없으면 null. */
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

const pwPath = findPlaywright();
if (!pwPath) {
  console.error("playwright 를 못 찾았어요. `npx playwright install chromium` 뒤에 다시 돌려 주세요.");
  process.exit(1);
}
const { chromium } = await import(pwPath);

const browser = await chromium.launch({ executablePath: findChromium() });
const problems = [];
const rows = [];

for (const { w, h, tag } of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();

  if (USER && PASS) {
    await page.goto(BASE + "/login");
    await page.getByRole("textbox", { name: "아이디" }).fill(USER);
    await page.getByRole("textbox", { name: "비밀번호" }).fill(PASS);
    await page.getByRole("button", { name: "로그인" }).click();
    await page.waitForURL(BASE + "/", { timeout: 15000 });
  }

  const paths = [...PATHS, ...(USER && PASS ? await detailPaths(page) : [])];

  for (const path of paths) {
    await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(250);

    const { height, overflow } = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    rows.push({ tag, path, height, screens: +(height / h).toFixed(1), overflow });
    if (overflow > 0) problems.push(`${tag} ${path}: 가로 스크롤 ${overflow}px`);

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
  }
  await ctx.close();
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
    await page.getByRole("textbox", { name: "아이디" }).fill(USER);
    await page.getByRole("textbox", { name: "비밀번호" }).fill(PASS);
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
    await page.getByRole("textbox", { name: "아이디" }).fill(USER);
    await page.getByRole("textbox", { name: "비밀번호" }).fill(PASS);
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
    ["포동이 시트", async () => {
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      const b = page.getByRole("button", { name: "포동이에게 물어보기" });
      if (await b.count()) await b.first().click(); else throw new Error("skip");
    }, '[role="dialog"][aria-label="포동이에게 물어보기"]'],
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

await browser.close();

console.table(rows);
if (problems.length === 0) {
  console.log("✓ 가로 스크롤 없음 · 가려지는 것 없음 · `…` 메뉴 정상 · 탭 타깃 40px 이상 · 키보드 정상 · 글자 1.5배에서도 읽힘");
} else {
  console.log(`⚠ ${problems.length}건`);
  for (const p of problems) console.log("  -", p);
  process.exitCode = 1;
}
