// Componentes da interface: botão, cartão, chip, barra, abas, lista virtual, modal, aviso, gráficos.
import { h, clear } from "./dom";

export function button(label: string | Node, onClick: () => void, kind: "" | "primary" | "gold" | "ghost" | "danger" = "", extra: Record<string, unknown> = {}): HTMLElement {
  return h(`button.btn${kind ? "." + kind : ""}`, { onclick: (e: Event) => { e.stopPropagation(); onClick(); }, ...extra }, label);
}

export function card(title: string | null, ...kids: (Node | string | null | false)[]): HTMLElement {
  return h("div.card", null, title ? h("div.ct", null, title) : null, ...kids);
}

export function tapCard(title: string | null, onClick: () => void, ...kids: (Node | string | null | false)[]): HTMLElement {
  const c = card(title, ...kids);
  c.classList.add("tap");
  c.addEventListener("click", onClick);
  return c;
}

export function chip(text: string, cls = "", bg?: string): HTMLElement {
  const c = h(`span.chip${cls ? "." + cls : ""}`, null, text);
  if (bg) c.style.background = bg;
  return c;
}

const POS_COLORS: Record<string, string> = { GOL: "#f2a33c", ZAG: "#e6c24d", LD: "#e6c24d", LE: "#e6c24d", VOL: "#6cd18a", MEI: "#6cd18a", PD: "#6cb6ff", PE: "#6cb6ff", AC: "#ff8f73" };
export function posChip(pos: string): HTMLElement { return chip(pos, "pos", POS_COLORS[pos] ?? "#9aa"); }

/** Barra de 0..1; cor automática para energia (verde/amarelo/vermelho). */
export function bar(v: number, color?: string, energy = false): HTMLElement {
  const i = h("i");
  const k = Math.max(0, Math.min(1, v));
  i.style.width = `${k * 100}%`;
  if (energy) i.style.background = k >= 0.75 ? "var(--accent)" : k >= 0.55 ? "#f2c64a" : "#ff5b6b";
  else if (color) i.style.background = color;
  return h("div.bar", null, i);
}

export function tabs(names: string[], active: number, onPick: (i: number) => void): HTMLElement {
  return h("div.tabs", null, names.map((n, i) => button(n, () => onPick(i), "", { class: i === active ? "on" : "" })));
}

/**
 * Lista virtual: só monta as linhas visíveis (elenco, mercado, rede social com centenas de itens).
 * rowH em px; render(i) devolve a linha.
 */
export function virtualList(count: number, rowH: number, render: (i: number) => HTMLElement): HTMLElement {
  const outer = h("div.scroll.grow", { style: "position:relative" });
  const inner = h("div", { style: `position:relative;height:${count * rowH}px` });
  outer.appendChild(inner);
  const live = new Map<number, HTMLElement>();
  const paint = () => {
    const top = outer.scrollTop, hgt = outer.clientHeight || 400;
    const a = Math.max(0, Math.floor(top / rowH) - 4), b = Math.min(count, Math.ceil((top + hgt) / rowH) + 4);
    for (const [i, el] of live) if (i < a || i >= b) { el.remove(); live.delete(i); }
    for (let i = a; i < b; i++) if (!live.has(i)) {
      const el = render(i);
      Object.assign(el.style, { position: "absolute", left: "0", right: "0", top: `${i * rowH}px` });
      inner.appendChild(el);
      live.set(i, el);
    }
  };
  outer.addEventListener("scroll", () => requestAnimationFrame(paint), { passive: true });
  requestAnimationFrame(paint);
  new ResizeObserver(paint).observe(outer);
  return outer;
}

let root: HTMLElement | null = null;
export function setOverlayRoot(r: HTMLElement): void { root = r; }

export function toast(msg: string, ms = 2200): void {
  if (!root) return;
  const t = h("div.toast", null, msg);
  root.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function modal(build: (close: () => void) => HTMLElement): () => void {
  const bg = h("div.modal-bg");
  const close = () => bg.remove();
  bg.addEventListener("click", (e) => { if (e.target === bg) close(); });
  const m = build(close);
  m.classList.add("modal");
  bg.appendChild(m);
  root?.appendChild(bg);
  return close;
}

/** Canvas que se ajusta ao tamanho do elemento e redesenha (gráficos). */
export function canvasBox(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): HTMLElement {
  const c = h("canvas.chart") as HTMLCanvasElement;
  const paint = () => {
    const dpr = Math.min(devicePixelRatio || 1, 3), w = c.clientWidth, hh = c.clientHeight;
    if (!w || !hh) return;
    c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr);
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(g, w, hh);
  };
  new ResizeObserver(paint).observe(c);
  return c;
}

/** Linha com área (evolução do caixa). */
export function lineChart(values: number[], color = "#39e33f"): HTMLElement {
  return canvasBox((g, w, hh) => {
    if (values.length < 2) return;
    const mn = Math.min(...values), mx = Math.max(...values), pad = 6, span = mx - mn || 1;
    const X = (i: number) => pad + ((w - pad * 2) * i) / (values.length - 1), Y = (v: number) => hh - pad - ((hh - pad * 2) * (v - mn)) / span;
    g.beginPath(); values.forEach((v, i) => g.lineTo(X(i), Y(v))); g.lineTo(X(values.length - 1), hh); g.lineTo(X(0), hh); g.closePath();
    const gr = g.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, color + "55"); gr.addColorStop(1, color + "00"); g.fillStyle = gr; g.fill();
    g.beginPath(); values.forEach((v, i) => g.lineTo(X(i), Y(v))); g.strokeStyle = color; g.lineWidth = 3; g.lineJoin = "round"; g.stroke();
    g.fillStyle = color; g.beginPath(); g.arc(X(values.length - 1), Y(values[values.length - 1]), 4.5, 0, 7); g.fill();
  });
}

/** Barras horizontais de receitas (verde) e despesas (vermelho). */
export function barsChart(items: { label: string; value: number }[]): HTMLElement {
  return canvasBox((g, w, hh) => {
    const mx = Math.max(1, ...items.map((i) => Math.abs(i.value)));
    const rh = hh / Math.max(1, items.length);
    g.font = "600 12px Body, sans-serif"; g.textBaseline = "middle";
    items.forEach((it, i) => {
      const y = i * rh + rh / 2, x0 = w * 0.42, bw = (w * 0.4 * Math.abs(it.value)) / mx;
      g.fillStyle = "#a3ada7"; g.textAlign = "left"; g.fillText(it.label, 0, y);
      g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(x0, y - 5, w * 0.4, 10);
      g.fillStyle = it.value >= 0 ? "#39e33f" : "#e5535f"; g.fillRect(x0, y - 5, bw, 10);
    });
  });
}

export { h, clear };
