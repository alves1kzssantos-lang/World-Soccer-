// Capturas da interface (Playwright): node tools/art/shots.mjs <saida> <url_base>
import { createRequire } from "module";
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || "playwright");
const [out, url] = process.argv.slice(2);
const b = await chromium.launch();
const sizes = [["phone", { viewport: { width: 915, height: 412 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true }], ["hd", { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }]];
for (const [tag, opt] of sizes) {
  const ctx = await b.newContext(opt);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  for (const s of ["title", "hub", "squad", "store", "finance", "lineup", "press", "social", "cups", "table", "player"]) {
    await p.goto(`${url}tools/art/ui-preview.html?s=${s}`);
    await p.waitForFunction(() => window.__ready, null, { timeout: 20000 });
    if (s === "player") await p.evaluate(() => { window.__ui.nav.reset("player", 1); });
    await p.waitForTimeout(1700);
    await p.screenshot({ path: `${out}/${tag}_${s}.png` });
    if (s === "store") {
      await p.locator(".pack .btn").nth(1).click();
      await p.waitForTimeout(400);
      await p.locator(".modal .btn.primary").click();
      await p.waitForTimeout(1700);
      await p.screenshot({ path: `${out}/${tag}_store_abrindo.png` });
    }
  }
  console.log(tag, "erros:", errs.length ? errs.slice(0, 5) : "nenhum");
  await ctx.close();
}
await b.close();
