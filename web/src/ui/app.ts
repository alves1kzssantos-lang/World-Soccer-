// Monta a interface: tema, atlas, tela de carregamento, pilha de telas e aviso de girar o celular.
import "./ui.css";
import { h } from "./dom";
import { Nav } from "./nav";
import { Loading } from "./loading";
import { loadAtlas } from "./assets";
import { loadThemes } from "./theme";
import { setOverlayRoot } from "./widgets";
import { MockCareer, type CareerApi } from "./career_api";
import { createRealCareer } from "./real_career";
import type { Ctx, MatchMount } from "./ctx";
import { registerMenu } from "./screens/menu";
import { registerClub } from "./screens/club";
import { registerComp } from "./screens/comp";

export interface UiOptions { api?: CareerApi; mock?: boolean; base?: string; mountMatch?: MatchMount; start?: string; warmup?: (p: (k: number, msg?: string) => void) => Promise<void> }

export async function startUI(opts: UiOptions = {}): Promise<{ nav: Nav; ctx: Ctx }> {
  const base = opts.base ?? "./";
  const root = h("div.ws-root");
  const bg = h("div.ws-bg.ws-brush");
  const stack = h("div.ws-stack");
  root.append(bg, stack, h("div.rotate", null, h("div", { style: "font:700 2em Display" }, "↻"), h("div", null, "Gire o celular para jogar na horizontal")));
  document.body.appendChild(root);
  setOverlayRoot(root);
  const ld = new Loading(base);
  root.appendChild(ld.el);
  ld.progress(0.1, "Carregando temas…");
  await loadThemes(base);
  ld.progress(0.3, "Carregando escudos e logos…");
  await loadAtlas(base);
  await document.fonts?.ready;
  let api = opts.api;
  if (!api && !opts.mock) {
    ld.progress(0.45, "Montando os elencos reais…");
    try { api = await createRealCareer(base); } catch (e) { console.warn("carreira real indisponível, usando exemplo", e); }
  }
  if (opts.warmup) await opts.warmup((k, m) => ld.progress(0.6 + k * 0.35, m));
  const nav = new Nav(stack);
  const ctx: Ctx = { nav, api: api ?? new MockCareer(), base, mountMatch: opts.mountMatch };
  registerMenu(ctx);
  registerClub(ctx);
  registerComp(ctx);
  nav.reset(opts.start ?? "title");
  await ld.close(1100);
  // botão voltar do Android / navegador
  addEventListener("popstate", () => nav.back());
  return { nav, ctx };
}
