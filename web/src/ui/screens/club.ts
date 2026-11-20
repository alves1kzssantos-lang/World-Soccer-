// Hub, elenco, perfil, escalação/banco/treino, mercado e empréstimos, renovação, loja de packs e finanças.
import { h } from "../dom";
import type { Ctx } from "../ctx";
import { clubCrest, kitOf, playerRow, energyCell } from "../ctx";
import type { PackVM, PlayerVM } from "../career_api";
import { button, card, tapCard, chip, bar, tabs, toast, modal, virtualList, lineChart, barsChart, posChip } from "../widgets";
import { header } from "../nav";
import { compLogo } from "../assets";
import { portrait, lookForPlayer } from "../chibi";

export function registerClub(ctx: Ctx): void {
  const { nav, api } = ctx;
  const M = (v: number) => api.money(v);

  nav.register("hub", () => {
    const hb = api.hub();
    const nx = hb.next;
    const moneyChip = h("div.card", { style: "padding:6px 12px;font:700 1.15em Display" }, M(hb.money));
    return h("div", null,
      header(nav, hb.club.name, `${hb.league} • Temporada ${hb.season} • ${hb.dateLabel}`, moneyChip, clubCrest(hb.club, 40)),
      h("div.ws-body", null,
        h("div.col.grow", { style: "flex:1.25" },
          card("Próxima partida", nx ? h("div.col", null,
            h("div.row", null, compLogo(nx.compId, 26), h("div.small.neon", { style: "font-weight:700" }, `${nx.comp} • ${nx.stage} • ${nx.date}`)),
            h("div.row", { style: "justify-content:space-between" }, h("div.row", null, clubCrest(nx.home, 46), h("b", null, nx.home.name)),
              h("div.big.muted", null, "×"), h("div.row", null, h("b", null, nx.away.name), clubCrest(nx.away, 46))),
            h("div.row", null, button("JOGAR", () => nav.go("prematch"), "primary", { style: "flex:2" }), button("Simular", () => nav.go("postmatch", api.simulateMatch()), "", { style: "flex:1" })))
            : h("div.muted", null, "Fim da temporada"), ),
          h("div.row", { style: "align-items:stretch" },
            tapCard("Tabela", () => nav.go("table"), h("div.huge", null, `${hb.tablePos}º`), h("div.small.muted", null, `${hb.pts} pts em ${hb.played} jogos`),
              h("div.row", { style: "gap:4px;margin-top:6px" }, hb.form.map((f) => chip(f, "", f === "V" ? "#1e8a2e" : f === "E" ? "#7a6a1a" : "#a3243b")))),
            tapCard("Mídia e redes", () => nav.go("social"), h("div.row", null, h("div.big.neon", null, `${hb.approval}%`), h("div.small.muted", null, `aprovação • ${hb.followers} seguidores`)),
              h("div.small", { style: "margin-top:6px;opacity:.9" }, hb.lastPost)))),
        h("div.col.grow", null,
          tapCard("Escalação", () => nav.go("lineup"), h("div", { style: "font:700 1.3em Display" }, `${hb.formation} • Energia ${hb.teamEnergy}%`), bar(hb.teamEnergy / 100, undefined, true)),
          h("div.row", { style: "align-items:stretch" },
            tapCard("Loja", () => nav.go("store"), h("div", { style: "font:700 1.3em Display" }, "Packs 80+ • 90+"), h("div.small.muted", null, "Contratações especiais")),
            tapCard("Contratos", () => nav.go("squad"), h("div", { style: "font:700 1.3em Display", class: hb.expiring ? "neg-txt" : "" }, `${hb.expiring} vencendo`), h("div.small.muted", null, `${hb.offers} propostas`))),
          tapCard("Finanças", () => nav.go("finance"), h("div", { style: "font:700 1.3em Display" }, M(hb.money)), h("div.small.muted", null, "Caixa, orçamento e folha")))),
      h("div.hub-nav", null, ([["Elenco", "squad"], ["Mercado", "market"], ["Calendário", "table", 2], ["Copas", "cups"], ["Coletiva", "press"], ["Redes", "social"]] as [string, string, number?][]).map(([t, s, a]) =>
        button(t, () => nav.go(s, a)))));
  });

  nav.register("squad", () => {
    const sq = api.squad(), club = api.hub().club;
    return h("div", null, header(nav, "Elenco", `${sq.length} jogadores • toque para ver o perfil`),
      h("div.row.small.muted", { style: "padding:0 10px 4px;gap:10px" }, h("span", { style: "width:44px" }, "POS"), h("span.grow", null, "JOGADOR"), h("span", { style: "width:40px" }, "PAÍS"),
        h("span", { style: "width:36px" }, "IDADE"), h("span", { style: "width:36px" }, "GER"), h("span", { style: "width:74px" }, "ENERGIA"), h("span", { style: "width:80px;text-align:right" }, "VALOR")),
      virtualList(sq.length, 52, (i) => { const p = sq[i]; return playerRow(p, club, [h("span.small.muted", { style: "width:40px" }, p.nat), h("span.num", { style: "width:36px" }, String(p.age)),
        h("b.num.neon", { style: "width:36px" }, String(p.ovr)), energyCell(p), h("span.num", { style: "width:80px;text-align:right" }, M(p.value))], () => nav.go("player", p.id)); }));
  });

  nav.register("player", (arg) => {
    const p = api.player(arg as number)!, club = api.hub().club;
    const stat = (k: string, v: string | number) => h("div", { style: "text-align:center" }, h("div.big", null, String(v)), h("div.small.muted", null, k));
    return h("div", null, header(nav, p.name, `${p.pos} • ${p.age} anos • ${p.nat}`),
      h("div.ws-body", null,
        card(null, h("div.col", { style: "align-items:center" }, portrait(lookForPlayer(p, kitOf(club)), Math.min(170, innerHeight * 0.28), "full"), posChip(p.pos))),
        h("div.col.grow", null,
          card("Atributos", h("div.row", { style: "justify-content:space-around" }, stat("GERAL", p.ovr), stat("POTENCIAL", p.pot), stat("JOGOS", p.apps ?? 0), stat("GOLS", p.goals ?? 0), stat("ASSIST.", p.assists ?? 0))),
          card("Condição", h("div.row", null, h("div.grow", null, bar(p.energy / 100, undefined, true)), h("b.num", null, `${Math.round(p.energy)}%`), p.injured ? chip("LESIONADO", "", "#a3243b") : null)),
          card("Contrato", h("div.row", null, h("div.grow", null, h("div", null, `${M(p.wage / 1000)}/sem • ${p.contract} ano(s)`), p.expiring ? h("div.small.neg-txt", null, "Vence no fim da temporada") : null),
            button("Renovar", () => nav.go("renewal", p.id), "primary"), button("Emprestar", () => toast(api.loanOut(p.id))))))));
  });

  nav.register("lineup", () => {
    const lu = api.lineup(), sq = api.squad(), club = api.hub().club;
    const xi = [...lu.xi], bench = [...lu.bench];
    let formation = lu.formation, training = lu.training, sel = -1;
    const body = h("div.ws-body");
    const byId = (id: number) => sq.find((p) => p.id === id)!;
    const paint = () => {
      const rowOf = (id: number, where: "xi" | "bench" | "out", idx: number) => {
        const p = byId(id);
        const el = playerRow(p, club, [h("b.num.neon", { style: "width:30px" }, String(p.ovr)), energyCell(p)], () => {
          const key = (where === "xi" ? 0 : where === "bench" ? 100 : 200) + idx;
          if (sel < 0) { sel = key; paint(); return; }
          const list = (k: number) => (k < 100 ? xi : k < 200 ? bench : null);
          const a = list(sel), b = list(key), ia = sel % 100, ib = key % 100;
          const ida = a ? a[ia] : outs[ia], idb = b ? b[ib] : outs[ib];
          if (a) a[ia] = idb; if (b) b[ib] = ida;
          sel = -1; paint();
        });
        if (sel === (where === "xi" ? 0 : where === "bench" ? 100 : 200) + idx) el.style.outline = "2px solid var(--accent)";
        return el;
      };
      const outs = sq.map((p) => p.id).filter((id) => !xi.includes(id) && !bench.includes(id));
      const tired = xi.filter((id) => byId(id).energy < 60).length;
      body.replaceChildren(
        h("div.col.grow", null, h("div.ct.small.muted", null, "TITULARES"), h("div.scroll.grow", null, xi.map((id, i) => rowOf(id, "xi", i)))),
        h("div.col.grow", null, h("div.ct.small.muted", null, `BANCO (${bench.length})`), h("div.scroll.grow", null, bench.map((id, i) => rowOf(id, "bench", i)), outs.length ? h("div.small.muted", { style: "margin:6px" }, "FORA DA LISTA") : null, outs.map((id, i) => rowOf(id, "out", i)))),
        h("div.col", { style: "width:min(250px,28vw)" },
          card("Formação", h("div.row", { style: "flex-wrap:wrap;gap:6px" }, lu.formations.map((f) => button(f, () => { formation = f; paint(); }, "", { class: f === formation ? "on" : "", style: f === formation ? "background:var(--accent);color:var(--on-accent)" : "" })))),
          card("Treino da semana", tabs(["Leve", "Normal", "Forte"], ["leve", "normal", "forte"].indexOf(training), (i) => { training = (["leve", "normal", "forte"] as const)[i]; paint(); }),
            h("div.small.muted", { style: "margin-top:6px" }, training === "forte" ? "Mais evolução, menos recuperação." : training === "leve" ? "Recupera mais energia." : "Equilíbrio entre os dois.")),
          tired ? h("div.small.neg-txt", null, `⚠ ${tired} titular(es) cansado(s)`) : null,
          button("Autoescalar", () => { api.autoLineup(); const n = api.lineup(); xi.splice(0, 11, ...n.xi); bench.splice(0, bench.length, ...n.bench); paint(); }),
          button("Salvar", () => { api.setLineup(xi, bench, formation, training); toast("Escalação salva"); nav.back(); }, "primary")));
    };
    paint();
    return h("div", null, header(nav, "Escalação", "Toque em um jogador e depois em outro para trocar"), body);
  });

  nav.register("market", () => {
    let tab = 0;
    const host = h("div.grow.col");
    const paint = () => {
      const list = api.market({ loans: tab === 1 });
      host.replaceChildren(tabs(["Contratar", "Empréstimos"], tab, (i) => { tab = i; paint(); }),
        virtualList(list.length, 52, (i) => { const p = list[i]; return playerRow(p, null, [h("b.num.neon", { style: "width:30px" }, String(p.ovr)), h("span.small.muted", { style: "width:34px" }, String(p.age)),
          h("span.num", { style: "width:84px;text-align:right" }, M(p.value)), button(tab ? "Pedir" : "Contratar", () => toast(tab ? api.loanIn(p.id) : api.buy(p.id)), "primary", { style: "min-height:36px" })]); }));
    };
    paint();
    return h("div", null, header(nav, "Mercado", "Contratações e empréstimos"), host);
  });

  nav.register("renewal", (arg) => {
    const r = api.renewal(arg as number);
    let wage = r.askWage, years = r.askYears, role = r.askRole;
    const out = h("div.small.muted");
    const val = h("div.big.num");
    const yv = h("div.big.num");
    const paint = () => { val.textContent = `${M(wage / 1000)}/sem`; yv.textContent = `${years} ano(s)`; };
    paint();
    return h("div", null, header(nav, "Renovação de contrato", `${r.player.name} • contrato no fim`),
      h("div.ws-body", null,
        card("O que ele pede", h("div.col", null, portrait(lookForPlayer(r.player), 90, "bust"), h("div.neon", { style: "font:700 1.2em Display" }, `${M(r.askWage / 1000)}/sem`),
          h("div", null, `${r.askYears} anos • Papel: ${r.askRole}`), h("div.small.muted", null, `Tentativas: ${r.tries} de 3`))),
        h("div.col.grow", null,
          card("Salário por semana", h("div.row", null, button("−", () => { wage = Math.max(1, Math.round(wage * 0.95 * 10) / 10); paint(); }), h("div.grow", { style: "text-align:center" }, val), button("+", () => { wage = Math.round(wage * 1.05 * 10) / 10; paint(); }))),
          card("Duração", h("div.row", null, button("−", () => { years = Math.max(1, years - 1); paint(); }), h("div.grow", { style: "text-align:center" }, yv), button("+", () => { years = Math.min(5, years + 1); paint(); }))),
          card("Papel prometido", tabs(["Titular", "Rodízio", "Reserva"], ["Titular", "Rodízio", "Reserva"].indexOf(role), (i) => { role = ["Titular", "Rodízio", "Reserva"][i]; nav.refresh(); })),
          out,
          h("div.row", null, button("Igualar pedido", () => { wage = r.askWage; years = r.askYears; paint(); }), button("Enviar proposta", () => {
            const res = api.proposeRenewal(r.player.id, wage, years, role); out.textContent = res.text; out.className = res.result === "aceita" ? "pos-txt" : "neg-txt";
            if (res.result === "aceita") setTimeout(() => nav.back(), 900);
          }, "primary", { style: "flex:1" })))));
  });

  nav.register("store", () => {
    const fin = api.finance();
    const cash = h("div.card", { style: "padding:6px 12px;font:700 1.15em Display" }, M(fin.cash));
    const packEl = (p: PackVM) => h("div.card.pack", null,
      h(`div.art.tier-${p.tier}`, null, h("span", { style: "position:relative" }, p.tier === "jovem" ? "★" : p.name.match(/\d+\+/)?.[0] ?? `×${p.count}`)),
      h("div", { style: "font:700 1.1em Display" }, p.name), h("div.small.muted", null, p.desc),
      h("div.small", null, p.odds.map(([k, v]) => `${k}: ${Math.round(Number(v) * 10) / 10}%`).join(" • ")),
      button(M(p.price), () => openPack(p), "primary", { style: "width:100%" }));
    const openPack = (p: PackVM) => {
      if (fin.cash < p.price) { toast("Caixa insuficiente para este pack."); return; }
      modal((close) => card(null, h("div.col", null, h("div", { style: "font:700 1.3em Display" }, `Abrir ${p.name}?`),
        h("div.muted", null, `Custa ${M(p.price)} do caixa do clube. O jogador entra no elenco com contrato e salário (respeitando o teto da diretoria).`),
        h("div.row", null, button("Cancelar", close), button("ABRIR", () => { close(); reveal(p); }, "primary", { style: "flex:1" })))));
    };
    const reveal = (p: PackVM) => {
      const res = api.openPack(p.id);
      if (!res.ok) { toast(res.msg); return; }
      const club = api.hub().club;
      const cards = res.players.map((pl: PlayerVM) => {
        const c = h("div.pcard", null, h("div.in", null, h("div.b", null, h("div.neon", { style: "font:700 2.2em Display" }, "?")),
          h(`div.f.tier-${p.tier}`, null, h("div", { style: "font:700 2.4em Display;line-height:1" }, String(pl.ovr)), posChip(pl.pos),
            portrait(lookForPlayer(pl, kitOf(club)), 80, "bust"), h("div", { style: "font-weight:700;text-align:center" }, pl.name), h("div.small", null, `${pl.age} anos • ${pl.nat}`))));
        return c;
      });
      const ov = h("div.reveal", null, h("div", { style: "font:700 1.6em Display;letter-spacing:.06em" }, p.name.toUpperCase()), h("div.row", { style: "gap:18px" }, cards),
        button("Continuar", () => { ov.remove(); nav.refresh(); }, "primary"));
      (document.querySelector(".ws-root") ?? document.body).appendChild(ov);
      cards.forEach((c, i) => setTimeout(() => c.classList.add("flip"), 600 + i * 450));
      if (res.refund) toast(`Repetido convertido em ${M(res.refund)}`);
    };
    return h("div", null, header(nav, "Loja de contratações", "Packs pagos com o dinheiro do clube", cash),
      h("div.ws-body", { style: "align-items:stretch" }, api.packs().map(packEl)));
  });

  nav.register("finance", () => {
    const f = api.finance();
    const pct = (a: number, b: number) => (b ? a / b : 0);
    return h("div", null, header(nav, "Finanças", `Confiança da diretoria: ${f.confidence}%`),
      h("div.col.grow", null,
        h("div.row", { style: "align-items:stretch" },
          card("Caixa", h("div.big", null, M(f.cash)), h("div.small", { class: f.seasonResult >= 0 ? "pos-txt" : "neg-txt" }, `Temporada: ${f.seasonResult >= 0 ? "+" : ""}${M(f.seasonResult)}`)),
          card("Orçamento de contratações", h("div.big.neon", null, M(f.budget)), bar(pct(f.spent, f.budget)), h("div.small.muted", null, `gasto ${M(f.spent)}`)),
          card("Folha salarial", h("div.big", null, `${M(f.wageBill)}/sem`), bar(pct(f.wageBill, f.wageCap), pct(f.wageBill, f.wageCap) > 0.95 ? "#e5535f" : undefined), h("div.small.muted", null, `teto ${M(f.wageCap)}/sem`)),
          card("Diretoria", h("div.big.neon", null, `${f.confidence}%`), bar(f.confidence / 100))),
        h("div.row.grow", { style: "align-items:stretch" },
          h("div.card.grow.col", null, h("div.ct", null, "Receitas × despesas"), h("div.grow", null, barsChart([...f.income, ...f.expense]))),
          h("div.card.grow.col", null, h("div.ct", null, "Evolução do caixa"), h("div.grow", null, lineChart(f.history))),
          h("div.card.col", { style: "width:min(300px,30vw)" }, h("div.ct", null, "Últimas movimentações"), h("div.scroll.grow", null, f.tx.map((t) =>
            h("div.row.small", { style: "justify-content:space-between;padding:3px 0" }, h("span.muted", null, t.day), h("span.grow", { style: "padding:0 6px" }, t.label), h("b", { class: t.value >= 0 ? "pos-txt" : "neg-txt" }, (t.value >= 0 ? "+" : "") + M(t.value)))))))));
  });
}
