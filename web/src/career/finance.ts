import type { Game } from "./game";
import type { Club, Econ } from "./state";
import * as Money from "./money";
import { snapped, clamp } from "../data/rng";

export const KINDS = ["tv", "patrocinio", "bilheteria", "premios", "vendas", "salarios", "staff", "compras", "loja", "juros", "rescisoes"];
export const INCOME = ["tv", "patrocinio", "bilheteria", "premios", "vendas"];
export const LABELS: Record<string, string> = { tv: "Direitos de TV", patrocinio: "Patrocínio", bilheteria: "Bilheteria", premios: "Premiações",
  vendas: "Vendas de jogadores", salarios: "Salários", staff: "Comissão técnica", compras: "Contratações", loja: "Loja de contratações",
  juros: "Juros da dívida", rescisoes: "Rescisões" };

/**
 * Economia do clube (porte de finance.gd). Caixa/receitas em MILHÕES; salários em MIL por semana.
 * Folha esperada W(f) = a*(f-50)^b; receita ≈ receita_sobre_folha * W(f) (TV, patrocínio, bilheteria).
 */
export class Finance {
  constructor(private g: Game) {}
  cfg(key: string, fallback: number): number { const v = this.g.data.economy[key]; return typeof v === "number" ? v : fallback; }

  wexpK(f: number): number { return this.cfg("folha_a", 0.113) * Math.pow(Math.max(f - 50, 4), this.cfg("folha_b", 2.65)); }
  baseRevenue(f: number): number { return this.wexpK(f) / 1000 * this.cfg("receita_sobre_folha", 1.18); }
  leagueTvMult(): number { return clamp(0.88 + 0.08 * (this.g.league().prize ?? 1), 0.85, 1.12); }
  tvWeek(f: number): number { return this.baseRevenue(f) * this.cfg("parte_tv", 0.38) * this.leagueTvMult(); }
  sponsorWeek(f: number): number {
    const rep = 1 + 0.03 * Math.min(this.g.myClub().titles ?? 0, 5);
    return this.baseRevenue(f) * this.cfg("parte_patrocinio", 0.30) * rep;
  }
  capacity(f: number): number { return Math.floor(clamp(this.cfg("estadio_base", 12000) + (f - 55) * this.cfg("estadio_por_ponto", 1600), 8000, 82000)); }
  occupancy(): number { return clamp(0.32 + 0.62 * (this.g.S.support ?? 60) / 100, 0.2, 1); }
  ticketGame(f: number): number {
    const refOcc = 0.32 + 0.62 * 0.6;
    return this.baseRevenue(f) * this.cfg("parte_bilheteria", 0.32) * 2 * this.occupancy() / refOcc;
  }
  staffWeek(f: number): number { return this.wexpK(f) / 1000 * this.cfg("staff_sobre_folha", 0.10); }
  attendance(f: number): number { return Math.floor(this.capacity(f) * this.occupancy()); }

  defaults(): Econ { return { ledger: [], hist: [], transfer_budget: 0, transfer_spent: 0, wage_budget: 0, board_warn: 0, last_gate: 0 }; }

  ensure(): Econ {
    const S = this.g.S;
    if (!S.econ || typeof S.econ !== "object") S.econ = this.defaults();
    const d = this.defaults() as unknown as Record<string, unknown>;
    const e = S.econ as unknown as Record<string, unknown>;
    for (const k of Object.keys(d)) if (!(k in e)) e[k] = d[k];
    S.fin ??= {};
    for (const k of KINDS) S.fin[k] ??= 0;
    return S.econ;
  }

  /** Movimento no caixa: saldo, linha do balanço e extrato. */
  book(kind: string, label: string, amount: number): void {
    const e = this.ensure();
    this.g.S.money += amount;
    this.g.S.fin[kind] = (this.g.S.fin[kind] ?? 0) + Math.abs(amount);
    if (Math.abs(amount) >= 0.005) {
      e.ledger.unshift({ d: this.g.S.day, k: kind, t: label, v: snapped(amount, 0.001) });
      if (e.ledger.length > 40) e.ledger.length = 40;
    }
  }

  setSeasonBudget(): void {
    const e = this.ensure();
    const f = this.g.myClub().str;
    const cash = this.g.S.money;
    const surplus = (this.baseRevenue(f) - this.wexpK(f) / 1000 - this.staffWeek(f)) * 38;
    e.transfer_budget = snapped(Math.max(0, cash * this.cfg("orcamento_do_caixa", 0.55) + Math.max(surplus, 0) * 0.5), 0.1);
    e.transfer_spent = 0;
    e.wage_budget = snapped(Math.max(this.g.loans.wageBill(this.g.S.club) * 1.05, this.wexpK(f) * this.cfg("teto_folha_sobre_esperada", 1.1)), 1);
    e.board_warn = 0;
  }

  transferLeft(): number { const e = this.ensure(); return e.transfer_budget - e.transfer_spent; }
  annualRevenue(): number { const f = this.g.myClub().str; return (this.tvWeek(f) + this.sponsorWeek(f)) * 52 + this.ticketGame(f) * 19; }
  debtLimit(): number { return -this.annualRevenue() * this.cfg("divida_maxima_sobre_receita", 0.45); }

