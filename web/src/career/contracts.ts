import type { Game } from "./game";
import { FREE, POS_ORDER } from "./game";
import type { Player } from "./state";
import * as Money from "./money";
import { snapped, clamp } from "../data/rng";

export const ROLES = ["titular", "rodizio", "reserva"];
export const ROLE_NAMES: Record<string, string> = { titular: "Titular", rodizio: "Rodízio", reserva: "Reserva" };

/** Renovação de contratos (porte de contracts.gd). p.contract = temporadas restantes CONTANDO a atual. */
export class Contracts {
  constructor(private g: Game) {}
  cfg(section: string, key: string, fallback: unknown): unknown {
    const sec = this.g.data.rules[section];
    return sec && key in sec ? sec[key] : fallback;
  }
  c(key: string, fallback: number): number { return Number(this.cfg("contrato", key, fallback)); }

  marketWage(p: Player): number { return snapped(Math.max(Math.pow(Math.max(p.ovr - 55, 1), 2) * 0.07, 1.5), 0.1); }
  expiring(p: Player): boolean { return (p.contract ?? 1) <= 1 && !p.loan && !p.me; }
  expiringList(cid: number): Player[] { return this.g.squad(cid).filter((p) => this.expiring(p)); }

  naturalRole(p: Player): string {
    const cid = p.club;
    if (cid >= 0 && cid < this.g.S.clubs.length && this.g.S.clubs[cid].xi.includes(p.id)) return "titular";
    const sq = cid >= 0 ? this.g.squad(cid) : [];
    const better = sq.filter((q) => q.pos === p.pos && q.ovr > p.ovr).length;
    if (better === 0) return "titular";
    return better <= 1 ? "rodizio" : "reserva";
  }
  morale(): number { return Number(this.g.S.media?.moral ?? 60); }

  demand(p: Player): { wage: number; years: number; role: string } {
    let w = Math.max(this.marketWage(p), p.wage);
    if (p.age <= 23) w *= this.c("ajuste_salario_jovem", 1.08);
    else if (p.age >= 32) w *= this.c("ajuste_salario_veterano", 0.9);
    const clubStr = p.club >= 0 ? this.g.club(p.club).str : 70;
    if (p.ovr > clubStr + 5) w *= 1 + this.c("ajuste_craque_acima_do_clube", 0.12);
    w *= 1 - (this.morale() - 60) * this.c("ajuste_moral_por_ponto", 0.003);
    if (this.g.status(p) === "ÍDOLO") w *= this.c("ajuste_idolo", 0.9);
    let years = this.c("anos_pedidos_ate_27", 4);
    if (p.age >= 32) years = this.c("anos_pedidos_32_mais", 1);
    else if (p.age >= 28) years = this.c("anos_pedidos_28_31", 3);
    w *= 1 - this.c("desconto_contraproposta", 0.03) * (p.renew?.tries ?? 0);
    return { wage: snapped(Math.max(w, 1.5), 0.1), years, role: this.naturalRole(p) };
  }

  score(p: Player, wage: number, years: number, role: string): number {
    const d = this.demand(p);
    let need = d.wage;
    if (role === "reserva" && d.role !== "reserva") need *= this.c("exigencia_reserva", 1.15);
    else if (role === "rodizio" && d.role === "titular") need *= this.c("exigencia_rodizio", 1.05);
    return wage / Math.max(need, 0.1) - Math.abs(years - d.years) * this.c("penalidade_por_ano_de_diferenca", 0.04);
  }

  propose(pid: number, wage: number, years: number, role: string): { result: "aceita" | "contraproposta" | "recusa"; text: string; wage?: number; years?: number } {
    const p = this.g.player(pid);
    if (p.club !== this.g.S.club || p.loan || p.contract > 2) return { result: "recusa", text: "Só dá para renovar contratos que terminam nesta ou na próxima temporada." };
    const rn = p.renew ?? {};
    if (rn.refused) return { result: "recusa", text: `${p.name} já decidiu sair no fim do contrato.` };
    years = clamp(years, 1, 5);
    const sc = this.score(p, wage, years, role);
    let tries = rn.tries ?? 0;
    if (sc >= this.c("aceita_a_partir", 0.98)) {
      this.applyRenewal(p, wage, years, role);
      this.g.addNews("Contrato renovado", `${p.name} renovou por ${years} ano(s) recebendo ${Money.wage(wage)} (${ROLE_NAMES[role] ?? role}).`);
      this.g.save();
      return { result: "aceita", text: `${p.name} aceitou! Contrato renovado por ${years} ano(s).`, wage, years };
    }
    tries++;
    rn.tries = tries;
    p.renew = rn;
    if (sc >= this.c("contraproposta_a_partir", 0.85) && tries < this.c("tentativas_maximas", 3)) {
      const d = this.demand(p);
      this.g.save();
      return { result: "contraproposta", text: `${p.name} pede ${Money.wage(d.wage)} e ${d.years} ano(s) para assinar.`, wage: d.wage, years: d.years };
    }
    rn.refused = true;
    p.renew = rn;
    this.g.addNews("Renovação recusada", `${p.name} não aceitou renovar e deve sair de graça no fim da temporada.`);
    this.g.save();
    return { result: "recusa", text: `${p.name} recusou e vai sair no fim do contrato.` };
  }

