import type { Game } from "./game";
import type { Cup, Tie } from "./state";
import { MatchSim } from "./match_sim";
import { norm } from "../data/db";
import { snapped, clamp } from "../data/rng";

const ROUND_NAMES: Record<number, string> = { 64: "32-avos de final", 32: "16-avos de final", 16: "Oitavas de final", 8: "Quartas de final", 4: "Semifinal", 2: "Final" };
const STAGE_NAMES: Record<number, string> = { 64: "32-avos de Final", 32: "16-avos de Final", 16: "Oitavas de Final", 8: "Quartas de Final", 4: "Semi Finais", 2: "Final" };

/** Copas em mata-mata (porte de cups.gd). Estado em g.S.cups. */
export class Cups {
  constructor(private g: Game) {}

  private def(c: Cup) { return this.g.data.cups[c.def]; }
  roundName(c: Cup, r: number): string { const n = this.def(c).size >> r; return ROUND_NAMES[n] ?? `Fase ${r + 1}`; }
  stages(c: Cup) {
    if (!c.stages) c.stages = c.days.map((_, r) => ({ round: r, leg: 1 }));
    return c.stages;
  }
  roundLegs(c: Cup, r: number): number { return Math.max(this.stages(c).filter((s) => s.round === r).length, 1); }
  stageName(c: Cup, si: number): string {
    const st = this.stages(c)[si];
    const n = this.def(c).size >> st.round;
    let nm = STAGE_NAMES[n] ?? `Fase ${st.round + 1}`;
    if (this.roundLegs(c, st.round) > 1) nm += st.leg === 1 ? " - Primeira Partida" : " - Segunda Partida";
    return nm;
  }
  stageLabel(c: Cup, si: number): string {
    const st = this.stages(c)[si];
    let nm = this.roundName(c, st.round);
    if (this.roundLegs(c, st.round) > 1) nm += st.leg === 1 ? " • Jogo de ida" : " • Jogo de volta";
    return nm;
  }
  tieLegs(t: Tie): number[][] {
    if (t.legs) return t.legs;
    return t.hg >= 0 ? [[t.hg, t.ag]] : [];
  }
  aggregate(t: Tie, n = 99): number[] {
    const L = this.tieLegs(t);
    let x = 0, y = 0;
    for (let i = 0; i < Math.min(n, L.length); i++) { x += L[i][0]; y += L[i][1]; }
    return [x, y];
  }

  /** Resultados de uma etapa, na visão do mandante deste jogo. */
  stageResults(ci: number, si: number) {
    const c = this.g.S.cups[ci];
    const sts = this.stages(c);
    if (si < 0 || si >= sts.length) return [];
    const { round: r, leg } = sts[si];
    if (r >= c.rounds.length) return [];
    const last = leg >= this.roundLegs(c, r);
    return c.rounds[r].map((t) => {
      const L = this.tieLegs(t);
      const played = L.length >= leg;
      const flip = leg === 2;
      const gl = played ? L[leg - 1] : [-1, -1];
      const ag = this.aggregate(t, played ? leg : leg - 1);
      const pens = played && last ? t.pens : [];
      return { h: flip ? t.a : t.h, a: flip ? t.h : t.a, hg: flip ? gl[1] : gl[0], ag: flip ? gl[0] : gl[1],
        agg_h: flip ? ag[1] : ag[0], agg_a: flip ? ag[0] : ag[1], pens: flip && pens.length ? [pens[1], pens[0]] : pens.slice(),
        w: played && last ? t.w : -1, leg };
    });
  }

  private leagueIndex(name: string): number { return this.g.data.leagues.findIndex((l) => l.name === name); }
  private inOnly(only: string[], a: string, b: string): boolean { return only.some((nm) => norm(nm) === norm(a) || norm(nm) === norm(b)); }
  private byStrength(): number[] {
    return Array.from({ length: this.g.nLeague() }, (_, i) => i).sort((a, b) => this.g.club(b).str - this.g.club(a).str);
  }

