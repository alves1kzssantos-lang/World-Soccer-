// Tabela/resultados/calendário, copas (chaveamento), coletiva, redes sociais, fim de temporada,
// pré-jogo, pós-jogo e o contêiner da partida.
import { h } from "../dom";
import type { Ctx } from "../ctx";
import { clubCrest } from "../ctx";
import type { MatchResultVM } from "../career_api";
import { button, card, chip, bar, tabs, toast, virtualList } from "../widgets";
import { header } from "../nav";
import { compLogo } from "../assets";
import { portrait, lookForHandle, lookForPlayer } from "../chibi";
import { applyTheme, themeFor } from "../theme";
import { Loading } from "../loading";

export function registerComp(ctx: Ctx): void {
  const { nav, api, base } = ctx;
  const M = (v: number) => api.money(v);

  nav.register("table", (arg) => {
    let tab = typeof arg === "number" ? arg : 0;
    const host = h("div.grow.col");
    const hb = api.hub();
    const paint = () => {
      let content: HTMLElement;
      if (tab === 0) {
        const rows = api.table();
        content = h("div.col.grow", null,
          h("div.row.small.muted", { style: "padding:0 10px;gap:8px" }, h("span", { style: "width:26px" }, "#"), h("span.grow", null, "CLUBE"), ...["J", "V", "E", "D", "SG", "PTS"].map((k) => h("span", { style: "width:34px;text-align:center" }, k))),
          virtualList(rows.length, 46, (i) => { const r = rows[i]; return h("div.lrow", { style: `height:42px;${r.me ? "outline:1px solid var(--accent)" : ""};${r.pos <= 4 ? "border-left:3px solid var(--accent)" : r.pos > rows.length - 4 ? "border-left:3px solid #e5535f" : ""}` },
            h("b.num", { style: "width:26px" }, String(r.pos)), clubCrest(r.club, 26), h("div.name", null, r.club.name),
            ...[r.p, r.w, r.d, r.l, r.gf - r.ga].map((v) => h("span.num", { style: "width:34px;text-align:center" }, String(v))), h("b.num.neon", { style: "width:34px;text-align:center" }, String(r.pts))); }));
      } else if (tab === 1) {
        content = h("div.scroll.grow", null, api.results().map((r) => h("div.lrow", null, h("span.small.muted", { style: "width:80px" }, r.round), h("div.name", { style: "text-align:right" }, r.home.name), clubCrest(r.home, 24),
          h("b.num", { style: "width:56px;text-align:center" }, `${r.hg} × ${r.ag}`), clubCrest(r.away, 24), h("div.name", null, r.away.name))));
      } else {
        content = h("div.scroll.grow", null, api.calendar().map((c) => h("div.lrow", { style: `border-left:3px solid #${themeFor(c.comp).accent}` }, h("b.num", { style: "width:56px" }, c.date), compLogo(c.compId, 24),
          h("span.small", { style: "width:160px" }, c.comp), clubCrest(c.opp, 26), h("div.name", null, `${c.opp.name} (${c.home ? "C" : "F"})`))));
      }
      host.replaceChildren(tabs(["Classificação", "Resultados", "Calendário"], tab, (i) => { tab = i; paint(); }), content);
    };
    paint();
    return h("div", null, header(nav, hb.league, `Temporada ${hb.season}`, null, compLogo(hb.compId, 40)), host);
  });


  nav.register("cups", () => {
    const cups = api.cups();
    let ci = 0;
    const host = h("div.grow.col");
    const paint = () => {
      const c = cups[ci];
      if (!c) { host.replaceChildren(h("div.muted", null, "Seu clube não disputa copas nesta temporada.")); return; }
      const th = themeFor(c.name);
      host.style.setProperty("--accent", "#" + th.accent);
      host.replaceChildren(
        h("div.row", null, cups.length > 1 ? tabs(cups.map((x) => x.name), ci, (i) => { ci = i; paint(); }) : null),
        h("div.row", null, compLogo(c.compId, 44), h("div", { style: "font:700 1.5em Display" }, c.name), c.champion ? chip(`Campeão: ${c.champion.name}`, "", "#" + th.accent) : null),
        h("div.scroll.grow", { style: "overflow-x:auto" }, h("div.bracket", null, c.rounds.map((r) => h("div.rnd", null, h("div.small.neon", { style: "font-weight:700" }, r.name.toUpperCase()),
          r.ties.length ? r.ties.map((t) => h("div.tie", null,
            h("div.row", { style: "gap:6px" }, clubCrest(t.a, 20), h("span.grow", { class: t.winner === 0 ? "w" : "" }, t.a.name), h("b.num", null, t.sa)),
            h("div.row", { style: "gap:6px" }, clubCrest(t.b, 20), h("span.grow", { class: t.winner === 1 ? "w" : "" }, t.b.name), h("b.num", null, t.sb)))) : h("div.tie.muted", null, "A definir"))))));
    };
    paint();
    return h("div", null, header(nav, "Copas", "Chaveamento e resultados"), host);
  });

  nav.register("press", () => {
    const qs = api.pressQuestions();
    let qi = 0;
    const host = h("div.grow.col");
    const reporter = lookForHandle("reporter_tv1", "serious", "#2a3a5a");
    const meters = h("div.col", { style: "gap:6px" });
    const paintMeters = (m: Record<string, number>) => meters.replaceChildren(...Object.entries(m).map(([k, v]) =>
      h("div", null, h("div.row.small", { style: "justify-content:space-between" }, h("span.muted", null, k[0].toUpperCase() + k.slice(1)), h("b", null, String(Math.round(v)))), bar(v / 100))));
    paintMeters(api.meters());
    const paint = () => {
      const q = qs[qi];
      if (!q) { host.replaceChildren(h("div.col", { style: "align-items:center;justify-content:center;height:100%" }, h("div.big", null, "Coletiva encerrada"), button("Voltar ao clube", () => nav.back(), "primary"))); return; }
      const tones: [keyof typeof q.answers, string, string][] = [["humilde", "HUMILDE", "#1e8a2e"], ["confiante", "CONFIANTE", "#2463b8"], ["provocar", "PROVOCAR", "#a3243b"], ["desviar", "DESCONVERSAR", "#3a403c"]];
      host.replaceChildren(
        h("div.card.row", { style: "background:#f4f6f8;color:#111" }, portrait(reporter, 54, "head"), h("div.grow", { style: "font:700 1.1em Body" }, `“${q.q}”`), h("span.small", null, `${qi + 1}/${qs.length}`)),
        h("div.grow", { style: "display:grid;grid-template-columns:1fr 1fr;gap:8px" }, tones.map(([k, label, col]) =>
          h("div.card.tap", { onclick: () => { const r = api.answerPress(k); paintMeters(r.meters); toast(r.reaction); qi++; paint(); } }, chip(label, "", col), h("div", { style: "margin-top:6px" }, q.answers[k])))),
        button("Pular coletiva", () => nav.back(), "ghost"));
    };
    paint();
    return h("div", null, header(nav, "Coletiva de imprensa", "O tom da resposta mexe com diretoria, torcida, elenco e imprensa"),
      h("div.ws-body", null, h("div.col.grow", { style: "flex:3" }, host), card("Repercussão", meters)));
  });

  nav.register("social", () => {
    let tab = 0;
    const host = h("div.grow.col");
    const hb = api.hub();
    const expr = { torcida: "smile", corneta: "angry", imprensa: "serious", rival: "shouting", voce: "smile" } as const;
    const tagCol = { torcida: "#1e8a2e", corneta: "#a3243b", imprensa: "#2463b8", rival: "#7a3ab8", voce: "#39e33f" } as const;
    const paint = () => {
      const posts = api.social(tab);
      host.replaceChildren(tabs(["Para você", "Torcida", "Cornetas", "Imprensa", "Rivais"], tab, (i) => { tab = i; paint(); }),
        virtualList(posts.length, 86, (i) => { const p = posts[i]; return h("div.post", { style: "height:80px" }, portrait(lookForHandle(p.user, expr[p.kind]), 40, "head"),
          h("div.grow", null, h("div.row", { style: "gap:6px" }, h("b", null, p.user), p.verified ? h("span.neon", null, "✔") : null, h("span.small.muted", null, `• ${p.when}`), h("span.grow"), chip(p.kind.toUpperCase(), "", tagCol[p.kind])),
            h("div", { style: "margin:3px 0" }, p.text), h("div.small.muted", null, `♥ ${p.likes}`))); }));
    };
    paint();
    return h("div", null, header(nav, "Redes sociais", "Torcida, cornetas, imprensa e rivais"),
      h("div.ws-body", null, h("div.col.grow", { style: "flex:3" }, host),
        card(null, h("div.col", null, h("div.huge.neon", null, `${hb.approval}%`), h("div.small.muted", null, "aprovação"), h("div", null, `${hb.followers} seguidores`),
          h("div.small.muted", { style: "margin-top:8px" }, "EM ALTA"), ...["#Coletiva", "#" + hb.club.name.replace(/\s/g, ""), "#Brasileirão"].map((t) => h("b.neon", null, t))))));
  });

  nav.register("season_end", () => {
    const s = api.seasonSummary();
    return h("div", null, header(nav, "Fim de temporada", ""),
      h("div.ws-body", null,
        card(null, h("div.col", null, h("div.huge.gold", null, s.pos === 1 ? "CAMPEÃO!" : `${s.pos}º LUGAR`), h("div.row", null, clubCrest(s.champion, 40), h("b", null, `Campeão: ${s.champion.name}`)),
          h("div", null, `Premiação: ${M(s.prize)}`), h("div.muted", null, `Artilheiro: ${s.topScorer}`), ...s.titles.map((t) => h("div.gold", null, `♛ ${t}`)))),
        h("div.col.grow", { style: "justify-content:flex-end" }, button("Iniciar nova temporada  ›", () => { api.newSeason(); nav.reset("hub"); }, "primary"))));
  });

  nav.register("prematch", () => {
    const m = api.nextMatch()!;
    const th = themeFor(m.comp);
    const el = h("div", null, header(nav, "Pré-jogo", `${m.comp} • ${m.stage}`, null, compLogo(m.compId, 40)),
      h("div.ws-body", { style: "align-items:center;justify-content:center;gap:5vw" },
        h("div.col", { style: "align-items:center" }, clubCrest(m.home, Math.min(140, innerHeight * 0.26)), h("div", { style: "font:700 1.4em Display" }, m.home.name)),
        h("div.huge", { style: `color:#${th.accent}` }, "VS"),
        h("div.col", { style: "align-items:center" }, clubCrest(m.away, Math.min(140, innerHeight * 0.26)), h("div", { style: "font:700 1.4em Display" }, m.away.name))),
      h("div.row", null, button("Escalação", () => nav.go("lineup")), button("ENTRAR EM CAMPO  ›", () => nav.replace("match", m), "primary", { style: "flex:1" })));
    applyTheme(th, el);
    return el;
  });

  nav.register("match", (arg) => {
    const m = arg as ReturnType<typeof api.nextMatch>;
    const mount = h("div.match-mount");
    const hud = h("div.hud");
    const el = h("div", { style: "padding:0" }, mount, hud);
    applyTheme(themeFor(m?.comp), el);
    const ld = new Loading(base, "Preparando o estádio…");
    el.appendChild(ld.el);
    const finish = (r: { hg: number; ag: number }) => nav.replace("postmatch", api.playMatch(r));
    requestAnimationFrame(async () => {
      ld.progress(0.4, "Aquecendo os jogadores…");
      if (ctx.mountMatch && m) ctx.mountMatch(mount, { homeId: m.home.id, awayId: m.away.id, comp: m.comp, compId: m.compId }, finish);
      else hud.appendChild(h("div", { style: "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px" },
        h("div.muted", null, "A partida aparece aqui (módulo web/src/match)."), button("Simular resultado", () => finish({ hg: 2, ag: 1 }), "primary")));
      await ld.close(800);
    });
    return el;
  });

  nav.register("postmatch", (arg) => {
    const r = arg as MatchResultVM;
    return h("div", null, header(nav, "Fim de jogo", ""),
      h("div.ws-body", null,
        h("div.col.grow", null,
          card(null, h("div.row", { style: "justify-content:space-between" }, h("div.row", null, clubCrest(r.home, 50), h("b", null, r.home.name)),
            h("div.huge.num", null, `${r.hg} × ${r.ag}`), h("div.row", null, h("b", null, r.away.name), clubCrest(r.away, 50)))),
          card("Estatísticas", h("div.col", { style: "gap:6px" }, r.stats.map(([k, a, b]) => h("div", null,
            h("div.row.small", { style: "justify-content:space-between" }, h("b", null, String(a)), h("span.muted", null, k), h("b", null, String(b))),
            h("div.row", { style: "gap:4px" }, h("div.grow", { style: "direction:rtl" }, bar(a / Math.max(1, a + b))), h("div.grow", null, bar(b / Math.max(1, a + b), "#a3ada7")))))))),
        h("div.col", { style: "width:min(300px,32vw)" },
          card("Gols", h("div.col", { style: "gap:4px" }, r.scorers.length ? r.scorers.map((s) => h("div.row", null, h("b.num.neon", null, `${s.min}'`), portrait(lookForPlayer({ id: s.min * 7 }), 24, "head"), h("span", null, s.name), h("span.small.muted", null, s.home ? r.home.short : r.away.short))) : [h("div.muted", null, "Sem gols")])),
          button("Coletiva de imprensa  ›", () => nav.replace("press"), ""),
          button("Continuar  ›", () => { if (api.seasonOver()) nav.reset("season_end"); else nav.reset("hub"); }, "primary"))));
  });
}
