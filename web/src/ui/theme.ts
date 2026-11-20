// Temas: marca (padrão) e um por competição (public/art/temas.json, exportado do jogo).
export interface CompTheme {
  name: string; accent: string; accent2: string; bg1: string; bg2: string; bar: string; score: string;
  pattern: string; score_style: string; title_style: string; trophy: string;
}

let data: { default: CompTheme; themes: Record<string, CompTheme>; comps: Record<string, string> } | null = null;

export async function loadThemes(base = "./"): Promise<void> {
  try { data = await (await fetch(base + "art/temas.json")).json(); } catch { data = null; }
}

const hex = (s: string) => (s.startsWith("#") ? s : "#" + s);

/** Tema de uma competição pelo nome (como no jogo); cai no tema da marca. */
export function themeFor(compName?: string): CompTheme {
  const def: CompTheme = data?.default ?? { name: "World Soccer", accent: "39e33f", accent2: "ffffff", bg1: "0b0d0c", bg2: "151917",
    bar: "090b0a", score: "050706", pattern: "diagonal", score_style: "inclinado", title_style: "inclinado", trophy: "ouro" };
  if (!compName || !data) return def;
  const key = data.comps[compName];
  return (key && data.themes[key]) || def;
}

/** Luminância relativa (WCAG) para escolher texto claro/escuro sobre a cor de destaque. */
export function luminance(c: string): number {
  const v = hex(c).slice(1);
  const ch = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Aplica o tema nas variáveis CSS do elemento (ou da raiz). */
export function applyTheme(t: CompTheme, el: HTMLElement = document.documentElement): void {
  el.style.setProperty("--accent", hex(t.accent));
  el.style.setProperty("--accent2", hex(t.accent2));
  el.style.setProperty("--bg", hex(t.bg1));
  el.style.setProperty("--bg2", hex(t.bg2));
  el.style.setProperty("--on-accent", luminance(t.accent) > 0.35 ? "#07120a" : "#ffffff");
}
