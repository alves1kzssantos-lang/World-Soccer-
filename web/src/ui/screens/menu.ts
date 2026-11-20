// Abertura, carreiras, nova carreira (liga e clube) e criação de técnico/jogador.
import { h } from "../dom";
import type { Ctx } from "../ctx";
import { clubCrest } from "../ctx";
import { button, card, tapCard, chip, toast } from "../widgets";
import { header } from "../nav";
import { compLogo } from "../assets";
import { portrait, STYLE_NAMES, SKINS, HAIRS, type Look } from "../chibi";

export function registerMenu(ctx: Ctx): void {
  const { nav, api, base } = ctx;

  nav.register("title", () => h("div", null,
    h("div.title-art", { style: `background-image:url(${base}art/banner.webp)` }),
    h("div.title-menu.card.glow.col", { style: "gap:10px;padding:16px;background:rgba(10,12,11,.82);backdrop-filter:blur(6px)" },
      h("div.neon", { style: "font:700 1.1em Display;text-align:center;letter-spacing:.08em" }, "♛ MENU PRINCIPAL"),
      button("NOVA CARREIRA  ›", () => nav.go("careers"), "primary"),
      button("CONTINUAR", () => { const s = api.slots().find((x) => !x.empty); if (s && api.load(s.slot)) nav.reset("hub"); else nav.go("careers"); }),
      button("MINHAS CARREIRAS", () => nav.go("careers")),
      h("div.small.muted", { style: "text-align:center;margin-top:4px" }, "JOGUE. VIVA. FAÇA HISTÓRIA."))));

  nav.register("careers", () => h("div", null, header(nav, "Minhas carreiras", "Até quatro carreiras independentes"),
    h("div.ws-body", { style: "flex-wrap:wrap;align-content:flex-start" }, api.slots().map((s) =>
      card(null, h("div.slot", { style: "width:calc(50vw - 40px);max-width:560px" },
        h("div.row", null, s.club ? clubCrest(s.club, 40) : h("div.big.muted", null, `${s.slot + 1}`),
          h("div.grow", null, h("div", { style: "font:700 1.25em Display" }, s.empty ? `Carreira ${s.slot + 1}` : `${s.who} — ${s.club!.name}`),
            h("div.small.muted", null, s.empty ? "Espaço disponível para uma nova história" : `${s.mode === "jogador" ? "Carreira de jogador" : "Carreira de técnico"} • ${s.league} • Temporada ${s.season}`))),
        s.empty
          ? h("div.row", { style: "margin-top:10px" }, button("Carreira de técnico", () => nav.go("league", { slot: s.slot, mode: "tecnico" }), "primary"),
              button("Carreira de jogador", () => nav.go("league", { slot: s.slot, mode: "jogador" }), "gold"))
          : h("div.row", { style: "margin-top:10px" }, button("Continuar  ›", () => { if (api.load(s.slot)) nav.reset("hub"); }, "primary"))))))));

  nav.register("league", (arg) => {
    const a = arg as { slot: number; mode: "tecnico" | "jogador" };
    const ls = api.leagues();
    let li = 0;
    const host = h("div.grow.col");
    const paint = () => {
      const lg = ls[li];
      host.replaceChildren(
        h("div.row", null, button("‹", () => { li = (li + ls.length - 1) % ls.length; paint(); }), h("div.grow.row", { style: "justify-content:center" }, compLogo(lg.compId, 40),
          h("div", null, h("div", { style: "font:700 1.4em Display" }, lg.name), h("div.small.muted", null, `${lg.country} • ${lg.clubs.length} clubes`))), button("›", () => { li = (li + 1) % ls.length; paint(); })),
        h("div.scroll.grow", { style: "display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;align-content:start" },
          lg.clubs.map((c) => tapCard(null, () => nav.go(a.mode === "tecnico" ? "coach" : "pro_create", { ...a, league: lg.idx, club: c.id }),
            h("div.row", null, clubCrest(c, 40), h("div.grow", null, h("div", { style: "font-weight:700" }, c.name), h("div.small.muted", null, `Força ${c.str}`)))))));
    };
    paint();
    return h("div", null, header(nav, "Nova carreira", "Escolha a liga e o clube"), host);
  });

  const creator = (kind: "coach" | "pro") => (arg: unknown) => {
    const a = arg as { slot: number; mode: "tecnico" | "jogador"; league: number; club: number };
    const st = { name: kind === "coach" ? "Alves" : "Kauã Silva", skin: 1, hstyle: 0, hcolor: 0, beard: false, pos: "MEI", age: 17 };
    const prev = h("div", { style: "display:flex;align-items:flex-end;justify-content:center;height:100%" });
    const look = (): Look => kind === "coach"
      ? { skin: st.skin, hstyle: st.hstyle, hcolor: st.hcolor, beard: st.beard, suit: "#1d2333", tie: true, expr: "smile" }
      : { skin: st.skin, hstyle: st.hstyle, hcolor: st.hcolor, beard: st.beard, c1: "#c4161c", c2: "#111111", num: "10", expr: "smile" };
    const redraw = () => prev.replaceChildren(portrait(look(), Math.min(200, innerHeight * 0.32), "full"));
    const pick = (label: string, n: number, get: () => number, set: (v: number) => void, swatch?: string[], names?: string[]) => {
      const row = h("div.row", { style: "flex-wrap:wrap;gap:6px" });
      const paint = () => row.replaceChildren(...Array.from({ length: n }, (_, i) => button(swatch ? "" : names ? names[i] : String(i + 1), () => { set(i); paint(); redraw(); }, "",
        { class: get() === i ? "on" : "", style: swatch ? `background:${swatch[i]};min-width:38px;min-height:38px;${get() === i ? "outline:3px solid var(--accent)" : ""}` : get() === i ? "background:var(--accent);color:var(--on-accent)" : "" })));
      paint();
      return h("div", null, h("div.small.muted", null, label), row);
    };
    const name = h("input", { value: st.name, maxlength: "22", style: "width:100%;min-height:44px;border-radius:9px;border:1px solid var(--line);background:var(--panel2);color:var(--txt);padding:0 12px;font:700 1em Body", oninput: (e: Event) => { st.name = (e.target as HTMLInputElement).value; } });
    redraw();
    return h("div", null, header(nav, kind === "coach" ? "Seu técnico" : "Seu jogador", "Visual e dados"),
      h("div.ws-body", null,
        card(null, prev),
        h("div.grow.col.scroll", null, card("Nome", name),
          card("Visual", h("div.col", null, pick("Pele", 6, () => st.skin, (v) => (st.skin = v), SKINS), pick("Cabelo", 8, () => st.hstyle, (v) => (st.hstyle = v), undefined, STYLE_NAMES),
            pick("Cor do cabelo", 6, () => st.hcolor, (v) => (st.hcolor = v), HAIRS), pick("Barba", 2, () => (st.beard ? 1 : 0), (v) => (st.beard = v === 1), undefined, ["Sem", "Com"]))),
          kind === "pro" ? card("Posição", pick("", 9, () => ["GOL", "ZAG", "LD", "LE", "VOL", "MEI", "PD", "PE", "AC"].indexOf(st.pos), (v) => (st.pos = ["GOL", "ZAG", "LD", "LE", "VOL", "MEI", "PD", "PE", "AC"][v]), undefined, ["GOL", "ZAG", "LD", "LE", "VOL", "MEI", "PD", "PE", "AC"])) : null,
          button("Começar carreira  ›", () => { api.newCareer(a.slot, a.mode, a.league, a.club, st); toast("Carreira criada!"); nav.reset("hub"); }, "primary"))));
  };
  nav.register("coach", creator("coach"));
  nav.register("pro_create", creator("pro"));
  void chip;
}
