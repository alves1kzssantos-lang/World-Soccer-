// Ponta a ponta no navegador, tamanho de celular: título → nova carreira → clube → técnico → hub
// → JOGAR → ENTRAR EM CAMPO → partida (chance do usuário + chute arrastando) → fim de jogo.
// Também mede o FPS da partida (~10 s) e da demo (?demo=1).
// Uso: npm run build && node tests/e2e_match.mjs
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const OUT = process.env.SHOTS || "/tmp/claude-0/-home-user-World-Soccer-/447dabae-a03f-5bbb-b957-6b1f84032a22/scratchpad/web_match";
mkdirSync(OUT, { recursive: true });
const LOG = `${OUT}/e2e.log`;
writeFileSync(LOG, "");
const log = (...a) => { const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "); appendFileSync(LOG, s + "\n"); console.log(s); };
const server = spawn("npx", ["vite", "preview", "--port", "4182", "--strictPort"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch();
const shot = async (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, timeout: 15000 }).catch((e) => log("shot fail", name, e.message));
const perfOf = (page) => page.evaluate(() => { const p = window.__perf; return p && p.frames ? { fps: +(1000 * p.frames / p.sumMs).toFixed(1), worstMs: +p.worstMs.toFixed(1), drawMs: +(p.drawMs / p.frames).toFixed(2) } : null; });
const resetPerf = (page) => page.evaluate(() => { window.__perf ??= { frames: 0, sumMs: 0, worstMs: 0, drawMs: 0, reset() { this.frames = 0; this.sumMs = 0; this.worstMs = 0; this.drawMs = 0; } }; window.__perf.reset(); });
const clickText = async (page, t) => { await page.getByText(t, { exact: false }).first().click({ timeout: 8000 }); await page.waitForTimeout(700); };

try {
  // 1) demo, desktop e celular: FPS
  for (const vp of [{ n: "demo_1280x576", w: 1280, h: 576, d: 1 }, { n: "demo_celular", w: 915, h: 412, d: 2.625 }]) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.d, hasTouch: true });
    const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
    await page.goto("http://localhost:4182/?demo=1");
    await page.waitForTimeout(1500);
    await resetPerf(page);
    await page.waitForTimeout(10000);
    log(vp.n, "perf", await perfOf(page), "erros", errs);
    await shot(page, `${vp.n}_jogo`);
    await page.close();
  }
  // 2) fluxo real no celular
  const page = await browser.newPage({ viewport: { width: 915, height: 412 }, deviceScaleFactor: 2.625, hasTouch: true });
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto("http://localhost:4182/");
  await page.waitForTimeout(4000);
  await shot(page, "fluxo_1_titulo");
  await clickText(page, "NOVA CARREIRA");
  await clickText(page, "Carreira de técnico");
  await page.locator(".tap, [class*=tap]").first().click({ timeout: 8000 }).catch(async () => { await page.mouse.click(200, 200); });
  await page.waitForTimeout(800);
  await clickText(page, "Começar carreira");
  await page.waitForTimeout(1200);
  await shot(page, "fluxo_2_hub");
  await clickText(page, "JOGAR");
  await clickText(page, "ENTRAR EM CAMPO");
  await page.waitForTimeout(2500);
  await resetPerf(page);
  await page.waitForTimeout(8000);
  log("partida real (celular) perf", await perfOf(page));
  await shot(page, "fluxo_3_partida");
  // adianta até uma chance do usuário e chuta arrastando
  const mode = await page.evaluate(() => { const m = window.__match; for (let i = 0; i < 60 * 300 && m.mode !== "decide" && m.mode !== "ended"; i++) m.update(1 / 60); m.update(0.4); return m.mode; });
  await page.waitForTimeout(300);
  await shot(page, "fluxo_4_decisao");
  if (mode === "decide") {
    const pos = await page.evaluate(() => { const m = window.__match, r = window.__renderer; const [x, y] = r.worldToScreen(m.ball.x, m.ball.y); const up = m.holder && m.holder.team === 0 ? -1 : 1; return { x: x / devicePixelRatio, y: y / devicePixelRatio, up }; });
    await page.mouse.move(pos.x, pos.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(pos.x + Math.sin((i / 12) * Math.PI) * 25, pos.y + pos.up * i * 15);
    await page.mouse.up();
    await page.waitForTimeout(500);
    await shot(page, "fluxo_5_chute");
  }
  log("chance:", mode, await page.evaluate(() => ({ mode: window.__match.mode, ball: window.__match.ballState, score: window.__match.score })));
  // termina o jogo rápido e espera a tela de fim
  await page.evaluate(() => { const m = window.__match; for (let i = 0; i < 60 * 600 && m.mode !== "ended"; i++) { if (m.mode === "decide") { m.endChance(); } m.update(1 / 60); } });
  await page.waitForTimeout(4500);
  await shot(page, "fluxo_6_fim");
  log("tela final contém 'Fim de jogo':", await page.getByText("Fim de jogo").count(), "erros", errs);
  await page.close();
} catch (e) {
  log("FALHA", e.message);
}
await browser.close();
server.kill();
process.exit(0);
