import type { Game } from "./game";
import type { Player } from "./state";
import { snapped, clamp } from "../data/rng";

/** Empréstimos (porte de loans.gd). Emprestado fica com p.club = quem recebeu e o vínculo em p.loan. */
export class Loans {
  constructor(private g: Game) {}
  e(key: string, fallback: number): number { return Number(this.g.contracts.cfg("emprestimo", key, fallback)); }
  isLoaned(p: Player): boolean { return !!p.loan; }
  offers() { this.g.S.loan_offers ??= []; return this.g.S.loan_offers; }
  loanedOut(cid: number): Player[] { return Object.values(this.g.S.players).filter((p) => p.loan && p.loan.from === cid); }
  loanedIn(cid: number): Player[] { return this.g.squad(cid).filter((p) => !!p.loan); }
  private halfRound(): number { return Math.floor(this.g.S.fixtures.length / 2); }
  private snap(p: Player) { return { g: p.g, min: p.min, gol: p.gol, ass: p.ass }; }
  stats(p: Player) {
    if (!p.loan) return { g: 0, min: 0, gol: 0, ass: 0 };
    const st = p.loan.start ?? { g: 0, min: 0, gol: 0, ass: 0 };
    return { g: p.g - st.g, min: p.min - st.min, gol: p.gol - st.gol, ass: p.ass - st.ass };
  }
  endsText(p: Player): string { return !p.loan ? "" : p.loan.end_round >= 0 ? "até a metade da temporada" : "até o fim da temporada"; }

  private removeFromLineups(pid: number): void {
    for (const c of this.g.S.clubs) {
      c.xi = c.xi.filter((x) => x !== pid);
      if (c.bench) c.bench = c.bench.filter((x) => x !== pid);
    }
  }

  start(p: Player, to: number, half: boolean, pct: number, buy: number, fee: number): void {
    const g = this.g;
    const from = p.club;
    this.removeFromLineups(p.id);
    let endRound = -1;
    if (half && g.S.round < this.halfRound()) endRound = this.halfRound();
    p.loan = { from, to, season: g.S.season, end_round: endRound, pct: clamp(pct, 0, 100), buy: snapped(buy, 0.01), fee: snapped(fee, 0.01), start: this.snap(p) };
    p.club = to;
    p.listed = false;
    g.logTransfer(p, from, to, fee, true);
    if (from !== g.S.club && from >= 0) g.autoLineup(from);
    if (to !== g.S.club) g.autoLineup(to);
    else g.validateXi(to);
  }

  end(p: Player, why = ""): void {
    if (!p.loan) return;
    const g = this.g;
    const { from, to, season } = p.loan;
    const st = this.stats(p);
    p.loan_hist ??= [];
    p.loan_hist.push({ club: to, season, ...st });
    delete p.loan;
    p.club = from;
    this.removeFromLineups(p.id);
    const me = g.S.club;
    if (to >= 0 && to !== me) g.autoLineup(to);
    if (from >= 0 && from !== me) g.autoLineup(from);
    if (from === me || to === me) {
      g.validateXi(me);
      g.addNews("Fim de empréstimo", `${p.name} voltou ao ${g.clubName(from)}${why ? " — " + why : ""} (${st.g} jogos, ${st.gol} gols pelo ${g.clubName(to)}).`);
    }
  }

  termsIn(p: Player) {
    const owner = p.club;
    const st = owner >= 0 ? this.g.club(owner).str : 70;
    const pct = clamp(Math.round((50 + (p.ovr - (st - 10)) * 3) / 10) * 10, this.e("aceita_ceder_minimo_pct", 50), 100);
    return { pct, fee: snapped(p.value * this.e("taxa_emprestimo_fracao_valor", 0.04), 0.01), buy: snapped(p.value * this.e("opcao_compra_fracao_valor", 1.1), 0.01) };
  }

  availableIn(): Player[] {
    const me = this.g.S.club;
    const out: Player[] = [];
    for (let cid = 0; cid < this.g.nLeague(); cid++) {
      if (cid === me) continue;
      const sq = this.g.squad(cid);
      if (sq.length <= this.e("elenco_minimo_cedente", 20)) continue;
      const xi = this.g.S.clubs[cid].xi;
      for (const p of sq) if (!p.loan && !p.me && !xi.includes(p.id)) out.push(p);
    }
    return out.sort((a, b) => (a.ovr !== b.ovr ? b.ovr - a.ovr : a.id - b.id));
  }

