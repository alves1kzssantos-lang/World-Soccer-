import type { Game } from "./game";
import { POS_ORDER } from "./game";
import type { Player, StoreState } from "./state";
import type { StoreDef, StorePack, StoreTier, Pos } from "../data/types";
import { norm } from "../data/db";
import { snapped, clamp } from "../data/rng";

export interface StoreCard {
  tier: string; tierName: string; name: string; pos: string; ovr: number; age: number; nat: string;
  outcome: "contratado" | "repetido" | "teto_salarial"; pid?: number; refund: number; real: boolean;
}
export interface StoreResult { ok: boolean; text: string; cards: StoreCard[]; price: number }

interface PoolEntry { name: string; pos: Pos; age: number; ovr: number; nat: string; key: string }

/**
 * Loja de contratações (NOVO): packs pagos com o CAIXA DO CLUBE. Cada pack sorteia o nível de cada carta
 * pelas chances mostradas (odds), e o jogador sai dos elencos reais (ou é gerado quando não há real naquele nível).
 * Quem entra assina contrato (salário de mercado) e respeita o teto da folha e o limite de 30 no elenco.
 * Jogador repetido (já é seu) vira reembolso. Um pack em destaque roda toda semana com desconto.
 */
export class Store {
  private pool: PoolEntry[] | null = null;
  constructor(private g: Game) {}
  def(): StoreDef { return this.g.data.store; }
  ensure(): StoreState {
    const S = this.g.S;
    if (!S.store) S.store = { opened: 0, spent: 0, history: [] };
    return S.store;
  }
  packs(): StorePack[] { return this.def().packs; }
  pack(id: string): StorePack | undefined { return this.packs().find((p) => p.id === id); }
  tier(id: string): StoreTier { return this.def().tiers.find((t) => t.id === id)!; }

  /** Escala de preço pelo tamanho econômico do clube (receita anual). */
  priceScale(): number {
    const d = this.def();
    return clamp(this.g.finance.annualRevenue() / d.receita_referencia, d.escala_min, d.escala_max);
  }
  week(): number { return Math.max(0, Math.floor((this.g.S.day - this.g.dayOf(this.g.S.year, 1, 7)) / 7)); }
  /** Pack em destaque desta semana (com desconto). */
  featured(): string { const ps = this.packs(); return ps[(this.week() + this.g.S.season) % ps.length].id; }
  price(id: string): number {
    const p = this.pack(id);
    if (!p) return 0;
    const disc = id === this.featured() ? 1 - this.def().destaque_desconto : 1;
    return snapped(p.preco_base * this.priceScale() * disc, 0.01);
  }
  /** Chances de cada nível do pack (para mostrar ao jogador antes da compra). */
  odds(id: string): { tier: string; nome: string; ovr: [number, number]; p: number; pct: string }[] {
    const p = this.pack(id);
    if (!p) return [];
    return p.odds.map((o) => { const t = this.tier(o.tier); return { tier: t.id, nome: t.nome, ovr: t.ovr, p: o.p, pct: `${(o.p * 100).toFixed(o.p < 0.1 ? 1 : 0)}%` }; });
  }

  /** "" se pode comprar; senão o motivo. */
  canBuy(id: string): string {
    const g = this.g;
    const p = this.pack(id);
    if (!p) return "Pack não encontrado.";
    if (g.pro.isPro()) return "A loja de contratações é da carreira de técnico.";
    const price = this.price(id);
    if (price > g.S.money + 0.001) return `Caixa insuficiente: o pack custa ${g.money(price)}.`;
    if (g.squad(g.S.club).length + p.cartas > 30) return `Elenco cheio: abra espaço para ${p.cartas} jogador(es) (máximo 30).`;
    const board = g.finance.canSpend(price);
    if (board) return board;
    return "";
  }

