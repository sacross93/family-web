// 화면을 **써 본다** — 보는 것으로는 못 찾는 것들이 있다.
//
// 세 번 연속 그랬다:
//   - 아기: 기록은 써지는데 **고치기가 안 됐다**. `…` 가 떠 있던 버튼에 덮여
//     누르면 AI 채팅이 열렸다.
//   - 계획: 아래로 내려간 채 `…` 를 누르면 **아무 일도 안 일어났다**.
//     메뉴가 열리자마자 스크롤 이벤트에 스스로 닫혔다(폰의 관성 스크롤에서도 같다).
//   - 장보기: 체크가 되는지 "담은 것" 글자만 보고 넘어갔는데, 그건 이미 있던 글자라
//     검사가 공허하게 통과했다.
// 스크린샷은 이런 것을 하나도 안 알려 준다.
//
// 쓰기:  npm run dev  (다른 터미널)
//        node scripts/ui-flows.mjs [기준URL] [아이디] [비밀번호]
//
// **로컬에서만 돌릴 것.** 실제로 만들고 지운다. 만든 것은 각 흐름 끝에서 되돌린다.
// playwright 찾는 방법은 ui-audit.mjs 와 같다.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const BASE = process.argv[2] || "http://localhost:3000";
const USER = process.argv[3] || process.env.AUDIT_USER;
const PASS = process.argv[4] || process.env.AUDIT_PASS;
const MARK = "포동UI점검";

if (!USER || !PASS) {
  console.error("사용법: node scripts/ui-flows.mjs [기준URL] <아이디> <비밀번호>");
  process.exit(1);
}
if (!/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error("이 스크립트는 실제로 만들고 지웁니다. 로컬에서만 돌려 주세요.");
  process.exit(1);
}

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
  console.error("playwright 를 못 찾았어요. `npx playwright install chromium` 뒤에 다시.");
  process.exit(1);
}
const { chromium } = await import(pw);

const browser = await chromium.launch({ executablePath: findChromium() });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message.slice(0, 110)));
page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 110)));
page.on("dialog", (d) => d.accept());

let failed = 0;
const step = async (name, fn) => {
  try {
    await fn();
    console.log("  ✓", name);
  } catch (e) {
    failed++;
    console.log("  ✗", name, "—", String(e).split("\n")[0].slice(0, 130));
  }
};

/** 그 카드의 `…` 를 연다. 카드가 어느 레이아웃에 있든 글로 찾는다. */
const openMenu = async (root, text) => {
  const idx = await page.evaluate(
    ([sel, t]) => [...document.querySelectorAll(sel)].findIndex((n) => (n.textContent || "").includes(t)),
    [root, text]
  );
  if (idx < 0) throw new Error("카드를 못 찾겠다");
  await page.locator(root).nth(idx).getByRole("button", { name: "더보기" }).click();
  await page.waitForTimeout(350);
};
const menuItem = (label) => page.locator(`[data-item-menu] button:has-text("${label}")`);
const text = () => page.evaluate(() => document.body.innerText);

await page.goto(BASE + "/login");
await page.getByRole("textbox", { name: "아이디" }).fill(USER);
await page.getByRole("textbox", { name: "비밀번호" }).fill(PASS);
await page.getByRole("button", { name: "로그인" }).click();
await page.waitForURL(BASE + "/");