  loanIn(pid: number, half: boolean, pct: number, withBuy: boolean): string {
    const g = this.g;
    if (g.pro.isPro()) return "No modo jogador quem contrata é o clube.";
    const p = g.player(pid);
    const me = g.S.club;
    const owner = p.club;
    if (owner < 0 || owner === me || p.loan || p.me) return "Esse jogador não está disponível para empréstimo.";
    if (owner >= g.nLeague()) return "Só é possível pedir emprestado a clubes do seu campeonato.";
    if (g.squad(me).length >= 30) return "Elenco cheio (máximo 30).";
    if (g.squad(owner).length <= this.e("elenco_minimo_cedente", 20)) return `O ${g.clubName(owner)} não tem elenco para ceder ninguém agora.`;
    if (g.S.clubs[owner].xi.includes(p.id)) return `${p.name} é titular do ${g.clubName(owner)} e não será emprestado.`;
    const t = this.termsIn(p);
    if (pct < t.pct) return `O ${g.clubName(owner)} quer que você pague pelo menos ${t.pct}% do salário.`;
    if (t.fee > g.S.money + 0.001) return `Caixa insuficiente para a taxa de empréstimo (${g.money(t.fee)}).`;
    g.finance.book("compras", `Taxa de empréstimo: ${p.name}`, -t.fee);
    g.finance.aiTransferCash(owner, -1, t.fee);
    this.start(p, me, half, pct, withBuy ? t.buy : 0, t.fee);
    g.addNews("Empréstimo confirmado", `${p.name} chega emprestado pelo ${g.clubName(owner)} ${this.endsText(p)}. Você paga ${pct}% do salário${withBuy ? ", com opção de compra de " + g.money(t.buy) : ""}.`);
    g.save();
    return "";
  }

  private takers(p: Player): number[] {
    const out: number[] = [];
    for (let cid = 0; cid < this.g.nLeague(); cid++) {
      if (cid === p.club) continue;
      const st = this.g.S.clubs[cid].str;
      if (p.ovr >= st - 12 && p.ovr <= st + 4 && this.g.squad(cid).length < 28) out.push(cid);
    }
    return out;
  }

  private aiPct(): number { return Math.round(this.g.rng.randfRange(this.e("fracao_salario_ia_paga_min", 50), this.e("fracao_salario_ia_paga_max", 100)) / 10) * 10; }

  offerOut(pid: number, half: boolean): { ok: boolean; text: string } {
    const g = this.g;
    const p = g.player(pid);
    const me = g.S.club;
    if (p.club !== me || p.loan || p.me) return { ok: false, text: "Esse jogador não é seu para emprestar." };
    const min = g.contracts.c("elenco_minimo", 16);
    if (g.squad(me).length <= min) return { ok: false, text: `Elenco muito curto para emprestar alguém (mínimo ${min}).` };
    const tk = this.takers(p);
    if (!tk.length || g.rng.randf() > this.e("oferecer_chance_base", 0.7)) return { ok: false, text: `Nenhum clube se interessou por ${p.name} agora. Tente mais tarde.` };
    const to = g.rng.pick(tk);
    const pct = this.aiPct();
    const buy = g.rng.randf() < 0.5 ? snapped(p.value * this.e("opcao_compra_fracao_valor", 1.1), 0.01) : 0;
    this.start(p, to, half, pct, buy, 0);
    g.addNews("Jogador emprestado", `${p.name} foi emprestado ao ${g.clubName(to)} ${this.endsText(p)}. O ${g.clubName(to)} paga ${pct}% do salário${buy > 0 ? " e tem opção de compra de " + g.money(buy) : ""}.`);
    g.save();
    return { ok: true, text: `${p.name} emprestado ao ${g.clubName(to)}.` };
  }

  acceptRequest(idx: number): string {
    const g = this.g;
    const lo = this.offers();
    if (idx < 0 || idx >= lo.length) return "Pedido não encontrado.";
    const o = lo.splice(idx, 1)[0];
    const p = g.S.players[o.pid];
    if (!p) return "Esse jogador não está mais no clube.";
    const me = g.S.club;
    if (p.club !== me || p.loan) return "Esse jogador não está mais disponível.";
    const min = g.contracts.c("elenco_minimo", 16);
    if (g.squad(me).length <= min) return `Elenco muito curto para emprestar alguém (mínimo ${min}).`;
    this.start(p, o.club, !!o.half, o.pct, o.buy ?? 0, 0);
    g.addNews("Jogador emprestado", `${p.name} foi emprestado ao ${g.clubName(o.club)} ${this.endsText(p)}.`);
    g.save();
    return "";
  }
  rejectRequest(idx: number): void { const lo = this.offers(); if (idx >= 0 && idx < lo.length) lo.splice(idx, 1); }

  canRecall(p: Player): boolean {
    if (!p.loan || p.loan.from !== this.g.S.club) return false;
    if (p.loan.season < this.g.S.season) return true;
    return this.g.S.round >= this.halfRound() && p.loan.end_round < 0;
  }
  recall(pid: number): string {
    const p = this.g.player(pid);
    if (!this.canRecall(p)) return "Só dá para chamar de volta depois da metade da temporada (empréstimos de temporada inteira).";
    if (this.g.squad(this.g.S.club).length >= 30) return "Elenco cheio (máximo 30).";
    this.end(p, "chamado de volta");
    this.g.save();
    return "";
  }

