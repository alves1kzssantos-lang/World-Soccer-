import type { Anim } from "../sim/match";

export const SKINS = ["#f3cfae", "#e4b48a", "#c98d5c", "#a8703f", "#85532f", "#5e3a22"];
export const HAIRS = ["#1b1b1f", "#2e2018", "#5a3a22", "#8a5a2b", "#c9a24a", "#6e6e72"];
const OUT = "rgba(18,20,22,0.85)";

export interface Kit {
  shirt: string;
  trim: string;
  shorts: string;
  socks: string;
  stripes: boolean;
}

export interface FigureState {
  view: 0 | 1 | 2; // 0 frente, 1 costas, 2 lado
  flip: number; // 1 / -1 no perfil
  phase: number; // passada (rad)
  amp: number; // 0 parado .. 1 correndo
  anim: Anim;
  animT: number;
  diveDir: number;
  skin: number;
  hair: number;
  hairColor: number;
  kit: Kit;
  keeper: boolean;
}

/**
 * Desenha o jogador com os pés em (0,0), em metros, de pé na tela (cabeça para cima).
 * Proporção ~3,3 cabeças, contorno escuro, kit em camadas (camisa, listras, calção, meião, chuteira).
 * O contexto já está na escala do mundo; H = altura desenhada em metros.
 */