// ── 장보기 ──────────────────────────────────────────────
console.log("장보기");
await page.goto(BASE + "/shopping", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const NAME = MARK + "두부";

// 어느 칸에 있는지 체크 상태로 본다 — "담은 것" 글자는 이미 있을 수 있어 공허하다.
const whereIs = (n) =>
  page.evaluate((x) => {
    const row = [...document.querySelectorAll("li")].find((li) => (li.textContent || "").includes(x));
    if (!row) return "없음";
    return row.querySelector('[role="checkbox"]')?.getAttribute("aria-checked") === "true" ? "담은 것" : "살 것";
  }, n);

await step("이름만 적고 엔터로 담기", async () => {
  const i = page.getByPlaceholder(/무엇을 살까요/);
  await i.fill(NAME);
  await i.press("Enter");
  await page.waitForTimeout(800);
  if ((await whereIs(NAME)) !== "살 것") throw new Error("담은 게 안 보인다");
  if ((await i.inputValue()) !== "") throw new Error("담은 뒤 입력칸이 안 비워졌다");
});

await step("체크하면 담은 것으로", async () => {
  await page.getByRole("checkbox", { name: NAME }).first().click();
  await page.waitForTimeout(900);
  if ((await whereIs(NAME)) !== "담은 것") throw new Error("안 옮겨졌다");
});

await step("완료 비우기 — 새로고침해도 안 되살아난다", async () => {
  await page.getByRole("button", { name: /완료 .*비우기/ }).click();
  await page.waitForTimeout(1000);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  if ((await whereIs(NAME)) !== "없음") throw new Error("서버엔 안 지워졌다");
});

// ── 게시판 ──────────────────────────────────────────────
console.log("게시판");
await page.goto(BASE + "/board", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const NOTES = "[class*='columns'] > *";

await step("접힌 작성칸을 펼쳐 마크다운으로 쓰기", async () => {
  await page.getByRole("button", { name: /한마디 남기기/ }).click();
  await page.waitForTimeout(500);
  await page.locator("textarea").first().fill(`**${MARK}** 오늘 저녁은\n- 김치찌개\n- 계란말이`);
  await page.getByRole("button", { name: /붙이기/ }).click();
  await page.waitForTimeout(1200);
  const r = await page.evaluate((m) => {
    const el = [...document.querySelectorAll("strong")].find((e) => e.textContent.includes(m));
    return { 굵게: !!el, 목록: !!el?.closest("div")?.querySelector("li") };
  }, MARK);
  if (!r.굵게) throw new Error("**굵게** 가 글자 그대로 나온다");
  if (!r.목록) throw new Error("- 목록이 글머리로 안 바뀐다");
});

await step("붙인 뒤 작성칸이 다시 접힌다", async () => {
  if (await page.locator("textarea").first().isVisible()) throw new Error("펼친 채로 남아 있다");
});

await step("맨 위에 고정", async () => {
  await openMenu(NOTES, MARK);
  await menuItem("맨 위에 고정").click();
  await page.waitForTimeout(1000);
  const first = await page.evaluate(
    ([sel, m]) => ((document.querySelectorAll(sel)[0] || {}).textContent || "").includes(m),
    [NOTES, MARK]
  );
  if (!first) throw new Error("맨 위로 안 간다");
});

await step("고치기", async () => {
  await openMenu(NOTES, MARK);
  await menuItem("수정").click();
  await page.waitForTimeout(700);
  await page.locator("textarea").first().fill(`**${MARK}** 저녁 바꿈 — 된장찌개`);
  await page.getByRole("button", { name: /저장/ }).last().click();
  await page.waitForTimeout(1100);
  if (!(await text()).includes("된장찌개")) throw new Error("고친 게 안 보인다");
});

await step("지우기 — 새로고침해도 안 되살아난다", async () => {
  await openMenu(NOTES, MARK);
  await menuItem("삭제").click();
  await page.waitForTimeout(1100);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  if ((await text()).includes(MARK)) throw new Error("서버엔 안 지워졌다");
});

// ── 계획 ────────────────────────────────────────────────
console.log("계획");
await page.goto(BASE + "/plans", { waitUntil: "networkidle" });
await page.waitForTimeout(400);

await step("계획 만들고 상세로 들어가기", async () => {
  await page.getByRole("button", { name: /새 계획/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByLabel("제목").or(page.getByPlaceholder(/제목|예:/)).first().fill(MARK);
  await page.getByRole("button", { name: /^만들기$|^추가$|^저장$/ }).last().click();
  await page.waitForTimeout(1200);
  await page.getByText(MARK).first().click();
  await page.waitForTimeout(1200);
  if (!page.url().includes("/plans/")) throw new Error("상세로 안 간다");
});

await step("추천 칩으로 준비물 담기", async () => {
  const chip = page.getByRole("button", { name: /^\+ / }).first();
  const label = (await chip.textContent()).replace("+ ", "").trim();
  await chip.click();
  await page.waitForTimeout(900);
  if (!(await page.getByRole("checkbox", { name: label }).count())) throw new Error(`"${label}" 이 안 담겼다`);
});

await step("체크하면 '챙긴 것' 으로 접히고 펼치면 보인다", async () => {
  const i = page.getByPlaceholder("직접 추가…").first();
  await i.fill(MARK + "젖병");
  await i.press("Enter");
  await page.waitForTimeout(900);
  await page.getByRole("checkbox", { name: MARK + "젖병" }).click();
  await page.waitForTimeout(900);
  if (!(await text()).includes("챙긴 것")) throw new Error("안 접힌다");
  await page.getByRole("button", { name: /챙긴 것/ }).first().click();
  await page.waitForTimeout(400);
  if (!(await page.getByRole("checkbox", { name: MARK + "젖병" }).isVisible())) throw new Error("펼쳐도 안 보인다");
});

await step("여정 추가", async () => {
  await page.getByRole("button", { name: /일정 추가/ }).first().click();
  await page.waitForTimeout(700);
  await page.getByPlaceholder(/성산일출봉 등반|내용/).first().fill(MARK + "출발");
  await page.getByRole("button", { name: /^추가$|^저장$/ }).last().click();
  await page.waitForTimeout(1100);
  if (!(await text()).includes(MARK + "출발")) throw new Error("여정이 안 보인다");
});

await step("아래로 내려간 채로 히어로의 … 열기", async () => {
  // 관성 스크롤 중에 눌러도 열려야 한다 — 열자마자 스스로 닫히면 아무 일도 안 일어난다.
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "더보기" }).first().click();
  await page.waitForTimeout(500);
  const items = await page.evaluate(() => [...document.querySelectorAll("[data-item-menu] button")].map((b) => b.textContent.trim()));
  if (!items.includes("계획 삭제")) throw new Error("메뉴가 안 열린다: " + JSON.stringify(items));
});

await step("계획 지우기", async () => {
  await menuItem("계획 삭제").click();
  await page.waitForTimeout(1500);
  if ((await text()).includes(MARK)) throw new Error("지웠는데 남아 있다");
});

console.log(errs.length ? "\n콘솔 오류: " + JSON.stringify([...new Set(errs)]) : "\n콘솔 오류 없음");
console.log(failed === 0 ? "✓ 열여섯 단계 모두 통과" : `⚠ ${failed}단계 실패`);
if (failed) process.exitCode = 1;
await browser.close();
