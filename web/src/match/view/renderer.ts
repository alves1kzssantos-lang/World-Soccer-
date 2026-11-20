import type { Match, Player } from "../sim/match";
import { BOX_DEPTH, BOX_HALF, CROSSBAR, GOAL_HALF, L, PEN_SPOT, W } from "../sim/types";
import { drawFigure, makeKit, type FigureState, type Kit } from "./figure";

const LIFT = 0.85; // metros de tela por metro de altura (bola, traves)
const FIG_H = 1.9; // altura desenhada do jogador (m)

/** Câmera com mola criticamente amortecida e antecipação na direção da jogada. */
export class Camera {
  x = W / 2; y = L / 2; vx = 0; vy = 0;
  zoom = 1;
  follow(m: Match, dt: number, viewW: number, viewH: number): void {
    const b = m.ball;
    const owner = m.holder ? m.holder.team : m.lastTouch ? m.lastTouch.team : 0;
    const dir = owner === 0 ? -1 : 1;
    let tx = b.x + b.vx * 0.35;
    let ty = b.y + b.vy * 0.35 + dir * 4;
    if (m.mode === "goal" && m.scorer) { tx = m.scorer.body.x; ty = m.scorer.body.y; }
    const hw = viewW / 2, hh = viewH / 2;
    tx = clamp(tx, Math.min(hw - 4, W / 2), Math.max(W + 4 - hw, W / 2));
    ty = clamp(ty, hh - 7, L + 7 - hh);
    const k = 3.2;
    this.vx += ((tx - this.x) * k * k - 2 * k * this.vx) * dt;
    this.vy += ((ty - this.y) * k * k - 2 * k * this.vy) * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const zt = m.mode === "goal" ? 1.2 : m.mode === "decide" || m.mode === "slowmo" ? 1.08 : 1;
    this.zoom += (zt - this.zoom) * Math.min(dt * 3, 1);
  }
}

export class Renderer {
  readonly cam = new Camera();
  ppm = 40; // pixels (do aparelho) por metro
  private kits: [Kit, Kit];
  private keeperKits: [Kit, Kit];
  private refKit: Kit = makeKit("#15161a", "#2a2b30", false);
  private order: Player[] = [];
  private fs: FigureState;
  private netBulge = 0;
  private netX = 0;
  private netTop = true;
  frameMs = 0;

  constructor(private ctx: CanvasRenderingContext2D, private m: Match) {
    const t = m.teams;
    this.kits = [makeKit(t[0].c1, t[0].c2, !!t[0].stripes), makeKit(t[1].c1, t[1].c2, !!t[1].stripes)];
    this.keeperKits = [makeKit("#e8c61c", "#2b2b2b", false), makeKit("#3fb3e8", "#1d2b44", false)];
    this.order = m.players.slice();
    this.fs = { view: 0, flip: 1, phase: 0, amp: 0, anim: "run", animT: 0, diveDir: 0, skin: 0, hair: 0, hairColor: 0, kit: this.kits[0], keeper: false };
    m.events.onGoal = wrap(m.events.onGoal, () => {
      this.netBulge = 1;
      this.netX = m.ball.x;
      this.netTop = m.ball.y < L / 2;
    });
  }

  /** Converte toque na tela (px do aparelho) para metros no campo. */
  screenToWorld(px: number, py: number): [number, number] {
    const c = this.ctx.canvas;
    const s = this.ppm * this.cam.zoom;
    return [this.cam.x + (px - c.width / 2) / s, this.cam.y + (py - c.height / 2) / s];
  }
  worldToScreen(x: number, y: number): [number, number] {
    const c = this.ctx.canvas;
    const s = this.ppm * this.cam.zoom;
    return [(x - this.cam.x) * s + c.width / 2, (y - this.cam.y) * s + c.height / 2];
  }

