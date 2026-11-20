import type { Match } from "../sim/match";
import type { Renderer } from "../view/renderer";

/**
 * Toque e mouse: toque num companheiro = passe, segurar = passe alto,
 * arrastar a partir da bola = chute (direção = mira, tamanho = força, curva do traço = efeito).
 */
export class MatchInput {
  private down = false;
  private t0 = 0;
  private pts: number[] = []; // x,y em px do aparelho (reaproveitado)
  onRestart: (() => void) | null = null;

  constructor(private canvas: HTMLCanvasElement, private m: () => Match, private r: () => Renderer) {
    canvas.addEventListener("pointerdown", (e) => this.start(e));
    canvas.addEventListener("pointermove", (e) => this.move(e));
    canvas.addEventListener("pointerup", (e) => this.end(e));
    canvas.addEventListener("pointercancel", () => { this.down = false; this.r().aim = null; });
  }

  private px(e: PointerEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * this.canvas.width, ((e.clientY - rect.top) / rect.height) * this.canvas.height];
  }

  private start(e: PointerEvent): void {
    e.preventDefault();
    this.down = true;
    this.t0 = performance.now();
    const [x, y] = this.px(e);
    this.pts.length = 0;
    this.pts.push(x, y);
  }

  private move(e: PointerEvent): void {
    if (!this.down) return;
    const [x, y] = this.px(e);
    if (this.pts.length < 400) this.pts.push(x, y);
    const p = this.pts;
    if (Math.hypot(x - p[0], y - p[1]) > 40 * (window.devicePixelRatio || 1)) {
      this.r().aim = { x0: p[0], y0: p[1], x1: x, y1: y };
    }
  }

  private end(e: PointerEvent): void {
    if (!this.down) return;
    this.down = false;
    this.r().aim = null;
    const m = this.m();
    if (m.mode === "ended") { this.onRestart?.(); return; }
    const [x, y] = this.px(e);
    const p = this.pts;
    const dpr = window.devicePixelRatio || 1;
    const lenPx = Math.hypot(x - p[0], y - p[1]) / dpr;
    const held = (performance.now() - this.t0) / 1000;
    const r = this.r();
    if (lenPx >= 40) {
      // curva do traço: maior desvio dos pontos em relação à reta início→fim (em metros, com sinal)
      const dx = x - p[0], dy = y - p[1], dl = Math.hypot(dx, dy) || 1;
      let bend = 0;
      for (let i = 2; i < p.length; i += 2) {
        const c = ((p[i] - p[0]) * dy - (p[i + 1] - p[1]) * dx) / dl;
        if (Math.abs(c) > Math.abs(bend)) bend = c;
      }
      const [sx, sy] = r.screenToWorld(p[0], p[1]);
      const [ex, ey] = r.screenToWorld(x, y);
      m.swipe(sx, sy, ex, ey, bend / (r.ppm * r.cam.zoom), lenPx);
      return;
    }
    const [wx, wy] = r.screenToWorld(x, y);
    m.tap(wx, wy, held);
  }
}
