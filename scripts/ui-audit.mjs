// 화면 점검 — 폰/데스크톱 두 폭에서 전 페이지를 돌며 세 가지를 잰다.
//
//   1. 가로 스크롤      (AGENTS.md: 가로 스크롤 금지)
//   2. 가려짐            떠 있는 것(하단 탭바·물어보기)이 글자나 버튼을 덮는가
//   3. 페이지 길이       몇 화면어치인가 — 짧을수록 좋다는 뜻은 아니고, 늘어나면 눈에 띄게
//
// 가려짐은 "문서 맨 아래까지 내렸을 때"만 문제로 센다. 스크롤 도중 탭바 밑으로 콘텐츠가
// 지나가는 것은 모든 모바일 앱이 그렇고, 더 내리면 보인다. 맨 아래에서도 덮여 있으면
// 그건 영영 못 보는 것이라 진짜 문제다.
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
const WIDTHS = [
  { w: 390, h: 844, tag: "폰" },
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
const probeOcclusion = () => {
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
  const leaves = [
    ...document.querySelectorAll("a, button, input, li, p, h1, h2, h3, span, td"),
  ].filter((el) => {
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
  for (const f of floats) {
    const fr = f.getBoundingClientRect();
    const label = (f.getAttribute("aria-label") || f.tagName).slice(0, 30);
    for (const el of leaves) {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;
      if (hit(fr, r)) {
        out.push({
          float: label,
          covered: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30),
        });
      }
    }
  }
  return out;
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

  for (const path of PATHS) {
    await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(250);

    const { height, overflow } = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    rows.push({ tag, path, height, screens: +(height / h).toFixed(1), overflow });
    if (overflow > 0) problems.push(`${tag} ${path}: 가로 스크롤 ${overflow}px`);

    // 맨 아래까지 내린 뒤에도 덮여 있는 것만 문제로 센다.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(250);
    for (const o of await page.evaluate(probeOcclusion)) {
      problems.push(`${tag} ${path}: "${o.float}" 가 "${o.covered}" 를 덮음`);
    }
  }
  await ctx.close();
}
await browser.close();

console.table(rows);
if (problems.length === 0) {
  console.log("✓ 가로 스크롤 없음 · 맨 아래에서 가려지는 것 없음");
} else {
  console.log(`⚠ ${problems.length}건`);
  for (const p of problems) console.log("  -", p);
  process.exitCode = 1;
}
