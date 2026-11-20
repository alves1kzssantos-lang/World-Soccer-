// Teste de ponta a ponta no navegador: abre a partida, provoca uma chance, chuta arrastando e mede o FPS.
// Uso: npm run build && node tests/e2e_match.mjs
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const OUT = process.env.SHOTS || "/tmp/claude-0/-home-user-World-Soccer-/447dabae-a03f-5bbb-b957-6b1f84032a22/scratchpad/web_match";
mkdirSync(OUT, { recursive: true });
const server = spawn("npx", ["vite", "preview", "--port", "4179", "--strictPort"], { stdio: "pipe" });
await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch();
const results = [];
for (const vp of [{ name: "1280x576", width: 1280, height: 576, dpr: 1 }, { name: "celular_915x412", width: 915, height: 412, dpr: 2.625 }]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, hasTouch: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://localhost:4179/");
  await page.waitForTimeout(1500);
  // mede ~10 s de jogo corrido
  await page.evaluate(() => window.__perf.reset());
  await page.waitForTimeout(10000);
  const perf = await page.evaluate(() => {
    const p = window.__perf;
    return { fps: (1000 * p.frames) / p.sumMs, avgMs: p.sumMs / p.frames, worstMs: p.worstMs, drawMs: p.drawMs / p.frames };
  });
  await page.screenshot({ path: `${OUT}/${vp.name}_1_jogo.png` });
  // adianta até a próxima chance do usuário
  const got = await page.evaluate(() => {
    const m = window.__match;
    for (let i = 0; i < 60 * 240 && m.mode !== "decide"; i++) m.update(1 / 60);
    m.update(0.4);
    return m.mode;
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${vp.name}_2_decisao.png` });
  // arrasta da bola rumo ao gol (com curva)
  const pos = await page.evaluate(() => {
    const m = window.__match, r = window.__renderer;
    const [x, y] = r.worldToScreen(m.ball.x, m.ball.y);
    return { x: x / devicePixelRatio, y: y / devicePixelRatio };
  });
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(pos.x + Math.sin((i / 12) * Math.PI) * 30 + i * 2, pos.y - i * 18);
  await page.mouse.up();
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/${vp.name}_3_chute.png` });
  const after = await page.evaluate(() => ({ mode: window.__match.mode, ball: window.__match.ballState, score: window.__match.score }));
  results.push({ vp: vp.name, perf, chance: got, after, errors });
  await page.close();
}
await browser.close();
server.kill();
console.log(JSON.stringify(results, null, 1));
process.exit(0);