  render(dt: number, dpr: number): void {
    const t0 = performance.now();
    const ctx = this.ctx;
    const c = ctx.canvas;
    const m = this.m;
    // ~40 px/m numa tela de 1280 px de largura (CSS), proporcional em qualquer tela
    this.ppm = 40 * (c.width / dpr / 1280) * dpr;
    const s = this.ppm;
    this.cam.follow(m, dt, c.width / (s * this.cam.zoom), c.height / (s * this.cam.zoom));
    this.netBulge = Math.max(this.netBulge - dt * 0.6, 0);
    const z = s * this.cam.zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = m.desat > 0.01 ? `grayscale(${m.desat.toFixed(2)})` : "none";
    ctx.setTransform(z, 0, 0, z, c.width / 2 - this.cam.x * z, c.height / 2 - this.cam.y * z);
    this.drawPitch(z);
    this.drawGoalBack(true);
    this.drawGoalBack(false);
    this.drawPeopleAndBall();
    this.drawGoalFront();
    ctx.filter = "none";
    this.drawDecisionMarks();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawHud(dpr);
    this.frameMs = performance.now() - t0;
  }

  // ------------------------------------------------------------ campo
  private drawPitch(z: number): void {
    const ctx = this.ctx;
    // grama em faixas largas (9 m)
    ctx.fillStyle = "#5f8f1d";
    ctx.fillRect(-12, -14, W + 24, L + 28);
    for (let i = 0, y = -14; y < L + 14; i++, y += 9) {
      ctx.fillStyle = i % 2 === 0 ? "#6f9e22" : "#64951e";
      ctx.fillRect(-12, y, W + 24, 9);
    }
    // placas atrás dos gols
    for (const top of [true, false]) {
      const y = top ? -6.5 : L + 5.3;
      ctx.fillStyle = "#11203f";
      ctx.fillRect(-12, y, W + 24, 1.2);
      ctx.fillStyle = "#39e33f";
      for (let x = -10; x < W + 12; x += 14) ctx.fillRect(x, y + 0.45, 6, 0.3);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 0.12;
    ctx.beginPath();
    ctx.rect(0, 0, W, L);
    ctx.moveTo(0, L / 2); ctx.lineTo(W, L / 2);
    ctx.moveTo(W / 2 + 9.15, L / 2); ctx.arc(W / 2, L / 2, 9.15, 0, Math.PI * 2);
    for (const top of [true, false]) {
      const gy = top ? 0 : L, d = top ? 1 : -1;
      ctx.moveTo(W / 2 - BOX_HALF, gy); ctx.lineTo(W / 2 - BOX_HALF, gy + d * BOX_DEPTH);
      ctx.lineTo(W / 2 + BOX_HALF, gy + d * BOX_DEPTH); ctx.lineTo(W / 2 + BOX_HALF, gy);
      ctx.moveTo(W / 2 - 9.16, gy); ctx.lineTo(W / 2 - 9.16, gy + d * 5.5);
      ctx.lineTo(W / 2 + 9.16, gy + d * 5.5); ctx.lineTo(W / 2 + 9.16, gy);
      const sy = gy + d * PEN_SPOT;
      const a = Math.acos(5.5 / 9.15);
      if (top) { ctx.moveTo(W / 2 + 9.15 * Math.cos(a), sy + 9.15 * Math.sin(a)); ctx.arc(W / 2, sy, 9.15, a, Math.PI - a); }
      else { ctx.moveTo(W / 2 + 9.15 * Math.cos(-a), sy + 9.15 * Math.sin(-a)); ctx.arc(W / 2, sy, 9.15, -a, -Math.PI + a, true); }
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    for (const sy of [PEN_SPOT, L - PEN_SPOT, L / 2]) { ctx.beginPath(); ctx.arc(W / 2, sy, 0.18, 0, Math.PI * 2); ctx.fill(); }
    // bandeirinhas
    for (const [fx, fy] of [[0, 0], [W, 0], [0, L], [W, L]]) {
      ctx.strokeStyle = "#eee"; ctx.lineWidth = 0.08;
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 1.4); ctx.stroke();
      ctx.fillStyle = "#e8322a";
      ctx.beginPath(); ctx.moveTo(fx, fy - 1.4); ctx.lineTo(fx + 0.8, fy - 1.2); ctx.lineTo(fx, fy - 1.0); ctx.fill();
    }
    void z;
  }

  // ------------------------------------------------------------ gols (rede atrás, traves na frente)
  private drawGoalBack(top: boolean): void {
    const ctx = this.ctx;
    const gy = top ? 0 : L;
    const d = top ? -1 : 1; // para fora do campo
    const x0 = W / 2 - GOAL_HALF, x1 = W / 2 + GOAL_HALF;
    const depth = 2.0;
    const bh = CROSSBAR * LIFT;
    const bulge = this.netTop === top ? this.netBulge : 0;
    const bx = this.netX;
    // fundo da rede (chão e teto), com o ponto do gol estufando
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath();
    ctx.moveTo(x0, gy); ctx.lineTo(x1, gy);
    ctx.lineTo(x1, gy + d * depth); ctx.lineTo(x0, gy + d * depth);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const bump = bulge * Math.max(0, 1 - Math.abs(x - bx) / 2.2) * 0.9 * Math.sin(this.netBulge * 18) ;
      ctx.moveTo(x, gy - bh); ctx.lineTo(x + bump * 0.2, gy + d * (depth + Math.abs(bump)) - bh * 0.75);
      ctx.lineTo(x + bump * 0.2, gy + d * (depth + Math.abs(bump)));
    }
    for (let j = 0; j <= 4; j++) {
      const k = j / 4;
      ctx.moveTo(x0, gy + d * depth - bh * 0.75 * k);
      ctx.lineTo(x1, gy + d * depth - bh * 0.75 * k);
    }
    ctx.stroke();
    if (top) this.drawFrame(top);
  }