  /** Monta as copas da temporada. ranking = ordem final do campeonato anterior (ou vazio). */
  buildSeason(ranking: number[]): void {
    const S = this.g.S;
    const myLeague = this.g.data.leagues[S.league].name;
    S.cups = [];
    const used = new Set<number>();
    this.g.data.cups.forEach((cd, d) => {
      if (!cd.region.includes(myLeague)) return;
      let teams: number[] = [];
      cd.region.forEach((rname, k) => {
        const li = this.leagueIndex(rname);
        if (li < 0) return;
        const take = cd.take[k];
        const only = cd.only ?? [];
        if (li === S.league) {
          let order = ranking.length ? ranking.slice() : this.byStrength();
          if (only.length) order = order.filter((cid) => this.inOnly(only, this.g.data.leagues[li].clubs[this.g.club(cid).ci]?.name ?? "", this.g.club(cid).name));
          teams.push(...order.slice(0, take));
        } else {
          let got = 0;
          const lg = this.g.data.leagues[li];
          for (let ci = 0; ci < lg.clubs.length && got < take; ci++) {
            const info = lg.clubs[ci];
            if (only.length && !this.inOnly(only, info.name, info.name)) continue;
            teams.push(this.g.guestClub(li, ci));
            got++;
          }
        }
      });
      teams = teams.slice(0, cd.size);
      if (teams.length < cd.size) return;
      this.g.rng.shuffle(teams);
      const cup: Cup = { def: d, name: cd.name, comp: cd.comp, alive: teams, rounds: [], days: [], stages: [], next: 0, champion: -1 };
      this.schedule(cup, used);
      S.cups.push(cup);
    });
  }

  private schedule(cup: Cup, used: Set<number>): void {
    const fx = this.g.S.fixtures;
    const n = fx.length;
    const gaps = n - 1;
    const cd = this.def(cup);
    let rounds = 0;
    for (let sz = cd.size; sz > 1; sz >>= 1) rounds++;
    const legs = clamp(cd.legs ?? 1, 1, 2);
    const sts: { round: number; leg: number }[] = [];
    for (let r = 0; r < rounds; r++) {
      const nl = r === rounds - 1 && cd.final_single ? 1 : legs;
      for (let l = 0; l < nl; l++) sts.push({ round: r, leg: l + 1 });
    }
    cup.stages = sts;
    cup.days = [];
    const total = sts.length;
    let prev = -1;
    for (let k = 0; k < total; k++) {
      const hi = Math.max(gaps - (total - k), prev + 1);
      let target = sts[k].leg === 1 ? Math.floor((k + 1) * gaps / (total + 1)) : prev + 1;
      target = clamp(target, prev + 1, hi);
      let g = -1;
      for (let i = target; i <= hi; i++) if (!used.has(i)) { g = i; break; }
      if (g < 0) for (let i = target - 1; i > prev; i--) if (!used.has(i)) { g = i; break; }
      if (g < 0) g = target;
      g = clamp(g, 0, Math.max(gaps - 1, 0));
      used.add(g);
      prev = g;
      const d0 = fx[g].day, d1 = fx[Math.min(g + 1, n - 1)].day;
      cup.days.push(d0 + Math.max(1, Math.floor((d1 - d0) / 2)));
    }
  }

  nextDue(): { cup: number; round: number; leg: number; stage: number; day: number } | null {
    let best: { cup: number; round: number; leg: number; stage: number; day: number } | null = null;
    (this.g.S.cups ?? []).forEach((c, i) => {
      if (c.champion >= 0 || c.next >= c.days.length) return;
      const d = c.days[c.next];
      if (!best || d < best.day) {
        const st = this.stages(c)[c.next];
        best = { cup: i, round: st.round, leg: st.leg, stage: c.next, day: d };
      }
    });
    return best;
  }

  private curRound(c: Cup): number {
    const sts = this.stages(c);
    return c.next >= sts.length ? c.rounds.length : sts[c.next].round;
  }

  ensureDraw(ci: number): void {
    const c = this.g.S.cups[ci];
    if (c.rounds.length > this.curRound(c)) return;
    const ties: Tie[] = [];
    for (let i = 0; i + 1 < c.alive.length; i += 2) {
      ties.push({ h: c.alive[i], a: c.alive[i + 1], hg: -1, ag: -1, pens: [], w: -1, sc: [], st: [], legs: [] });
    }
    c.rounds.push(ties);
  }

