// Fluxo real (carreira de verdade): nova carreira → hub → elenco → loja (abre pack) → finanças → simula jogo → pós-jogo → coletiva.
import { createRequire } from "module";
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || "playwright");
const [out, url] = process.argv.slice(2);
const b = await chromium.launch();
for (const [tag, opt] of [["phone", { viewport: { width: 915, height: 412 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true }], ["hd", { viewport: { width: 1280, height: 720 } }]]) {
  const ctx = await b.newContext(opt);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(`${url}tools/art/ui-preview.html`);
  await p.waitForFunction(() => window.__ready, null, { timeout: 60000 });
  await p.waitForTimeout(800);
  const shot = async (n) => { await p.waitForTimeout(700); await p.screenshot({ path: `${out}/real_${tag}_${n}.png` }); };
  await shot("titulo");
  const t0 = Date.now();
  await p.evaluate(() => { const { ctx } = window.__ui; ctx.api.newCareer(0, "tecnico", 0, 0, { name: "Alves", skin: 2, hstyle: 1, hcolor: 0 }); ctx.nav.reset("hub"); });
  console.log(tag, "nova carreira ms", Date.now() - t0);
  await shot("hub");
  await p.evaluate(() => window.__ui.ctx.nav.go("squad")); await shot("elenco");
  await p.evaluate(() => window.__ui.ctx.nav.reset("store")); await shot("loja");
  await p.locator(".pack .btn").first().click(); await p.waitForTimeout(300);
  await p.locator(".modal .btn.primary").click(); await p.waitForTimeout(1800); await shot("loja_abrindo");
  await p.locator(".reveal .btn").click();
  await p.evaluate(() => window.__ui.ctx.nav.reset("finance")); await shot("financas");
  await p.evaluate(() => { const { ctx } = window.__ui; ctx.nav.reset("postmatch", ctx.api.simulateMatch()); }); await shot("posjogo");
  await p.evaluate(() => window.__ui.ctx.nav.reset("press")); await shot("coletiva");
  await p.evaluate(() => window.__ui.ctx.nav.reset("table")); await shot("tabela");
  await p.evaluate(() => window.__ui.ctx.nav.reset("cups")); await shot("copas");
  await p.evaluate(() => window.__ui.ctx.nav.reset("social")); await shot("redes");
  await p.evaluate(() => window.__ui.ctx.nav.reset("lineup")); await shot("escalacao");
  console.log(tag, "erros:", errs.length ? errs.slice(0, 6) : "nenhum");
  await ctx.close();
}
await b.close();