  /** "" se a diretoria libera o gasto; senão o motivo. */
  canSpend(fee: number, _weeklyWageK = 0): string {
    if (this.g.pro.isPro()) return "";
    if (this.g.S.money < this.debtLimit()) return "A diretoria bloqueou contratações: o clube está endividado demais.";
    if (fee > 0 && fee > this.transferLeft() * 1.5 + 0.5 && fee > this.g.S.money * 0.8) {
      return `A diretoria não libera: o valor passa muito do orçamento de contratações (${Money.fmt(Math.max(this.transferLeft(), 0))}).`;
    }
    return "";
  }

  onPurchase(fee: number, weeklyWageK: number): void {
    const e = this.ensure();
    e.transfer_spent += fee;
    if (this.g.pro.isPro()) return;
    const over = -this.transferLeft();
    if (over > 0.05) {
      this.g.media.addMeter("diretoria", -clamp(3 + over / Math.max(e.transfer_budget, 1) * 10, 3, 14));
      this.g.addNews("Diretoria preocupada", `A contratação estourou o orçamento em ${Money.fmt(over)}.`);
    }
    const bill = this.g.loans.wageBill(this.g.S.club);
    if (bill > e.wage_budget && weeklyWageK > 0) {
      this.g.media.addMeter("diretoria", -3);
      this.g.addNews("Folha acima do teto", `A folha (${Money.wage(bill)}) passou do teto da diretoria (${Money.wage(e.wage_budget)}).`);
    }
  }

  onSale(value: number): void { const e = this.ensure(); e.transfer_spent -= value * this.cfg("venda_para_orcamento", 0.5); }

  roundTick(gap: number, wasHome: boolean): void {
    const e = this.ensure();
    const f = this.g.myClub().str;
    const wk = gap / 7;
    this.book("tv", "Cota de TV", this.tvWeek(f) * wk);
    this.book("patrocinio", "Patrocínio", this.sponsorWeek(f) * wk);
    if (wasHome) {
      this.book("bilheteria", `Bilheteria (${Money.num(this.attendance(f), 0)} pagantes)`, this.ticketGame(f));
      e.last_gate = this.attendance(f);
    }
    this.book("salarios", "Folha salarial", -this.g.loans.wageBill(this.g.S.club) / 1000 * wk);
    this.book("staff", "Comissão técnica e estrutura", -this.staffWeek(f) * wk);
    if (this.g.S.money < 0) this.book("juros", "Juros da dívida", this.g.S.money * this.cfg("juros_semana", 0.0035) * wk);
    if (!this.g.pro.isPro()) {
      const m = this.g.S.money;
      if (m < this.debtLimit()) {
        this.g.media.addMeter("diretoria", -2);
        if (e.board_warn < 3) {
          e.board_warn++;
          this.g.addNews("Diretoria em alerta", `A dívida (${Money.fmt(m)}) passou do limite. Contratações bloqueadas até o caixa melhorar.`);
        }
      } else if (m > 0 && this.g.loans.wageBill(this.g.S.club) <= e.wage_budget) this.g.media.addMeter("diretoria", 0.15);
    }
    e.hist.push([this.g.S.day, snapped(this.g.S.money, 0.01)]);
    if (e.hist.length > 80) e.hist.shift();
    this.aiTick(wk);
  }

  aiCashInit(c: Club): void { if (c.cash === undefined) c.cash = snapped(Math.max(c.str - 50, 4) * this.cfg("caixa_inicial_por_ponto", 1.2), 0.1); }

  private aiTick(wk: number): void {
    for (const c of this.g.S.clubs) {
      if (c.id === this.g.S.club) continue;
      this.aiCashInit(c);
      const f = c.str;
      const annual = this.baseRevenue(f) * 52;
      let cash = c.cash! + (this.baseRevenue(f) - this.wexpK(f) / 1000 - this.staffWeek(f)) * wk;
      if (cash > annual * 0.6) cash -= (cash - annual * 0.6) * 0.2;
      else if (cash < -annual * 0.3) cash += (-annual * 0.3 - cash) * 0.2;
      c.cash = snapped(cash, 0.01);
    }
  }
  aiCanBuy(buyer: number, fee: number): boolean { const c = this.g.S.clubs[buyer]; this.aiCashInit(c); return c.cash! >= fee * 0.6; }
  aiTransferCash(seller: number, buyer: number, fee: number): void {
    const cl = this.g.S.clubs;
    for (const cid of [seller, buyer]) if (cid >= 0 && cid < cl.length) this.aiCashInit(cl[cid]);
    if (seller >= 0 && seller < cl.length && seller !== this.g.S.club) cl[seller].cash! += fee;
    if (buyer >= 0 && buyer < cl.length && buyer !== this.g.S.club) cl[buyer].cash! -= fee;
  }

  /** Linhas do balanço da temporada: [chave, rótulo, valor (+ receita / − despesa)]. */
  breakdown(): [string, string, number][] {
    this.ensure();
    return KINDS.map((k) => [k, LABELS[k], INCOME.includes(k) ? this.g.S.fin[k] ?? 0 : -(this.g.S.fin[k] ?? 0)]);
  }
  seasonResult(): number { return this.breakdown().reduce((t, r) => t + r[2], 0); }
}
