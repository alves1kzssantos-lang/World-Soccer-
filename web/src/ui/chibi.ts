// Retrato procedural no estilo da marca (porta de chibi_portrait.gd): cabeça grande, contorno
// grosso, olhos em pílula, sorriso branco e cabelo expressivo. Desenha uma vez por visual e
// tamanho e reaproveita (cache), então listas longas não redesenham nada.
export const SKINS = ["#f3cfae", "#e4b48a", "#c98d5c", "#a8703f", "#85532f", "#5e3a22"];
export const HAIRS = ["#1b1b1f", "#2e2018", "#5a3a22", "#8a5a2b", "#c9a24a", "#6e6e72"];
export const STYLE_NAMES = ["Curto", "Topete", "Cheio", "Careca", "Raspado", "Franja", "Espetado", "Cacheado com faixa"];
const INK = "#121214";

export type Expr = "smile" | "serious" | "angry" | "crying" | "shouting";
export interface Look {
  skin: number; hcolor: number; hstyle: number; beard?: boolean; mustache?: boolean;
  c1?: string; c2?: string; striped?: boolean; keeper?: boolean; num?: string; expr?: Expr;
  suit?: string; tie?: boolean; boots?: string; band?: string; armsUp?: boolean;
}
export type Mode = "head" | "bust" | "full";

/** Mesmas regras da partida: o jogador tem a mesma cara no menu e no campo. */
export function lookForPlayer(p: { id: number; pos?: string; num?: number | string; look_skin?: number; look_hcolor?: number; look_hstyle?: number; look_beard?: boolean },
  kit?: [string, string, boolean?]): Look {
  const id = p.id | 0;
  return { skin: p.look_skin ?? (id * 3) % SKINS.length, hcolor: p.look_hcolor ?? (id * 5) % HAIRS.length, hstyle: p.look_hstyle ?? id % 6,
    beard: p.look_beard ?? id % 4 === 1, c1: kit?.[0], c2: kit?.[1], striped: !!kit?.[2], keeper: p.pos === "GOL",
    num: p.num !== undefined ? String(p.num) : "", expr: "smile" };
}

/** Visual fixo a partir de um texto (usuários da rede social, repórter). */
export function lookForHandle(handle: string, expr: Expr = "smile", shirt = "#3a3f3c"): Look {
  let h = 0;
  for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) | 0;
  h = Math.abs(h);
  return { skin: h % 6, hcolor: Math.floor(h / 7) % 6, hstyle: Math.floor(h / 49) % 8, beard: Math.floor(h / 343) % 5 === 1, expr, c1: shirt, c2: "#6a706c" };
}

export function lookForCoach(co: { skin?: number; hair?: number; haircolor?: number; beard?: number; suit?: number }): Look {
  const skin = [0, 1, 2, 4, 5][(co.skin ?? 1) % 5], hst = [0, 6, 7, 3][(co.hair ?? 0) % 4], hc = [0, 2, 4, 5][(co.haircolor ?? 0) % 4];
  const suits = ["#2553a8", "#1d2333", "#2c7a4d"], s = (co.suit ?? 0) % 3, b = co.beard ?? 0;
  return { skin, hstyle: hst, hcolor: hc, beard: b === 1, mustache: b === 2, suit: suits[s], tie: s !== 2, expr: "smile" };
}

const cache = new Map<string, HTMLCanvasElement>();

/** Canvas com o retrato (px = largura em pixels de CSS). */
export function portrait(look: Look, px: number, mode: Mode = "bust"): HTMLCanvasElement {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const hgt = px * (mode === "full" ? 1.7 : mode === "bust" ? 1.1 : 1.0);
  const key = JSON.stringify(look) + mode + px + dpr;
  let src = cache.get(key);
  if (!src) {
    src = document.createElement("canvas");
    src.width = Math.round(px * dpr);
    src.height = Math.round(hgt * dpr);
    draw(src.getContext("2d")!, look, mode, src.width, src.height);
    if (cache.size > 600) cache.clear();
    cache.set(key, src);
  }
  const c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  c.style.width = `${px}px`; c.style.height = `${hgt}px`; c.style.flex = "none";
  c.getContext("2d")!.drawImage(src, 0, 0);
  return c;
}

