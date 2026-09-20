// `app/icon.svg` 하나에서 홈 화면용 PNG 를 뽑는다.
//
// 왜 PNG 가 따로 필요한가:
//  - **iOS 는 `apple-icon` 에 SVG 를 안 받는다.** 없으면 홈 화면에 **화면 캡처**가 붙는다.
//  - 안드로이드의 매니페스트 아이콘도 PNG 를 기대한다(192·512).
//
// 왜 모서리를 깎지 않는가: **기기가 알아서 깎는다.** 우리가 먼저 둥글리면 그 위에 한 번 더
// 깎여 테두리에 흰 띠가 생긴다. 그래서 여기서는 `rx` 를 빼고 정사각형을 꽉 채운다.
// 집 그림이 가운데 62%×56% 안에 있어 마스크(안쪽 80% 원)에도 안 잘린다 → `any maskable`.
//
// 쓰기: node scripts/make-icons.mjs   (색이나 그림을 바꿨을 때만)
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

function findPlaywright() {
  for (const root of [join(process.cwd(), "node_modules"), join(homedir(), ".npm/_npx")]) {
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
function findChromium() {
  for (const dir of [join(homedir(), "Library/Caches/ms-playwright"), join(homedir(), ".cache/ms-playwright")]) {
    if (!existsSync(dir)) continue;
    for (const s of readdirSync(dir).filter((d) => d.startsWith("chromium")).sort().reverse()) {
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
  return undefined;
}

const pw = findPlaywright();
if (!pw) {
  console.error("playwright 를 못 찾았어요. `npx playwright install chromium` 뒤에 다시 돌려 주세요.");
  process.exit(1);
}
const { chromium } = await import(pw);

// 모서리 깎기(rx)만 뺀 판본 — 기기가 제 모양대로 깎는다.
const svg = readFileSync("app/icon.svg", "utf8").replace(/ rx="16"/, "");

const OUT = [
  ["app/apple-icon.png", 180], // iOS 홈 화면
  ["public/icon-192.png", 192], // 안드로이드 매니페스트
  ["public/icon-512.png", 512],
];

const browser = await chromium.launch({ executablePath: findChromium() });
for (const [path, size] of OUT) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<style>html,body{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
  );
  const buf = await page.locator("svg").screenshot({ omitBackground: false });
  writeFileSync(path, buf);
  console.log(`✓ ${path}  ${size}×${size}  ${(buf.length / 1024).toFixed(1)}KB`);
  await page.close();
}
await browser.close();
