// Liga as telas à carreira real (web/src/career): converte o estado do jogo nos modelos das telas.
import { Game, Money, LocalSaveStore, FORMATIONS, TONES } from "../career";
import type { Player, Club, MatchSim } from "../career";
import { loadGameData, FetchDataSource } from "../data/db";
import type { BoxTierVM, CareerApi, ClubVM, PlayerVM, MatchInfoVM, MatchResultVM, PackVM, PostVM, CupVM, TieVM, TableRowVM } from "./career_api";

const STAT_LABELS = ["Jogadas de ataque", "Chutes", "Posse de bola (%)", "Faltas", "Cartões amarelos", "Cartões vermelhos", "Impedimentos"];

export async function createRealCareer(base = "./"): Promise<RealCareer> {
  const data = await loadGameData(new FetchDataSource(base + "data/"));
  return new RealCareer(new Game(data, new LocalSaveStore()));
}

export class RealCareer implements CareerApi {
  /** Partida ao vivo (o módulo da partida põe aqui o MatchSim que está jogando). */
  liveSim: MatchSim | null = null;
  private played = false;
  constructor(readonly g: Game) {}

  money(v: number): string { return Money.fmt(v); }

  private club(cid: number): ClubVM {
    const c: Club = this.g.S.clubs[cid];
    return { id: cid, name: c?.name ?? "?", short: c?.short ?? "?", c1: c?.c1 ?? "#888", c2: c?.c2 ?? "#fff", crest: this.g.clubLogo(cid), str: c?.str ?? 60,
      striped: this.g.data.names.striped.includes(c?.name ?? "") };
  }
  private p(p: Player): PlayerVM {
    return { id: p.id, name: p.name, pos: p.pos, age: p.age, ovr: p.ovr, pot: p.pot, nat: p.nat, num: p.num ?? 0, energy: p.energy, value: p.value, wage: p.wage,
      contract: p.contract, expiring: p.contract <= 1 && p.club === this.g.S.club, injured: !!p.injury || (p.susp ?? 0) > 0, loan: p.loan ? "Emprestado" : undefined,
      goals: p.gol, apps: p.g, assists: p.ass, look_skin: p.look_skin, look_hcolor: p.look_hcolor, look_hstyle: p.look_hstyle, look_beard: p.look_beard };
  }

  slots() {
    return [0, 1, 2, 3].map((slot) => {
      const s = this.g.peekSave(slot) as Record<string, any> | null;
      if (!s) return { slot, empty: true };
      const club = s.clubs?.[s.club];
      return { slot, empty: false, mode: (s.mode === "pro" ? "jogador" : "tecnico") as "tecnico" | "jogador", season: s.season, league: this.g.data.leagues[s.league ?? 0]?.name,
        who: s.coach?.name, club: club ? { id: s.club, name: club.name, short: club.short, c1: club.c1, c2: club.c2, crest: club.logo ?? -1, str: club.str } : undefined };
    });
  }
  leagues() {
    return this.g.data.leagues.map((l, idx) => ({ idx, name: l.name, country: l.country, compId: l.comp_id,
      clubs: l.clubs.map((c, i) => ({ id: i, name: c.name, short: c.short, c1: c.c1, c2: c.c2, crest: c.logo, str: c.str, striped: this.g.data.names.striped.includes(c.name) })) }));
  }
  newCareer(slot: number, mode: "tecnico" | "jogador", league: number, club: number, person: Record<string, unknown>): void {
    const name = String(person.name ?? "Técnico");
    if (mode === "tecnico") this.g.newCareer(slot, { name, age: 38, nat: "Brasil", rep: 5, skin: person.skin, hair: person.hstyle, haircolor: person.hcolor, beard: person.beard ? 1 : 0 }, club, league);
    else this.g.pro.start(slot, { ...this.g.pro.newProfile(), name, pos: person.pos, look_skin: person.skin, look_hstyle: person.hstyle, look_hcolor: person.hcolor, look_beard: person.beard } as never);
  }
  load(slot: number): boolean { return this.g.loadCareer(slot); }

