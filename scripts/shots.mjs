// 화면 사진만 찍는다. 읽기만 한다 — 아무것도 올리거나 지우지 않는다.
// 사용: node scripts/shots.mjs <주소> <저장폴더> [경로,경로,...]
import { mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// playwright 는 이 저장소의 의존성이 아니다 — 깔린 것을 찾아 쓴다(ui-audit.mjs 와 같은 방식).
function newestShell() {
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  if (!existsSync(cache)) return null;
  const dirs = readdirSync(cache)
    .filter((d) => d.startsWith("chromium_headless_shell-"))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const d of dirs) {
    const exe = join(cache, d, "chrome-headless-shell-mac-arm64/chrome-headless-shell");
    if (existsSync(exe)) return exe;
  }
  return null;
}

function playwrightPaths() {
  const out = [];
  for (const root of [join(process.cwd(), "node_modules"), join(homedir(), ".npm/_npx")]) {
    if (!existsSync(root)) continue;
    const direct = join(root, "playwright/index.mjs");
    if (existsSync(direct)) out.push(direct);
    for (const d of readdirSync(root)) {
      const p = join(root, d, "node_modules/playwright/index.mjs");
      if (existsSync(p)) out.push(p);
    }
  }
  return out;
}

// 깔려 있는 playwright 가 여러 벌이고 **브라우저가 받아져 있는 것**은 그중 일부다.
// 실제로 떠 보는 것으로 고른다 — 없는 쪽을 잡으면 "Executable doesn't exist" 로 죽는다.
async function launch() {
  const tried = [];
  for (const p of playwrightPaths()) {
    try {
      const { chromium } = await import(p);
      // 받아져 있는 헤드리스 셸 중 가장 최신을 직접 짚는다 — playwright 판본이 기대하는
      // 번호와 실제로 받아져 있는 번호가 어긋나 있어도 뜨게.
      const exe = newestShell();
      return { browser: await chromium.launch(exe ? { executablePath: exe } : {}), from: p };
    } catch (e) {
      tried.push(`${p}: ${String(e).split("\n")[0]}`);
    }
  }
  throw new Error("띄울 수 있는 playwright 없음\n" + tried.join("\n"));
}

const BASE = process.argv[2] || "http://localhost:3000";
const OUT = process.argv[3] || "/tmp/shots";
const PATHS = (process.argv[4] || "/,/baby,/shopping,/albums").split(",");
const ID = process.env.PODONG_ID || "wlsdud022";
const PW = process.env.PODONG_PW || "960208";

mkdirSync(OUT, { recursive: true });

const { browser, from } = await launch();
console.log(`playwright: ${from}`);
for (const [tag, width, height] of [["phone", 390, 844], ["desk", 1280, 900]]) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: tag === "phone",
    hasTouch: tag === "phone",
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[autocomplete="username"]', ID);
  await page.fill('input[autocomplete="current-password"]', PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  for (const p of PATHS) {
    await page.goto(BASE + p, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(700);
    const name = p === "/" ? "home" : p.replace(/\//g, "_").replace(/^_/, "");
    await page.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage: false });
    console.log(`${tag} ${p}`);
  }
  await ctx.close();
}
await browser.close();
