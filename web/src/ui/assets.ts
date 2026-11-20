// Escudos, logos de competição e placas (atlas WebP em public/art) + emblema de reserva.
type Rect = [number, number, number, number, number]; // folha, x, y, w, h
interface Atlas { cell: { crests: number; comps: number }; sheets: { crests: number; comps: number };
  crests: Record<string, Rect>; comps: Record<string, Rect>; ads: Record<string, [number, number, number][]> }

let atlas: Atlas | null = null;
let base = "./";
const imgs = new Map<string, HTMLImageElement>();

export async function loadAtlas(b = "./"): Promise<void> {
  base = b;
  atlas = await (await fetch(base + "art/atlas.json")).json();
}

function sheetUrl(kind: "crests" | "comps", i: number): string { return `${base}art/${kind}_${i}.webp`; }

/** Imagem de uma folha (para desenhar no canvas). */
export function sheetImage(url: string): HTMLImageElement {
  let im = imgs.get(url);
  if (!im) { im = new Image(); im.decoding = "async"; im.src = url; imgs.set(url, im); }
  return im;
}

function sprite(kind: "crests" | "comps", id: number | string, size: number): HTMLElement | null {
  const r = atlas?.[kind][String(id)];
  if (!r || !atlas) return null;
  const [sheet, x, y, w, hgt] = r;
  const k = size / Math.max(w, hgt);
  const el = document.createElement("span");
  el.className = "crest";
  const per = kind === "crests" ? 21 : 16;
  const cell = atlas.cell[kind];
  el.style.width = `${Math.round(w * k)}px`;
  el.style.height = `${Math.round(hgt * k)}px`;
  el.style.margin = `${Math.round((size - hgt * k) / 2)}px ${Math.round((size - w * k) / 2)}px`;
  el.style.backgroundImage = `url(${sheetUrl(kind, sheet)})`;
  el.style.backgroundSize = `${per * cell * k}px auto`;
  el.style.backgroundPosition = `${-x * k}px ${-y * k}px`;
  return el;
}

/** Emblema desenhado quando não há imagem: círculo nas cores do clube com a sigla. */
export function fallbackBadge(short: string, c1 = "#2f6fd6", c2 = "#ffffff", size = 32): HTMLElement {
  const el = document.createElement("span");
  el.className = "badge-fb";
  Object.assign(el.style, { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.34)}px`,
    background: `linear-gradient(180deg, ${c1} 0 38%, ${c2} 38% 62%, ${c1} 62%)`, border: "2px solid #f4f6fa",
    color: c2 === "#ffffff" || c2.toLowerCase() === "#fff" ? "#111" : "#fff" });
  el.textContent = short.slice(0, 3).toUpperCase();
  return el;
}

/** Escudo do clube pelo id do pacote; sem id/imagem, emblema nas cores. */
export function crest(packId: number | undefined, size: number, short = "", c1?: string, c2?: string): HTMLElement {
  return (packId !== undefined && packId >= 0 && sprite("crests", packId, size)) || fallbackBadge(short || "?", c1, c2, size);
}

/** Logo da competição; sem logo, o emblema da marca (hexágono com bola). */
export function compLogo(compId: number | undefined, size: number): HTMLElement {
  const s = compId !== undefined && compId >= 0 ? sprite("comps", compId, size) : null;
  if (s) return s;
  const c = document.createElement("canvas");
  const dpr = Math.min(devicePixelRatio || 1, 3);
  c.width = c.height = Math.round(size * dpr);
  c.style.width = c.style.height = `${size}px`;
  drawBadge(c.getContext("2d")!, c.width);
  return c;
}

export function drawBadge(g: CanvasRenderingContext2D, n: number): void {
  const r = n * 0.47, cx = n / 2, cy = n / 2;
  const hexPath = (rr: number) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (Math.PI * 2 * i) / 6; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); };
  hexPath(r); g.fillStyle = "#e6c56a"; g.fill();
  hexPath(r * 0.88); g.fillStyle = "#14281f"; g.fill();
  g.beginPath(); g.arc(cx, cy, r * 0.42, 0, Math.PI * 2); g.fillStyle = "#f3f5f8"; g.fill();
  g.fillStyle = "#1a1d22";
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (Math.PI * 2 * i) / 5; g.beginPath(); g.arc(cx + Math.cos(a) * r * 0.27, cy + Math.sin(a) * r * 0.27, r * 0.09, 0, Math.PI * 2); g.fill(); }
  g.beginPath(); g.arc(cx, cy, r * 0.11, 0, Math.PI * 2); g.fill();
}

/** Placas de publicidade de uma pasta (ex.: "country-BRA"): [url, faixas {linha, x, w}] para o campo. */
export function adboards(key: string): { url: string; rects: [number, number, number][] } | null {
  const r = atlas?.ads[key] ?? atlas?.ads["generic"];
  if (!r) return null;
  return { url: `${base}art/ads_${atlas?.ads[key] ? key : "generic"}.webp`, rects: r };
}