  nextMatch(): MatchInfoVM | null {
    const m = this.g.nextUserMatch();
    if (!m) return null;
    const lg = this.g.league();
    const compId = m.kind === "cup" && m.cup !== undefined ? this.g.S.cups[m.cup]?.comp ?? -1 : lg.comp_id;
    const d = this.g.dateOf(m.day);
    return { home: this.club(m.h), away: this.club(m.a), comp: m.comp, compId, stage: m.label, date: `${String(d.day).padStart(2, "0")}/${String(d.month).padStart(2, "0")}` };
  }
  hub() {
    const S = this.g.S, me = this.club(S.club), tb = this.g.sortedTable(), pos = tb.indexOf(S.club) + 1, mc = S.clubs[S.club];
    const form: string[] = [];
    for (let r = S.round - 1; r >= 0 && form.length < 5; r--) {
      const f = this.g.myMatch(r);
      if (!f) continue;
      const mine = f.h === S.club ? f.hg : f.ag, opp = f.h === S.club ? f.ag : f.hg;
      form.unshift(mine > opp ? "V" : mine === opp ? "E" : "D");
    }
    const feed = this.g.media.feed();
    const exp = this.g.squad(S.club).filter((p) => p.contract <= 1).length;
    return { club: me, league: this.g.LEAGUE, compId: this.g.league().comp_id, season: S.season, dateLabel: this.g.monthYear(S.day), next: this.nextMatch(),
      tablePos: pos, pts: mc.pts, played: mc.j, form, money: S.money, approval: Math.round(this.g.media.approval()), followers: this.g.media.followers().toLocaleString("pt-BR"),
      lastPost: feed[0] ? `@${feed[0].user}: "${feed[0].text}"` : "Sem novidades nas redes.", unread: S.unread, formation: mc.formation, teamEnergy: Math.round(this.g.energyAvg(S.club)),
      expiring: exp, offers: S.offers.length + S.loan_offers.length };
  }
  squad(): PlayerVM[] { return this.g.squad(this.g.S.club).map((p) => this.p(p)); }
  player(id: number): PlayerVM | undefined { const p = this.g.S.players[id]; return p ? this.p(p) : undefined; }
  lineup() {
    const c = this.g.S.clubs[this.g.S.club];
    return { formation: c.formation, formations: Object.keys(FORMATIONS), xi: c.xi.slice(), bench: this.g.bench(this.g.S.club).map((p) => p.id), training: this.g.S.training };
  }
  setLineup(xi: number[], bench: number[], formation: string, training: "leve" | "normal" | "forte"): void {
    const c = this.g.S.clubs[this.g.S.club];
    c.formation = formation; c.xi = xi.slice(0, 11); c.bench = bench.slice(); c.bench_manual = true;
    this.g.validateXi(this.g.S.club);
    this.g.fitness.setTraining(training);
    this.g.save();
  }
  autoLineup(): void { this.g.autoLineup(this.g.S.club); }
  market(f: { pos?: string; loans?: boolean }): PlayerVM[] {
    const list = f.loans ? this.g.loans.availableIn() : Object.values(this.g.S.players).filter((p) => p.club !== this.g.S.club && p.club >= 0 && !p.loan);
    return list.filter((p) => !f.pos || p.pos === f.pos).sort((a, b) => b.ovr - a.ovr).slice(0, 300).map((p) => this.p(p));
  }
  buy(id: number): string { const p = this.g.S.players[id]; return this.g.signPlayer(id, this.g.askFee(p), this.g.askWage(p), 3); }
  loanIn(id: number): string { return this.g.loans.loanIn(id, false, 50, false); }
  loanOut(id: number): string { return this.g.loans.offerOut(id, false).text; }
  renewal(id: number) {
    const p = this.g.S.players[id], d = this.g.contracts.demand(p);
    return { player: this.p(p), askWage: d.wage, askYears: d.years, askRole: d.role, tries: p.renew?.tries ?? 0 };
  }
  proposeRenewal(id: number, wage: number, years: number, role: string) { const r = this.g.contracts.propose(id, wage, years, role); return { result: r.result, text: r.text }; }
  packs(): PackVM[] {
    const st = this.g.store;
    return st.packs().map((p) => ({ id: p.id, name: p.nome, desc: p.descricao, price: st.price(p.id), count: p.cartas,
      spinsLeft: st.spinsLeft(), spinsMax: st.spinsMax(),
      tiers: st.odds(p.id).map((o) => { const t = st.tier(o.tier); return { id: t.id as BoxTierVM["id"], name: t.nome, ovr: t.ovr, pct: Math.round(o.p * 1000) / 10, color: "#" + t.cor }; }) }));
  }
  openPack(id: string) {
    const why = this.g.store.canBuy(id);
    if (why) return { ok: false, msg: why, players: [], refund: 0, tiers: [] as BoxTierVM["id"][] };
    const r = this.g.store.buy(id);
    const players = r.cards.map((c, i) => (c.pid !== undefined && this.g.S.players[c.pid] ? this.p(this.g.S.players[c.pid]) :
      { id: 90000 + i, name: c.name, pos: c.pos, age: c.age, ovr: c.ovr, pot: c.ovr, nat: c.nat, num: 0, energy: 100, value: 0, wage: 0, contract: 0 }));
    return { ok: r.ok, msg: r.text, players, refund: r.cards.reduce((t, c) => t + c.refund, 0), tiers: r.cards.map((c) => c.tier as BoxTierVM["id"]) };
  }
  finance() {
    const S = this.g.S, e = S.econ, bd = this.g.finance.breakdown();
    return { cash: S.money, seasonResult: this.g.finance.seasonResult(), budget: e.transfer_budget, spent: e.transfer_spent, wageBill: this.g.loans.wageBill(S.club) / 1000,
      wageCap: e.wage_budget / 1000, confidence: Math.round(this.g.media.meter("diretoria")),
      income: bd.filter((r) => r[2] > 0).map((r) => ({ label: r[1], value: r[2] })), expense: bd.filter((r) => r[2] < 0).map((r) => ({ label: r[1], value: r[2] })),
      history: e.hist.map((h) => h[1]), tx: e.ledger.slice(-40).reverse().map((l) => { const d = this.g.dateOf(l.d); return { day: `${d.day}/${d.month}`, label: l.t, value: l.v }; }) };
  }
  table(): TableRowVM[] {
    return this.g.sortedTable().map((cid, i) => { const c = this.g.S.clubs[cid]; return { pos: i + 1, club: this.club(cid), p: c.j, w: c.v, d: c.e, l: c.d, gf: c.gp, ga: c.gc, pts: c.pts, me: cid === this.g.S.club }; });
  }
  results() {
    const out: { round: string; home: ClubVM; away: ClubVM; hg: number; ag: number }[] = [];
    for (let r = this.g.S.round - 1; r >= 0 && out.length < 40; r--) for (const f of this.g.S.fixtures[r].m) out.push({ round: `Rodada ${r + 1}`, home: this.club(f.h), away: this.club(f.a), hg: f.hg, ag: f.ag });
    return out;
  }
  calendar() {
    const S = this.g.S, out: { date: string; opp: ClubVM; home: boolean; comp: string; compId: number }[] = [];
    for (let r = S.round; r < S.fixtures.length && out.length < 12; r++) {
      const f = this.g.myMatch(r); if (!f) continue;
      const d = this.g.dateOf(S.fixtures[r].day);
      out.push({ date: `${d.day}/${d.month}`, opp: this.club(f.h === S.club ? f.a : f.h), home: f.h === S.club, comp: this.g.LEAGUE, compId: this.g.league().comp_id });
    }
    return out;
  }
  cups(): CupVM[] {
    return (this.g.S.cups ?? []).map((c) => ({ name: c.name, compId: c.comp, champion: c.champion >= 0 ? this.club(c.champion) : undefined,
      rounds: c.rounds.map((ties, ri) => ({ name: this.g.cups.stageName(c, this.g.cups.stages(c).findIndex((s: { round: number }) => s.round === ri)) || `Fase ${ri + 1}`,
        ties: ties.map((t): TieVM => ({ a: this.club(t.h), b: this.club(t.a), sa: String(t.hg) + (t.pens.length ? ` (${t.pens[0]})` : ""), sb: String(t.ag) + (t.pens.length ? ` (${t.pens[1]})` : ""), winner: t.w === t.h ? 0 : t.w === t.a ? 1 : -1 })) })) }));
  }
  pressQuestions() {
    const out = [];
    const q = this.g.media.currentQuestion();
    if (q) out.push({ q: q.q, answers: q.a as never });
    return out;
  }
  answerPress(tone: string) {
    const r = this.g.media.answer(tone as (typeof TONES)[number]);
    return { meters: this.meters(), reaction: r?.texto ?? "" };
  }
  meters(): Record<string, number> { const m = this.g.media; return { diretoria: m.meter("diretoria"), torcida: m.meter("torcida"), elenco: m.meter("moral"), imprensa: m.meter("imprensa") }; }
  social(tab: number): PostVM[] {
    const kinds = ["", "torcida", "corneta", "imprensa", "rival"];
    const map = (k: string): PostVM["kind"] => (k.includes("corn") || k.includes("hater") ? "corneta" : k.includes("impr") || k.includes("jorn") ? "imprensa" : k.includes("rival") ? "rival" : k.includes("voce") || k.includes("eu") ? "voce" : "torcida");
    return this.g.media.feed().map((p) => ({ user: p.user, kind: map(p.kind), text: p.text, likes: p.likes, when: p.day >= this.g.S.day - 1 ? "hoje" : `há ${this.g.S.day - p.day} dias`, verified: map(p.kind) === "imprensa" }))
      .filter((p) => !tab || p.kind === kinds[tab]);
  }
  private result(): MatchResultVM {
    const lu = this.g.S.last_user ?? {};
    const st: number[][] = lu.st ?? [];
    return { home: this.club(lu.h), away: this.club(lu.a), hg: lu.hg ?? 0, ag: lu.ag ?? 0,
      scorers: (lu.sc ?? []).map((s: { min: number; name: string; side: number }) => ({ min: s.min, name: s.name, home: s.side === 0 })),
      stats: st.length ? STAT_LABELS.map((k, i) => [k, st[i]?.[0] ?? 0, st[i]?.[1] ?? 0] as [string, number, number]) : [] };
  }
  playMatch(): MatchResultVM {
    if (!this.played) this.g.playNext(this.liveSim);
    this.played = false; this.liveSim = null;
    return this.result();
  }
  /** O módulo da partida chama isto quando já aplicou o jogo ao vivo (g.playNext(sim)). */
  markPlayed(): void { this.played = true; }
  simulateMatch(): MatchResultVM { this.g.playNext(null); return this.result(); }
  seasonOver(): boolean { return !!this.g.S.season_over; }
  seasonSummary() {
    const s = this.g.seasonSummary();
    return { pos: s.pos, champion: this.club(s.champion), prize: s.prize, topScorer: s.top ? `${s.top.name} (${s.top.gol} gols)` : "—",
      titles: (this.g.S.trophies ?? []).filter((t) => t.year === this.g.S.year).map((t) => t.name) };
  }
  newSeason(): void { this.g.newSeason(); }
}