  myTie(ci: number): Tie | null {
    this.ensureDraw(ci);
    const c = this.g.S.cups[ci];
    const r = this.curRound(c);
    if (r >= c.rounds.length) return null;
    return c.rounds[r].find((t) => t.h === this.g.S.club || t.a === this.g.S.club) ?? null;
  }

  /** Joga a próxima etapa inteira. userSim = partida do jogador (ou null para simular). */
  playRound(ci: number, userSim: MatchSim | null): void {
    this.ensureDraw(ci);
    const c = this.g.S.cups[ci];
    const cd = this.def(c);
    const si = c.next;
    const { round: r, leg } = this.stages(c)[si];
    const last = leg >= this.roundLegs(c, r);
    this.g.S.day = c.days[si];
    const winners: number[] = [];
    for (const t of c.rounds[r]) {
      const home = leg === 1 ? t.h : t.a;
      const away = leg === 1 ? t.a : t.h;
      const sim = userSim && userSim.h === home && userSim.a === away ? userSim : new MatchSim(this.g, home, away);
      while (!sim.finished) sim.step();
      this.g.applyPlayers(sim);
      const L = leg > 1 ? this.tieLegs(t).slice() : [];
      L.push(leg === 1 ? [sim.score[0], sim.score[1]] : [sim.score[1], sim.score[0]]);
      t.legs = L;
      const ag = this.aggregate(t);
      t.hg = ag[0]; t.ag = ag[1];
      t.sc = sim.scorers;
      t.st = sim.stats();
      if (!last) continue;
      if (t.hg !== t.ag) t.w = t.hg > t.ag ? t.h : t.a;
      else {
        t.pens = this.shootout(t.h, t.a);
        t.w = t.pens[0] > t.pens[1] ? t.h : t.a;
      }
      winners.push(t.w);
      if (t.w === this.g.S.club) this.g.finance.book("premios", `Premiação: ${c.name}`, snapped(cd.prize * (0.25 + 0.25 * r), 0.01));
    }
    c.next = si + 1;
    if (!last) return;
    c.alive = winners;
    if (winners.length === 1) { c.champion = winners[0]; this.crown(c); }
    else if (this.myStatus(ci) === "eliminado" && c.rounds[r].some((t) => t.h === this.g.S.club || t.a === this.g.S.club)) {
      this.g.addNews(`Eliminado da ${c.name}`, `O time caiu na ${this.roundName(c, r)}.`);
    }
  }

  private shootout(h: number, a: number): number[] {
    const rng = this.g.rng;
    const ph = 0.5 + (this.g.club(h).str - this.g.club(a).str) / 80;
    let x = 0, y = 0;
    for (let k = 0; k < 5; k++) { if (rng.randf() < 0.76) x++; if (rng.randf() < 0.76) y++; }
    while (x === y) { if (rng.randf() < 0.76) x++; if (rng.randf() < 0.76) y++; }
    if ((x > y) !== (rng.randf() < clamp(ph, 0.3, 0.7))) [x, y] = [y, x];
    return [x, y];
  }

  private crown(c: Cup): void {
    const g = this.g;
    const champ = c.champion;
    g.club(champ).titles = (g.club(champ).titles ?? 0) + 1;
    for (const p of g.squad(champ)) p.titles.push(c.name);
    if (champ === g.S.club) {
      g.S.trophies.push({ name: c.name, year: g.S.year });
      g.S.support = Math.min(g.S.support + 12, 100);
      g.S.coach.rep = Math.min(g.S.coach.rep + 1, 10);
      const big = this.def(c).prize;
      g.finance.book("premios", `Título: ${c.name}`, big);
      g.addNews(`CAMPEÃO DA ${c.name.toUpperCase()}!`, `Título conquistado! Premiação de ${g.money(big)}.`);
    } else g.addNews(`${c.name}: campeão`, `${g.clubName(champ)} ficou com a taça.`);
  }

  /** "campeão", "vivo", "eliminado" ou "fora". */
  myStatus(ci: number): string {
    const c = this.g.S.cups[ci];
    const me = this.g.S.club;
    if (c.champion === me) return "campeão";
    if (c.alive.includes(me)) return "vivo";
    for (const rd of c.rounds) for (const t of rd) if (t.h === me || t.a === me) return "eliminado";
    return "fora";
  }
}