export function drawFigure(ctx: CanvasRenderingContext2D, f: FigureState, H: number): void {
  const lw = H * 0.03;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = OUT;
  // sombra no chão
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(H * 0.04, 0, H * 0.2, H * 0.065, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  let lift = 0;
  let rot = 0;
  switch (f.anim) {
    case "slide": rot = 1.05 * f.flip; lift = 0; break;
    case "fall": rot = 1.45 * (f.flip || 1) * Math.min(f.animT / 0.18, 1); break;
    case "dive": rot = 1.2 * (f.diveDir || 1) * Math.min(f.animT / 0.15, 1); lift = H * 0.22 * Math.min(f.animT / 0.15, 1); break;
    case "cheer": lift = Math.abs(Math.sin(f.animT * 8)) * H * 0.08; break;
    case "kneel": lift = -H * 0.2; break;
  }
  const bob = Math.abs(Math.sin(f.phase * 2)) * H * 0.025 * f.amp;
  ctx.translate(0, -lift - bob);
  if (rot) ctx.rotate(rot);

  const skin = SKINS[f.skin % SKINS.length];
  const hair = HAIRS[f.hairColor % HAIRS.length];
  const k = f.kit;
  const side = f.view === 2;
  const fl = f.flip;
  const hipY = -H * 0.36;
  const kneel = f.anim === "kneel";

  // ---- pernas
  for (let li = 0; li < 2; li++) {
    const leg = li === 0 ? -1 : 1;
    const ph = f.phase + (leg > 0 ? 0 : Math.PI);
    let sw = Math.sin(ph) * f.amp;
    if (f.anim === "kick" && leg > 0) sw = 1.4 * Math.min(f.animT / 0.12, 1) * (1 - Math.min(f.animT / 0.5, 1)) + 0.2;
    if (f.anim === "slide" && leg > 0) sw = 1.2;
    const hx = side ? leg * H * 0.03 : leg * H * 0.075;
    let fx = hx + (side ? sw * H * 0.17 * fl : 0);
    let fy = side ? 0 : -Math.max(0, -Math.cos(ph)) * H * 0.05 * f.amp;
    if (!side && f.anim === "kick" && leg > 0) fy = -H * 0.12 * sw;
    if (f.anim === "ready") fx = hx * 1.8;
    if (kneel) { fx = hx; fy = hipY * 0.15; }
    const kx = (hx + fx) / 2 + (side ? H * 0.025 * fl : 0);
    const ky = (hipY + fy) / 2;
    // contorno + coxa (pele) + meião
    limb(ctx, hx, hipY, kx, ky, H * 0.085, skin);
    limb(ctx, kx, ky, fx, fy - H * 0.02, H * 0.09, k.socks);
    // chuteira
    ctx.fillStyle = "#17171b";
    ctx.beginPath();
    ctx.ellipse(fx + (side ? H * 0.03 * fl : 0), fy - H * 0.01, H * (side ? 0.065 : 0.045), H * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // ---- calção
  const tw = side ? H * 0.11 : H * 0.15;
  rrect(ctx, -tw, -H * 0.46, tw * 2, H * 0.12, H * 0.03, k.shorts);

  // ---- braços (o de trás primeiro)
  const shY = -H * 0.66;
  const armSw = side ? 0.17 : 0.06;
  const hand = (s: number): [number, number] => {
    const sx = side ? 0 : s * tw * 1.0;
    const ph = f.phase + (s > 0 ? Math.PI : 0);
    let hx = sx + s * (side ? 0 : H * 0.03) + (side ? Math.sin(ph) * f.amp * H * armSw * fl : 0);
    let hy = shY + H * 0.2 - (side ? 0 : Math.sin(ph) * f.amp * H * armSw);
    switch (f.anim) {
      case "cheer": case "dive": case "catch": hx = sx + s * H * 0.08; hy = shY - H * 0.2; break;
      case "kneel": hx = sx + s * H * 0.22; hy = shY - H * 0.08; break;
      case "sad": hx = sx * 0.3; hy = -H * 0.92; break;
      case "ready": hx = sx + s * H * 0.12; hy = shY + H * 0.1; break;
    }
    return [hx, hy];
  };
  const drawArm = (s: number): void => {
    const sx = side ? 0 : s * tw * 0.95;
    const [hx, hy] = hand(s);
    limb(ctx, sx, shY, hx, hy, H * 0.06, skin);
    // manga
    const mx = sx + (hx - sx) * 0.35, my = shY + (hy - shY) * 0.35;
    limb(ctx, sx, shY, mx, my, H * 0.085, k.shirt);
    if (f.keeper) {
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath(); ctx.arc(hx, hy, H * 0.04, 0, Math.PI * 2); ctx.fill();
    }
  };
  drawArm(side ? -fl : -1);

  // ---- camisa
  rrect(ctx, -tw, -H * 0.71, tw * 2, H * 0.27, H * 0.05, k.shirt);
  if (k.stripes) {
    ctx.fillStyle = k.trim;
    for (let i = 0; i < 3; i++) {
      const cx = -tw + (tw * 2 * (i + 0.5)) / 3;
      ctx.fillRect(cx - tw * 0.14, -H * 0.7, tw * 0.28, H * 0.25);
    }
  }
  // gola
  ctx.strokeStyle = k.trim;
  ctx.lineWidth = lw * 1.2;
  ctx.beginPath();
  ctx.moveTo(-tw * 0.35, -H * 0.705);
  ctx.lineTo(0, -H * (f.view === 0 ? 0.665 : 0.7));
  ctx.lineTo(tw * 0.35, -H * 0.705);
  ctx.stroke();
  ctx.strokeStyle = OUT;
  ctx.lineWidth = lw;
  drawArm(side ? fl : 1);

  // ---- cabeça
  const hr = H * 0.15;
  const hcx = side ? H * 0.015 * fl : 0;
  const hcy = -H * 0.85;
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(hcx, hcy, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  drawHair(ctx, f, hcx, hcy, hr, hair);
  if (f.view === 0) {
    // rosto simples: olhos e sorriso
    ctx.fillStyle = "#16161a";
    ctx.fillRect(hcx - hr * 0.42, hcy - hr * 0.05, hr * 0.16, hr * 0.32);
    ctx.fillRect(hcx + hr * 0.26, hcy - hr * 0.05, hr * 0.16, hr * 0.32);
    ctx.fillStyle = "#fbfbfb";
    ctx.beginPath();
    ctx.ellipse(hcx, hcy + hr * 0.48, hr * 0.32, hr * 0.13, 0, 0, Math.PI);
    ctx.fill();
  } else if (f.view === 2) {
    ctx.fillStyle = "#16161a";
    ctx.fillRect(hcx + hr * 0.42 * fl - hr * 0.08, hcy - hr * 0.05, hr * 0.16, hr * 0.3);
  }
  ctx.restore();
}

function drawHair(ctx: CanvasRenderingContext2D, f: FigureState, x: number, y: number, r: number, c: string): void {
  ctx.fillStyle = c;
  const back = f.view === 1;
  switch (f.hair % 7) {
    case 0: // curto
      ctx.beginPath(); ctx.arc(x, y, r * 1.02, Math.PI * (back ? 0.95 : 1.05), Math.PI * (back ? 2.05 : 1.95)); ctx.fill();
      if (back) { ctx.beginPath(); ctx.arc(x, y, r * 1.02, 0, Math.PI); ctx.fill(); }
      break;
    case 1: // raspado
      ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.arc(x, y, r * 1.01, Math.PI * 1.1, Math.PI * 1.9); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case 2: // black power
      ctx.beginPath(); ctx.arc(x, y - r * 0.25, r * 1.22, Math.PI * 0.9, Math.PI * 2.1); ctx.fill(); ctx.stroke();
      break;
    case 3: // cachos com faixa
      ctx.beginPath(); ctx.arc(x, y - r * 0.1, r * 1.12, Math.PI * 0.85, Math.PI * 2.15); ctx.fill();
      ctx.fillStyle = "#f2f2f2";
      ctx.fillRect(x - r * 1.0, y - r * 0.55, r * 2.0, r * 0.22);
      break;
    case 4: // careca
      break;
    case 5: // moicano
      ctx.beginPath(); ctx.ellipse(x, y - r * 0.85, r * 0.28, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      break;
    default: // topete
      ctx.beginPath(); ctx.arc(x, y, r * 1.03, Math.PI * 1.0, Math.PI * 2.0); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + r * 0.2, y - r * 0.95, r * 0.5, r * 0.28, -0.3, 0, Math.PI * 2); ctx.fill();
  }
}

function limb(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, w: number, col: string): void {
  const lw = ctx.lineWidth;
  const ss = ctx.strokeStyle;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = w + lw * 2;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.lineWidth = lw;
  ctx.strokeStyle = ss;
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, col: string): void {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** Cor do calção: segunda cor do time, ou a camisa escurecida quando as duas são parecidas. */
export function makeKit(c1: string, c2: string, stripes: boolean): Kit {
  const shorts = close(c1, c2) ? darken(c1, 0.3) : c2;
  return { shirt: c1, trim: c2, shorts, socks: c1, stripes };
}
export function close(a: string, b: string): boolean {
  const pa = hex(a), pb = hex(b);
  return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]) < 100;
}
export function darken(c: string, k: number): string {
  const p = hex(c);
  return `rgb(${p.map((v) => Math.round(v * (1 - k))).join(",")})`;
}
function hex(c: string): [number, number, number] {
  const s = c.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