  buyOption(pid: number): string {
    const g = this.g;
    const p = g.player(pid);
    if (!p.loan || p.loan.to !== g.S.club || p.loan.buy <= 0) return "Esse empréstimo não tem opção de compra.";
    const fee = p.loan.buy;
    if (fee > g.S.money + 0.001) return `Caixa insuficiente para exercer a opção (${g.money(fee)}).`;
    const from = p.loan.from;
    g.finance.book("compras", `Opção de compra: ${p.name}`, -fee);
    g.finance.aiTransferCash(from, -1, fee);
    g.finance.onPurchase(fee, 0);
    delete p.loan;
    p.contract = Math.max(p.contract, 3); p.joined = g.S.season; p.cmin = 0; p.cgol = 0; p.cass = 0; p.titles = [];
    g.logTransfer(p, from, g.S.club, fee);
    if (from >= 0 && g.squad(from).length < 22) {
      g.makePlayer(p.pos, g.S.clubs[from].str - g.rng.randiRange(2, 6), from, g.rng.randiRange(18, 23));
      g.autoLineup(from);
    }
    g.addNews("Opção de compra exercida", `${p.name} agora é do seu clube em definitivo (${g.money(fee)}).`);
    g.save();
    return "";
  }

  /** Folha semanal (mil) do clube, contando a divisão dos empréstimos. */
  wageBill(cid: number): number {
    let w = 0;
    for (const p of this.g.squad(cid)) w += p.loan ? p.wage * p.loan.pct / 100 : p.wage;
    for (const p of this.loanedOut(cid)) w += p.wage * (1 - p.loan!.pct / 100);
    return w;
  }

  roundTick(): void {
    const g = this.g;
    const me = g.S.club;
    for (const p of Object.values(g.S.players)) {
      if (p.loan && p.loan.end_round >= 0 && g.S.round >= p.loan.end_round) this.end(p, "fim do empréstimo de meia temporada");
    }
    if (!g.pro.isPro() && g.rng.randf() < this.e("pedido_chance_por_rodada", 0.06)) {
      const xi = g.myClub().xi;
      const cand = g.squad(me).filter((p) => !p.loan && !xi.includes(p.id) &&
        (p.age <= this.e("idade_maxima_pedido", 23) || p.min <= this.e("minutos_maximos_pedido", 450)));
      if (cand.length) {
        const p = g.rng.pick(cand);
        const tk = this.takers(p);
        const dup = this.offers().some((o) => o.pid === p.id);
        if (tk.length && !dup) {
          const to = g.rng.pick(tk);
          const pct = this.aiPct();
          const half = g.rng.randf() < 0.35 && g.S.round < this.halfRound();
          const buy = g.rng.randf() < 0.4 ? snapped(p.value * this.e("opcao_compra_fracao_valor", 1.1), 0.01) : 0;
          this.offers().push({ pid: p.id, club: to, pct, half, buy });
          if (this.offers().length > 6) this.offers().shift();
          g.addNews("Pedido de empréstimo", `${g.clubName(to)} quer ${p.name} emprestado ${half ? "por meia temporada" : "até o fim da temporada"}, pagando ${pct}% do salário. Veja Propostas.`);
        }
      }
    }
    if (g.rng.randf() < this.e("ia_entre_si_chance_por_rodada", 0.15)) {
      const n = g.nLeague();
      const a = g.rng.randiRange(0, n - 1), b = g.rng.randiRange(0, n - 1);
      if (a !== b && a !== me && b !== me && g.S.clubs[a].str > g.S.clubs[b].str &&
          g.squad(a).length > this.e("elenco_minimo_cedente", 20) && g.squad(b).length < 28) {
        const xiA = g.S.clubs[a].xi;
        const young = g.squad(a).filter((q) => q.age <= 22 && !q.loan && !q.me && !xiA.includes(q.id));
        if (young.length) this.start(g.rng.pick(young), b, false, 100, 0, 0);
      }
    }
  }

  seasonEnd(): void {
    const g = this.g;
    const me = g.S.club;
    for (const p of Object.values(g.S.players)) {
      if (!p.loan) continue;
      const { to, from, buy } = p.loan;
      if (to !== me && buy > 0 && this.stats(p).min >= 900 && g.rng.randf() < this.e("ia_exerce_opcao_chance", 0.35)) {
        delete p.loan;
        p.contract = Math.max(p.contract, 3);
        p.joined = g.S.season;
        g.logTransfer(p, from, to, buy);
        if (from === me) {
          g.finance.book("vendas", `Opção de compra exercida: ${p.name}`, buy);
          g.finance.onSale(buy);
          g.finance.aiTransferCash(-1, to, buy);
          g.addNews("Opção de compra exercida", `O ${g.clubName(to)} comprou ${p.name} em definitivo por ${g.money(buy)}.`);
        }
        continue;
      }
      this.end(p);
    }
    this.offers().length = 0;
  }
}