  private drawGoalFront(): void {
    this.drawFrame(false);
  }

  private drawFrame(top: boolean): void {
    const ctx = this.ctx;
    const gy = top ? 0 : L;
    const d = top ? -1 : 1;
    const x0 = W / 2 - GOAL_HALF, x1 = W / 2 + GOAL_HALF;
    const bh = CROSSBAR * LIFT;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // sombra das traves
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 0.16;
    ctx.beginPath(); ctx.moveTo(x0 + 0.3, gy + 0.1); ctx.lineTo(x1 + 0.3, gy + 0.1); ctx.stroke();
    // suportes de trás
    ctx.strokeStyle = "rgba(235,235,235,0.9)";
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.moveTo(x0, gy - bh); ctx.lineTo(x0, gy + d * 2.0 - bh * 0.75); ctx.lineTo(x0, gy + d * 2.0);
    ctx.moveTo(x1, gy - bh); ctx.lineTo(x1, gy + d * 2.0 - bh * 0.75); ctx.lineTo(x1, gy + d * 2.0);
    ctx.stroke();
    // traves e travessão grossos, com contorno
    ctx.strokeStyle = "#202226";
    ctx.lineWidth = 0.22;
    ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x0, gy - bh); ctx.lineTo(x1, gy - bh); ctx.lineTo(x1, gy); ctx.stroke();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 0.15;
    ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x0, gy - bh); ctx.lineTo(x1, gy - bh); ctx.lineTo(x1, gy); ctx.stroke();
    ctx.strokeStyle = "rgba(170,175,185,0.9)";
    ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.moveTo(x0 + 0.04, gy); ctx.lineTo(x0 + 0.04, gy - bh + 0.04); ctx.stroke();
  }

  // ------------------------------------------------------------ jogadores e bola
  private drawPeopleAndBall(): void {
    const ctx = this.ctx;
    const m = this.m;
    const o = this.order;
    // ordem de profundidade: quem está mais acima na tela primeiro (inserção, sem alocar)
    for (let i = 1; i < o.length; i++) {
      const v = o[i];
      let j = i - 1;
      while (j >= 0 && o[j].body.y > v.body.y) { o[j + 1] = o[j]; j--; }
      o[j + 1] = v;
    }
    const b = m.ball;
    let ballDone = false;
    for (const p of o) {
      if (!ballDone && p.body.y > b.y + 0.05) { this.drawBall(); ballDone = true; }
      this.drawPlayer(p);
    }
    if (!ballDone) this.drawBall();
    // árbitro
    const r = m.ref;
    this.fill(r.fx, r.fy, r.phase, r.speed, "run", 0, 0, 1, 0, 0, this.refKit, false);
    ctx.save(); ctx.translate(r.x, r.y); drawFigure(ctx, this.fs, FIG_H * 0.97); ctx.restore();
  }

  private drawPlayer(p: Player): void {
    const ctx = this.ctx;
    const bd = p.body;
    const kit = p.keeper ? this.keeperKits[p.team] : this.kits[p.team];
    this.fill(bd.fx, bd.fy, bd.phase, bd.speed, p.anim, p.animT, p.diveDir, p.info.skin, p.info.hair, p.info.hairColor, kit, p.keeper);
    ctx.save();
    ctx.translate(bd.x, bd.y);
    if (p === this.m.holder && this.m.mode !== "restart") {
      ctx.fillStyle = "rgba(255,190,60,0.35)";
      ctx.beginPath(); ctx.ellipse(0, 0, 0.7, 0.28, 0, 0, Math.PI * 2); ctx.fill();
    }
    drawFigure(ctx, this.fs, FIG_H);
    ctx.restore();
  }

  private fill(fx: number, fy: number, phase: number, speed: number, anim: FigureState["anim"], animT: number,
    diveDir: number, skin: number, hair: number, hc: number, kit: Kit, keeper: boolean): void {
    const f = this.fs;
    f.view = Math.abs(fx) > 0.72 ? 2 : fy < 0 ? 1 : 0;
    f.flip = fx < 0 ? -1 : 1;
    if (anim === "cheer" || anim === "kneel" || anim === "sad" || anim === "catch" || anim === "ready") f.view = 0;
    f.phase = phase;
    f.amp = Math.min(speed / 7, 1);
    f.anim = anim; f.animT = animT; f.diveDir = diveDir;
    f.skin = skin; f.hair = hair; f.hairColor = hc; f.kit = kit; f.keeper = keeper;
  }

  private drawBall(): void {
    const ctx = this.ctx;
    const b = this.m.ball;
    const r = 0.2;
    const sh = Math.max(0.4, 1 - b.z * 0.12);
    ctx.fillStyle = `rgba(0,0,0,${0.3 * sh})`;
    ctx.beginPath(); ctx.ellipse(b.x + 0.06, b.y, r * 1.05 * sh, r * 0.45 * sh, 0, 0, Math.PI * 2); ctx.fill();
    const by = b.y - r - b.z * LIFT;
    ctx.fillStyle = "#f4f4f4";
    ctx.strokeStyle = "#151515";
    ctx.lineWidth = 0.04;
    ctx.beginPath(); ctx.arc(b.x, by, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#1c1c1c";
    for (let i = 0; i < 3; i++) {
      const a = b.spin + (i * Math.PI * 2) / 3;
      ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * r * 0.5, by + Math.sin(a) * r * 0.5, r * 0.22, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ------------------------------------------------------------ decisão (em cor, sobre a cena cinza)
  private drawDecisionMarks(): void {
    const m = this.m;
    if (m.desat < 0.5 || !m.holder) return;
    const ctx = this.ctx;
    const h = m.holder;
    ctx.lineWidth = 0.09;
    for (const p of m.team[h.team]) {
      if (p.keeper) continue;
      ctx.strokeStyle = p === h ? "rgba(255,170,40,0.95)" : "rgba(255,255,255,0.9)";
      ctx.beginPath(); ctx.ellipse(p.body.x, p.body.y, 0.85, 0.36, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // boca do gol (onde mirar)
    const gy = h.team === 0 ? 0 : L;
    ctx.strokeStyle = "rgba(57,227,63,0.95)";
    ctx.lineWidth = 0.12;
    ctx.strokeRect(W / 2 - GOAL_HALF, gy - CROSSBAR * LIFT, GOAL_HALF * 2, CROSSBAR * LIFT);
  }

  // ------------------------------------------------------------ placar
  aim: { x0: number; y0: number; x1: number; y1: number } | null = null;

  private drawHud(dpr: number): void {
    const ctx = this.ctx;
    const m = this.m;
    const c = ctx.canvas;
    const u = Math.max(c.height / 720, 0.55 * dpr); // unidade de interface
    const t = m.teams;
    // placar
    const sw = 420 * u, sh = 44 * u, sx = c.width / 2 - sw / 2, sy = 10 * u;
    ctx.fillStyle = "rgba(10,12,12,0.86)";
    roundRect(ctx, sx, sy, sw, sh, 12 * u); ctx.fill();
    ctx.fillStyle = "#39e33f";
    ctx.fillRect(sx + 12 * u, sy + sh - 3 * u, sw - 24 * u, 2 * u);
    ctx.fillStyle = t[0].c1; ctx.fillRect(sx + 14 * u, sy + 12 * u, 8 * u, 20 * u);
    ctx.fillStyle = t[1].c1; ctx.fillRect(sx + sw - 22 * u, sy + 12 * u, 8 * u, 20 * u);
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${19 * u}px system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(t[0].short, sx + 30 * u, sy + sh / 2);
    ctx.textAlign = "right";
    ctx.fillText(t[1].short, sx + sw - 30 * u, sy + sh / 2);
    ctx.textAlign = "center";
    ctx.font = `800 ${24 * u}px system-ui, sans-serif`;
    ctx.fillText(`${m.score[0]}  -  ${m.score[1]}`, c.width / 2, sy + sh / 2);
    ctx.font = `700 ${13 * u}px system-ui, sans-serif`;
    ctx.fillStyle = "#39e33f";
    const tag = m.mode === "ended" ? "FIM DE JOGO" : `${m.minute}'`;
    ctx.fillText(tag, c.width / 2 + 95 * u, sy + sh / 2);
    // posse de bola
    const pw = 260 * u, ph = 6 * u, px = c.width / 2 - pw / 2, py = c.height - 18 * u;
    const k = m.possession0;
    ctx.fillStyle = "rgba(0,0,0,0.45)"; roundRect(ctx, px - 4 * u, py - 4 * u, pw + 8 * u, ph + 8 * u, 6 * u); ctx.fill();
    ctx.fillStyle = t[0].c1; ctx.fillRect(px, py, pw * k, ph);
    ctx.fillStyle = t[1].c1; ctx.fillRect(px + pw * k, py, pw * (1 - k), ph);
    // dica da decisão
    if (m.hint && m.mode === "decide") {
      ctx.font = `600 ${15 * u}px system-ui, sans-serif`;
      const tw = ctx.measureText(m.hint).width + 36 * u;
      ctx.fillStyle = "rgba(10,12,12,0.8)";
      roundRect(ctx, c.width / 2 - tw / 2, c.height - 70 * u, tw, 34 * u, 17 * u); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(m.hint, c.width / 2, c.height - 53 * u);
      // números dos companheiros
      if (m.holder) {
        ctx.font = `800 ${14 * u}px system-ui, sans-serif`;
        for (const p of m.team[m.holder.team]) {
          if (p === m.holder || p.keeper) continue;
          const [x, y] = this.worldToScreen(p.body.x, p.body.y - FIG_H * 1.05);
          ctx.fillStyle = "#fff";
          ctx.fillText(String(p.info.num), x, y);
          ctx.fillStyle = "#39e33f";
          ctx.fillRect(x - 10 * u, y + 9 * u, 20 * u, 3 * u);
        }
      }
    }
    // linha de mira do arraste
    if (this.aim) {
      ctx.strokeStyle = "rgba(57,227,63,0.9)";
      ctx.lineWidth = 5 * u;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(this.aim.x0, this.aim.y0); ctx.lineTo(this.aim.x1, this.aim.y1); ctx.stroke();
    }
    // faixa de lance (gol, defesa, falta...)
    if (m.banner) {
      ctx.font = `italic 900 ${m.banner.startsWith("GOO") ? 54 * u : 30 * u}px system-ui, sans-serif`;
      ctx.lineWidth = 6 * u;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.strokeText(m.banner, c.width / 2, c.height * 0.36);
      ctx.fillStyle = m.banner.startsWith("GOO") ? "#39e33f" : "#ffffff";
      ctx.fillText(m.banner, c.width / 2, c.height * 0.36);
    }
    if (m.mode === "ended") {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "#fff";
      ctx.font = `900 ${44 * u}px system-ui, sans-serif`;
      ctx.fillText(`${t[0].name} ${m.score[0]} x ${m.score[1]} ${t[1].name}`, c.width / 2, c.height * 0.45);
      ctx.font = `600 ${18 * u}px system-ui, sans-serif`;
      ctx.fillStyle = "#39e33f";
      ctx.fillText("Toque para jogar de novo", c.width / 2, c.height * 0.56);
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
function wrap<A extends unknown[]>(prev: ((...a: A) => void) | undefined, next: () => void): (...a: A) => void {
  return (...a: A) => { prev?.(...a); next(); };
}