  private realPool(): PoolEntry[] {
    if (this.pool) return this.pool;
    const out: PoolEntry[] = [];
    const seen = new Set<string>();
    for (const key of Object.keys(this.g.data.rosters)) {
      for (const r of this.g.data.rosters[key]) {
        if (!Array.isArray(r) || r.length < 4) continue;
        const pos = String(r[1]) as Pos;
        if (!POS_ORDER.includes(pos)) continue;
        const k = `${norm(String(r[0]))}|${Number(r[2])}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ name: String(r[0]), pos, age: Number(r[2]), ovr: Number(r[3]), nat: String(r[4] ?? "") || "BRA", key: k });
      }
    }
    this.pool = out;
    return out;
  }

  private rollTier(p: StorePack): string {
    let x = this.g.rng.randf();
    for (const o of p.odds) { x -= o.p; if (x <= 0) return o.tier; }
    return p.odds[p.odds.length - 1].tier;
  }

  private findExisting(key: string): Player | undefined {
    return Object.values(this.g.S.players).find((q) => q.real && `${norm(q.name)}|${q.real_age ?? q.age}` === key);
  }

  /** Compra e abre o pack. */
  buy(id: string): StoreResult {
    const g = this.g;
    const reason = this.canBuy(id);
    if (reason) return { ok: false, text: reason, cards: [], price: 0 };
    const p = this.pack(id)!;
    const d = this.def();
    const price = this.price(id);
    const st = this.ensure();
    const me = g.S.club;
    g.finance.book("loja", `Loja: ${p.nome}`, -price);
    g.finance.onPurchase(price, 0);
    const cards: StoreCard[] = [];
    const yearsPassed = g.S.season - 1;
    for (let k = 0; k < p.cartas; k++) {
      const tid = this.rollTier(p);
      const t = this.tier(tid);
      const cands = this.realPool().filter((e) => e.ovr >= t.ovr[0] && e.ovr <= t.ovr[1] && (!p.idade_max || e.age + yearsPassed <= p.idade_max));
      let player: Player | null = null;
      let from = -1;
      let outcome: StoreCard["outcome"] = "contratado";
      let real = false;
      let created = false;
      const refundEach = snapped(price / p.cartas * d.reembolso_duplicado, 0.01);
      if (cands.length) {
        const e = g.rng.pick(cands);
        real = true;
        const ex = this.findExisting(e.key);
        if (ex && ex.club === me) {
          cards.push({ tier: tid, tierName: t.nome, name: ex.name, pos: ex.pos, ovr: ex.ovr, age: ex.age, nat: ex.nat, outcome: "repetido", pid: ex.id, refund: refundEach, real });
          g.finance.book("loja", `Reembolso (repetido): ${ex.name}`, refundEach);
          continue;
        }
        if (ex) { player = ex; from = ex.club; }
        else {
          player = g.makePlayer(e.pos, e.ovr, me, e.age + yearsPassed);
          player.name = e.name; player.nat = e.nat; player.real = true; player.real_age = e.age; player.pot = Math.max(player.pot, player.ovr);
          from = -1;
          created = true;
        }
      } else {
        const pos = POS_ORDER[g.rng.randiRange(1, 8)];
        const age = p.idade_max ? g.rng.randiRange(17, p.idade_max) : g.rng.randiRange(21, 31);
        player = g.makePlayer(pos, g.rng.randiRange(t.ovr[0], t.ovr[1]), me, age);
        from = -1;
        created = true;
      }
      if (p.pot_min) player.pot = Math.max(player.pot, clamp(p.pot_min + g.rng.randiRange(0, 8), player.ovr, 95));
      const wage = g.marketWage(player);
      const bill = g.loans.wageBill(me) - (player.club === me ? player.wage : 0);
      if (bill + wage > g.S.econ.wage_budget * d.tolerancia_teto_folha) {
        outcome = "teto_salarial";
        if (created) delete g.S.players[player.id];
        cards.push({ tier: tid, tierName: t.nome, name: player.name, pos: player.pos, ovr: player.ovr, age: player.age, nat: player.nat, outcome, refund: refundEach, real });
        g.finance.book("loja", `Reembolso (teto salarial): ${player.name}`, refundEach);
        continue;
      }
      if (from >= 0) {
        for (const c of g.S.clubs) { c.xi = c.xi.filter((x) => x !== player!.id); if (c.bench) c.bench = c.bench.filter((x) => x !== player!.id); }
        if (player.loan) delete player.loan;
        if (g.squad(from).length < 22) g.makePlayer(player.pos, g.S.clubs[from].str - g.rng.randiRange(2, 6), from, g.rng.randiRange(18, 23));
        g.autoLineup(from);
      }
      player.club = me; player.wage = wage; player.contract = d.anos_contrato + 1; player.joined = g.S.season;
      player.listed = false; player.cmin = 0; player.cgol = 0; player.cass = 0; player.titles = []; player.store_tier = tid;
      delete player.renew;
      g.logTransfer(player, from, me, 0);
      cards.push({ tier: tid, tierName: t.nome, name: player.name, pos: player.pos, ovr: player.ovr, age: player.age, nat: player.nat, outcome, pid: player.id, refund: 0, real });
    }
    g.validateXi(me);
    st.opened++;
    st.spent = snapped(st.spent + price, 0.01);
    st.history.unshift({ day: g.S.day, pack: p.nome, got: cards.map((c) => `${c.name} (${c.ovr})`), price });
    if (st.history.length > 30) st.history.length = 30;
    const signed = cards.filter((c) => c.outcome === "contratado");
    g.addNews(`Loja: ${p.nome}`, signed.length
      ? `Chegaram: ${signed.map((c) => `${c.name} (${c.pos}, ${c.ovr})`).join(", ")}.`
      : "Nenhum jogador novo neste pack; o valor das cartas foi reembolsado em parte.");
    g.save();
    return { ok: true, text: signed.length ? `${signed.length} jogador(es) contratado(s)!` : "Só cartas repetidas/teto: reembolso aplicado.", cards, price };
  }
}