  applyRenewal(p: Player, wage: number, years: number, role: string): void {
    p.wage = snapped(wage, 0.1);
    p.contract = years + 1;
    p.role = role;
    delete p.renew;
  }

  releaseCost(p: Player): number { return snapped(p.wage * Math.max(p.contract, 1) * 52 / 1000 * this.c("multa_rescisao_fracao", 0.5), 0.01); }

  release(pid: number): string {
    const p = this.g.player(pid);
    if (p.club !== this.g.S.club || p.loan) return "Esse jogador não tem contrato com o seu clube.";
    if (this.g.squad(this.g.S.club).length <= this.c("elenco_minimo", 16)) return `Elenco muito curto para dispensar (mínimo ${this.c("elenco_minimo", 16)}).`;
    const cost = this.releaseCost(p);
    if (cost > this.g.S.money + 0.001) return `Caixa insuficiente para pagar a rescisão (${this.g.money(cost)}).`;
    this.g.finance.book("rescisoes", `Rescisão: ${p.name}`, -cost);
    this.g.logTransfer(p, this.g.S.club, FREE, 0);
    this.toFree(p);
    this.g.validateXi(this.g.S.club);
    this.g.addNews("Contrato rescindido", `${p.name} foi dispensado. Multa paga: ${this.g.money(cost)}.`);
    this.g.save();
    return "";
  }

  toFree(p: Player): void {
    p.club = FREE; p.listed = false; p.contract = 1; delete p.renew;
    p.joined = this.g.S.season; p.cmin = 0; p.cgol = 0; p.cass = 0; p.titles = [];
    for (const c of this.g.S.clubs) {
      c.xi = c.xi.filter((x) => x !== p.id);
      if (c.bench) c.bench = c.bench.filter((x) => x !== p.id);
    }
  }

  roundNotice(): void {
    if (this.g.pro.isPro()) return;
    const rounds = (this.cfg("contrato", "aviso_rodadas", [0, 10, 20, 30]) as number[]).map(Number);
    if (!rounds.includes(this.g.S.round)) return;
    const exp = this.expiringList(this.g.S.club).filter((p) => !p.renew?.refused);
    if (!exp.length) return;
    const names = exp.slice(0, 4).map((p) => p.name).join(", ");
    const more = exp.length <= 4 ? "" : ` e mais ${exp.length - 4}`;
    this.g.addNews("Contratos a vencer", `${exp.length} jogador(es) com contrato até o fim da temporada: ${names}${more}. Renove em Elenco > perfil.`);
  }

  /** Fim de temporada: saídas de graça do seu clube (Bosman) e renovações da máquina. */
  seasonEnd(): string[] {
    const g = this.g;
    const left: string[] = [];
    const me = g.S.club;
    const pro = g.pro.isPro();
    for (const p of Object.values(g.S.players)) {
      if (p.me || p.loan || p.club < 0 || p.contract > 1) continue;
      const cid = p.club;
      if (cid === me && !pro) { left.push(p.name); g.logTransfer(p, cid, FREE, 0); this.toFree(p); continue; }
      const st = cid < g.S.clubs.length ? g.S.clubs[cid].str : 70;
      const key = p.ovr >= st - 6 && p.age <= 31;
      const ch = key ? this.c("ia_renova_chance_titular", 0.85) : this.c("ia_renova_chance_reserva", 0.45);
      if (g.rng.randf() < ch) { const d = this.demand(p); this.applyRenewal(p, d.wage, d.years, d.role); }
      else this.toFree(p);
    }
    if (left.length) g.addNews("Saídas de fim de contrato", `Sem renovação, deixaram o clube de graça: ${left.join(", ")}.`);
    for (let cid = 0; cid < g.S.clubs.length; cid++) {
      let n = g.squad(cid).length;
      const minimum = cid === me ? this.c("elenco_minimo", 16) : 20;
      while (n < minimum) {
        const pos = POS_ORDER[g.rng.randiRange(0, 8)];
        const np = g.makePlayer(pos, g.S.clubs[cid].str - g.rng.randiRange(3, 9), cid, g.rng.randiRange(19, 30));
        np.contract = 3;
        n++;
        if (cid === me) g.addNews("Reforço de emergência", `Para completar o elenco, a diretoria contratou ${np.name} (${np.pos}, GER ${np.ovr}).`);
      }
    }
    return left;
  }
}
