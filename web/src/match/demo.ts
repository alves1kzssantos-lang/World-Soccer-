import { demoTeams } from "./demoTeams";
import { MatchInput } from "./input/input";
import { Match } from "./sim/match";
import { Renderer } from "./view/renderer";

declare global {
  interface Window {
    __match?: Match;
    __renderer?: Renderer;
    __perf?: { frames: number; sumMs: number; worstMs: number; drawMs: number; reset(): void };
  }
}

/** Partida de demonstração jogável (Flamengo x Palmeiras): você joga com o time de cima da tela. */
export function startDemo(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d", { alpha: false })!;
  let match = new Match(demoTeams(), { seed: (Date.now() & 0xffff) + 1, userSide: 0 });
  let renderer = new Renderer(ctx, match);
  const input = new MatchInput(canvas, () => match, () => renderer);
  input.onRestart = () => {
    match = new Match(demoTeams(), { seed: (Date.now() & 0xffff) + 1, userSide: 0 });
    renderer = new Renderer(ctx, match);
    window.__match = match;
    window.__renderer = renderer;
  };
  window.__match = match;
  window.__renderer = renderer;
  const perf = {
    frames: 0, sumMs: 0, worstMs: 0, drawMs: 0,
    reset() { this.frames = 0; this.sumMs = 0; this.worstMs = 0; this.drawMs = 0; },
  };
  window.__perf = perf;

  let dpr = 1;
  const resize = (): void => {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  };
  window.addEventListener("resize", resize);
  resize();

  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    match.update(dt);
    renderer.render(dt, dpr);
    perf.frames++;
    perf.sumMs += dt * 1000;
    perf.worstMs = Math.max(perf.worstMs, dt * 1000);
    perf.drawMs += renderer.frameMs;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