function shade(hex: string, k: number): string {
  const v = parseInt(hex.slice(1), 16);
  const f = (x: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? x * (1 + k) : x + (255 - x) * k)));
  return `rgb(${f(v >> 16)},${f((v >> 8) & 255)},${f(v & 255)})`;
}
function mix(a: string, b: string, t: number): string {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
function lum(hex: string): number { const v = parseInt(hex.slice(1), 16); return (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255; }

function draw(g: CanvasRenderingContext2D, lk: Look, mode: Mode, W: number, H: number): void {
  const full = mode === "full", bust = mode === "bust";
  const uh = full ? 170 : bust ? 110 : 100;
  const k = Math.min(W / 100, H / uh);
  g.setTransform(k, 0, 0, k, (W - 100 * k) / 2, H - uh * k);
  const o = Math.min(6, Math.max(2.4, (3.2 / Math.max(k, 0.3)) * 0.9 * (k > 1.2 ? 1 : 1)));
  g.lineJoin = "round"; g.lineCap = "round";
  const skin = SKINS[lk.skin % 6], hair = HAIRS[lk.hcolor % 6];
  const shirt = lk.suit ?? (lk.keeper ? "#e8c61c" : lk.c1 ?? "#2f6fd6");

  const ocircle = (x: number, y: number, r: number, col: string) => {
    g.fillStyle = INK; g.beginPath(); g.arc(x, y, r + o, 0, 7); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  };
  const path = (pts: number[][]) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  const opoly = (pts: number[][], col: string) => { path(pts); g.strokeStyle = INK; g.lineWidth = o * 2; g.stroke(); g.fillStyle = col; g.fill(); };
  const rr = (x: number, y: number, w: number, h: number, r: number): number[][] => {
    const out: number[][] = [], cs = [[x + w - r, y + r], [x + w - r, y + h - r], [x + r, y + h - r], [x + r, y + r]], a0 = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
    for (let i = 0; i < 4; i++) for (let s = 0; s <= 4; s++) { const a = a0[i] + (Math.PI / 2) * (s / 4); out.push([cs[i][0] + Math.cos(a) * r, cs[i][1] + Math.sin(a) * r]); }
    return out;
  };

  if (full) bodyFull(50, 66);
  else if (bust) shoulders(50, 84);
  head(50, full ? 40 : 46, mode === "head" ? 34 : bust ? 31 : 27);

  function head(cx: number, cy: number, r: number) {
    const st = lk.hstyle % 8;
    if (st === 2) ocircle(cx, cy - r * 0.18, r * 1.06, hair);
    else if (st === 7) {
      for (let i = 0; i < 11; i++) { const a = Math.PI + (Math.PI * i) / 10; ocircle(cx + Math.cos(a) * r * 0.98, cy + Math.sin(a) * 0.95 * r * 0.98 + r * 0.05, r * 0.3, hair); }
      for (const sd of [-1, 1]) ocircle(cx + sd * r * 1.05, cy + r * 0.45, r * 0.28, hair);
    }
    for (const sd of [-1, 1]) { ocircle(cx + sd * r * 0.98, cy + r * 0.12, r * 0.2, skin); g.fillStyle = shade(skin, -0.15); g.beginPath(); g.arc(cx + sd * r * 0.98, cy + r * 0.12, r * 0.09, 0, 7); g.fill(); }
    opoly(rr(cx - r, cy - r * 1.02, r * 2, r * 2.05, r * 0.82), skin);
    path(rr(cx + r * 0.35, cy - r * 0.6, r * 0.5, r * 1.3, r * 0.24)); g.fillStyle = "rgba(0,0,0,.05)"; g.fill();
    hairFront(cx, cy, r, st);
    if (lk.beard) { path([[cx - r * 0.92, cy + r * 0.25], [cx + r * 0.92, cy + r * 0.25], [cx + r * 0.7, cy + r * 0.82], [cx, cy + r * 1.06], [cx - r * 0.7, cy + r * 0.82]]); g.fillStyle = mix(skin, hair, 0.55); g.fill(); }
    face(cx, cy, r);
  }
  function hairFront(cx: number, cy: number, r: number, st: number) {
    const P = (pts: number[][]) => opoly(pts.map(([x, y]) => [cx + x * r, cy + y * r]), hair);
    switch (st) {
      case 0: P([[-1, -0.25], [-0.95, -0.75], [-0.5, -1.08], [0.4, -1.12], [0.95, -0.78], [1, -0.25], [0.7, -0.62], [-0.6, -0.6]]); break;
      case 1: P([[-1, -0.3], [-0.9, -0.85], [-0.2, -1.12], [0.25, -1.42], [0.85, -1.2], [1.02, -0.35], [0.6, -0.7], [-0.5, -0.68]]); break;
      case 2: P([[-1.04, -0.1], [-0.9, -0.9], [0, -1.2], [0.9, -0.9], [1.04, -0.1], [0.55, -0.62], [-0.2, -0.5], [-0.7, -0.6]]); break;
      case 3: g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = r * 0.08; g.beginPath(); g.arc(cx - r * 0.25, cy - r * 0.55, r * 0.25, Math.PI * 1.1, Math.PI * 1.7); g.stroke(); break;
      case 4: path(rr(cx - r * 0.92, cy - r * 1.02 + r * 0.05, r * 1.84, r * 0.7, r * 0.34)); g.globalAlpha = 0.55; g.fillStyle = hair; g.fill(); g.globalAlpha = 1; break;
      case 5: P([[-1, -0.2], [-0.92, -0.88], [0, -1.14], [0.92, -0.88], [1, -0.2], [0.55, -0.42], [-0.05, -0.34], [-0.6, -0.42]]); break;
      case 6: { const pts = [[-1.02, -0.25]]; for (let i = 0; i < 7; i++) pts.push([-0.95 + (1.9 * i) / 6, -0.92 - (i % 2 ? 0.36 : 0.08)]); pts.push([1.02, -0.25], [0.55, -0.62], [-0.55, -0.62]); P(pts); break; }
      case 7: for (let i = 0; i < 7; i++) { const a = Math.PI * 1.18 + (Math.PI * 0.64 * i) / 6; ocircle(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92, r * 0.26, hair); }
        opoly([[cx - r * 0.97, cy - r * 0.74], [cx + r * 0.97, cy - r * 0.74], [cx + r * 0.99, cy - r * 0.56], [cx - r * 0.99, cy - r * 0.56]], lk.band ?? "#2a2a2e"); break;
    }
  }
  function face(cx: number, cy: number, r: number) {
    const expr = lk.expr ?? "smile", ey = cy + r * 0.02;
    const brow = lk.hstyle % 8 !== 3 ? shade(hair, -0.35) : shade(skin, -0.45);
    const tilt = expr === "angry" || expr === "shouting" ? r * 0.14 : expr === "crying" ? -r * 0.12 : 0;
    g.strokeStyle = brow; g.lineWidth = r * 0.13;
    for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(cx + sd * r * 0.58, ey - r * 0.3); g.lineTo(cx + sd * r * 0.18, ey - r * 0.3 + tilt); g.stroke(); }
    for (const sd of [-1, 1]) { path(rr(cx + sd * r * 0.38 - r * 0.15, ey - r * 0.1, r * 0.3, r * 0.2, r * 0.09)); g.fillStyle = INK; g.fill(); }
    if (expr === "crying") for (const sd of [-1, 1]) { g.fillStyle = "#6ec6ff"; g.beginPath(); g.arc(cx + sd * r * 0.4, ey + r * 0.3, r * 0.08, 0, 7); g.fill(); }
    g.strokeStyle = shade(skin, -0.3); g.lineWidth = r * 0.06; g.beginPath(); g.moveTo(cx - r * 0.06, ey + r * 0.22); g.lineTo(cx + r * 0.06, ey + r * 0.24); g.stroke();
    if (lk.mustache) { g.strokeStyle = hair; g.lineWidth = r * 0.12; g.beginPath(); g.moveTo(cx - r * 0.32, ey + r * 0.36); g.lineTo(cx + r * 0.32, ey + r * 0.36); g.stroke(); }
    const my = ey + r * 0.48;
    g.strokeStyle = INK; g.lineWidth = r * 0.07;
    if (expr === "serious") { g.beginPath(); g.moveTo(cx - r * 0.25, my); g.lineTo(cx + r * 0.25, my); g.stroke(); }
    else if (expr === "angry" || expr === "crying") { g.beginPath(); g.arc(cx, my + r * 0.2, r * 0.28, Math.PI * 1.2, Math.PI * 1.8); g.stroke(); }
    else if (expr === "shouting") { path(rr(cx - r * 0.22, my - r * 0.12, r * 0.44, r * 0.4, r * 0.18)); g.fillStyle = "#3a0d12"; g.fill(); g.lineWidth = r * 0.05; g.stroke(); g.fillStyle = "#e0646e"; g.beginPath(); g.arc(cx, my + r * 0.18, r * 0.1, 0, 7); g.fill(); }
    else { g.beginPath(); for (let i = 0; i <= 12; i++) { const a = (Math.PI * i) / 12; g.lineTo(cx + Math.cos(a) * r * 0.42, my - r * 0.06 + Math.sin(a) * r * 0.32); } g.closePath(); g.fillStyle = "#fbfbfb"; g.fill(); g.lineWidth = r * 0.06; g.stroke(); }
  }
  function shoulders(cx: number, cy: number) {
    opoly([[cx - 44, 112], [cx - 42, cy + 2], [cx - 30, cy - 12], [cx - 12, cy - 16], [cx + 12, cy - 16], [cx + 30, cy - 12], [cx + 42, cy + 2], [cx + 44, 112]], shirt);
    if (lk.striped && !lk.suit) { g.fillStyle = lk.c2 ?? "#fff"; for (const sx of [-24, 0, 24]) g.fillRect(cx + sx - 5, cy - 12, 10, 40); }
    if (lk.suit) {
      path([[cx - 10, cy - 15], [cx + 10, cy - 15], [cx, cy + 14]]); g.fillStyle = "#f4f6fa"; g.fill();
      if (lk.tie !== false) { path([[cx - 3, cy - 12], [cx + 3, cy - 12], [cx + 5, cy + 12], [cx, cy + 18], [cx - 5, cy + 12]]); g.fillStyle = "#b8262f"; g.fill(); }
    } else {
      path([[cx - 11, cy - 15], [cx + 11, cy - 15], [cx, cy - 2]]); g.fillStyle = lk.c2 ?? "#fff"; g.fill();
      path([[cx - 7, cy - 15], [cx + 7, cy - 15], [cx, cy - 6]]); g.fillStyle = skin; g.fill();
      if (lk.num) { g.fillStyle = lum(shirt) > 0.55 ? "#151515" : "#f4f4f4"; g.font = "700 14px Display, sans-serif"; g.textAlign = "center"; g.fillText(lk.num, cx + 25, cy + 16); }
    }
  }
  function bodyFull(cx: number, cy: number) {
    const shorts = lk.suit ? "#20242c" : lk.c2 ?? "#ffffff", boots = lk.boots ?? "#17171b", up = lk.armsUp || lk.expr === "shouting";
    for (const sd of [-1, 1]) {
      opoly(rr(cx + sd * 11 - 7, cy + 52, 14, 30, 5), skin);
      opoly(rr(cx + sd * 11 - 8, cy + 64, 16, 26, 4), lk.suit ? "#20242c" : shirt);
      opoly(rr(cx + sd * 11 - 10, cy + 88, 20, 10, 4), boots);
    }
    for (const sd of [-1, 1]) {
      const sx = cx + sd * 22, sy = cy + 6, hx = sx + sd * (up ? 10 : 8), hy = sy + (up ? -34 : 30);
      const line = (x2: number, y2: number, w: number, col: string) => { g.strokeStyle = INK; g.lineWidth = w + o * 2; g.beginPath(); g.moveTo(sx, sy); g.lineTo(x2, y2); g.stroke(); g.strokeStyle = col; g.lineWidth = w; g.stroke(); };
      line(hx, hy, 12, skin); ocircle(hx, hy, 6.5, skin); line(sx + (hx - sx) * 0.4, sy + (hy - sy) * 0.4, 15, shirt);
    }
    opoly(rr(cx - 24, cy - 2, 48, 40, 10), shirt);
    if (lk.striped) { g.fillStyle = lk.c2 ?? "#fff"; for (const sx of [-12, 4]) g.fillRect(cx + sx, cy + 2, 8, 34); }
    opoly(rr(cx - 23, cy + 36, 46, 20, 5), shorts);
    if (lk.num) { g.fillStyle = lum(shirt) > 0.55 ? "#151515" : "#f4f4f4"; g.font = "700 18px Display, sans-serif"; g.textAlign = "center"; g.fillText(lk.num, cx, cy + 28); }
  }
}
