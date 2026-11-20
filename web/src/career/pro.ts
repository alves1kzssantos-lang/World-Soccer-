import type { Game, UserMatch } from "./game";
import { FORMATIONS, FREE, SQUAD_TEMPLATE } from "./game";
import type { Coach, Player } from "./state";
import { MatchSim } from "./match_sim";
import * as Money from "./money";
import { snapped, clamp, lerp } from "../data/rng";
import type { Pos } from "../data/types";

export const POSITIONS: Pos[] = ["AC", "PD", "PE", "MEI", "VOL", "LD", "LE", "ZAG"];
export const POS_NAMES: Record<string, string> = { AC: "Centroavante", PD: "Ponta direita", PE: "Ponta esquerda", MEI: "Meia", VOL: "Volante",
  LD: "Lateral direito", LE: "Lateral esquerdo", ZAG: "Zagueiro", GOL: "Goleiro" };
export const NATS = ["Brasil", "Argentina", "Portugal", "Colômbia", "Espanha", "Inglaterra", "França", "Itália", "Alemanha"];
export const BOOTS = ["17171b", "f2f2f2", "e8c61c", "e0402f", "2f8fe0", "34c46b", "ff7ad9"];
const BIG_NATIONS = ["Brasil", "Argentina", "França", "Espanha", "Inglaterra", "Alemanha", "Portugal"];

export interface ProProfile { name: string; age: number; nat: string; pos: Pos; foot: string; num: number; skin: number; hstyle: number; hcolor: number; beard: boolean; boots: number }
export interface ProOffer {
  li: number; ci: number; name: string; short: string; c1: string; c2: string; str: number; league: string; country: string;
  role: string; wage: number; years: number; luvas: number; clause: number; renewal: boolean; id: number;
}

/** Carreira de jogador (porte de pro_career.gd): peneira, propostas, notas, fama, redes, empresário e seleção. */
export class Pro {
  constructor(private g: Game) {}
  private sec(name: string): Record<string, any> { return this.g.data.pro?.[name] ?? {}; }
  cfg(section: string, key: string, fallback: number): number { const v = this.sec(section)[key]; return typeof v === "number" ? v : fallback; }
  cfgPos(section: string, pos: string, fallback: number): number { return this.cfg(section, pos, fallback); }
  social(): Record<string, any> { return this.g.data.proSocial ?? {}; }
  life(): Record<string, any> { return this.g.data.proLife ?? {}; }

  isPro(): boolean { return !!this.g.S.clubs && this.g.S.mode === "pro" && !!this.g.S.pro; }
  P(): any {
    const pr = this.g.S.pro;
    if ((pr._v ?? 0) < 3) this.migrate(pr);
    return pr;
  }
  private migrate(pr: any): void {
    const d: Record<string, unknown> = { me: -1, stage: "carreira", trial_teams: [], scouts: [], fame: 0, followers: 120, fans: 50, coach: 50, money: 0,
      agent: "", offers: [], feed: [], next_post: 1, posted: false, replied: false, polemics: 0, banned: 0, train: "normal", xp: 0, ratings: [],
      season: this.blankSeason(), history: [], awards: [], titles: [], sponsors: [], owned: [], caps: 0, ngoals: 0, season_caps: 0, injury: "",
      pending_move: {}, last: {}, negotiated: {}, season_closed: false, season_report: {}, retired: false, clause: 0 };
    for (const k of Object.keys(d)) if (!(k in pr)) pr[k] = JSON.parse(JSON.stringify(d[k]));
    pr._v = 3;
  }
  me(): Player { return this.g.player(this.P().me); }
  private pick<T>(arr: T[]): T { return arr[this.g.rng.randiRange(0, arr.length - 1)]; }
  fmt(t: string): string {
    let opp = "";
    const lu = this.g.S.last_user;
    if (lu) opp = this.g.clubName(lu.h === this.g.S.club ? lu.a : lu.h);
    const nota = Number(this.P().last?.rating ?? 6);
    return t.split("{n}").join(this.me().name).split("{c}").join(this.g.clubName(this.g.S.club)).split("{r}").join(opp).split("{nota}").join(nota.toFixed(1));
  }
  agent(): any { return (this.life().empresarios ?? []).find((a: any) => a.id === this.P().agent) ?? {}; }
  agentLevel(): number { return Number(this.agent().nivel ?? 0); }
  avgRating(): number { const s = this.P().season; return s.g > 0 ? s.sum / s.g : 0; }
  form(n = 5): number {
    const rs: number[] = this.P().ratings;
    if (!rs.length) return 6;
    const last = rs.slice(-n);
    return last.reduce((a, b) => a + b, 0) / last.length;
  }
  roleName(r: string): string { return ({ titular: "Titular", rotacao: "Rotação", reserva: "Reserva", base: "Time de base" } as Record<string, string>)[r] ?? r; }

  newProfile(): ProProfile { return { name: "Novo Craque", age: 17, nat: "Brasil", pos: "AC", foot: "Direito", num: 9, skin: 2, hstyle: 1, hcolor: 0, beard: false, boots: 0 }; }
  signsFrom(li: number): boolean { const lg = this.g.data.leagues[li]; return !(lg.country === "Brasil" && lg.name.startsWith("Campeonato ")); }
  homeLeague(nat: string): number {
    let best = -1;
    this.g.data.leagues.forEach((lg, i) => {
      if (lg.country === nat && this.signsFrom(i) && (best < 0 || lg.prize < this.g.data.leagues[best].prize)) best = i;
    });
    return Math.max(best, 0);
  }
  private stubCoach(): Coach { return { name: "Diretoria", age: 50, nat: "Brasil", rep: 5 }; }
  private applyLook(p: Player, prof: ProProfile): void {
    p.look_skin = prof.skin; p.look_hstyle = prof.hstyle; p.look_hcolor = prof.hcolor; p.look_beard = prof.beard;
    p.look_boots = BOOTS[prof.boots] ?? BOOTS[0]; p.num = prof.num; p.foot = prof.foot;
  }

  /** Começa a carreira de jogador: mundo do país dele e a peneira (dois times de garotos). */
  start(slot: number, prof: ProProfile): void {
    const g = this.g;
    const li = this.homeLeague(prof.nat);
    g.newCareer(slot, this.stubCoach(), 0, li);
    const S = g.S;
    S.mode = "pro";
    S.news = [];
    S.unread = 0;
    const teams: number[] = [];
    const names = [["Peneira Azul", "AZU", "2f6fd6", "f2f2f2"], ["Peneira Branca", "BRA", "f2f2f2", "1c3f8f"]];
    for (let k = 0; k < 2; k++) {
      const cid = S.clubs.length;
      S.clubs.push({ id: cid, name: names[k][0], short: names[k][1], c1: names[k][2], c2: names[k][3], str: 58, li, ci: -1, guest: true, trial: true,
        formation: "4-3-3", xi: [], titles: 0, pts: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0 });
      for (const tp of SQUAD_TEMPLATE.slice(0, 16)) g.makePlayer(tp, g.rng.randiRange(50, 61), cid, g.rng.randiRange(16, 19));
      teams.push(cid);
    }
    const base = Number(this.sec("criacao").ovr_por_idade?.[String(prof.age)] ?? 54);
    const p = g.makePlayer(prof.pos, base + g.rng.randiRange(-1, 2), teams[0], prof.age);
    p.name = prof.name; p.nat = prof.nat; p.me = true;
    p.pot = g.rng.randiRange(this.cfg("criacao", "pot_min", 76), this.cfg("criacao", "pot_max", 92));
    p.wage = 0; p.contract = 0;
    this.applyLook(p, prof);
    S.club = teams[0];
    S.pro = { _v: 3, me: p.id, stage: "peneira", trial_teams: teams, scouts: this.scouts(prof.nat), fame: 0, followers: 120, fans: 50,
      coach: this.cfg("tecnico", "confianca_inicial", 50), money: 0, agent: "", offers: [], feed: [], next_post: 1, posted: false, replied: false,
      polemics: 0, banned: 0, train: "normal", xp: 0, ratings: [], season: this.blankSeason(), history: [], awards: [], titles: [],
      sponsors: [], owned: [], caps: 0, ngoals: 0, season_caps: 0, injury: "", pending_move: {}, last: {}, negotiated: {},
      season_closed: false, season_report: {}, retired: false, clause: 0 };
    for (const t of teams) g.autoLineup(t);
    this.forceIntoXi(teams[0]);
    g.addNews("A peneira", "Hoje tem jogo festivo com olheiros de vários clubes na arquibancada. Capriche: a sua nota decide as propostas.");
    g.save();
  }

  blankSeason() { return { g: 0, gol: 0, ass: 0, sum: 0, best: 0, mvp: 0, min: 0 }; }

  private scouts(nat: string): any[] {
    const g = this.g;
    const home: [number, number, number][] = [], abroad: [number, number, number][] = [];
    g.data.leagues.forEach((lg, li) => {
      if (!this.signsFrom(li)) return;
      lg.clubs.forEach((c, ci) => {
        if (lg.country === nat) home.push([li, ci, c.str]);
        else if (lg.prize >= 0.7) abroad.push([li, ci, c.str]);
      });
    });
    g.rng.shuffle(home); g.rng.shuffle(abroad);
    const n = this.cfg("peneira", "olheiros", 6);
    const chosen: [number, number, number][] = [];
    home.sort((a, b) => a[2] - b[2]);
    if (home.length) {
      const step = (home.length - 1) / Math.max(n - 3, 1);
      for (let k = 0; k < n - 2; k++) {
        const it = home[clamp(Math.round(k * step) + g.rng.randiRange(-1, 1), 0, home.length - 1)];
        if (!chosen.includes(it)) chosen.push(it);
      }
    }
    chosen.push(...abroad.slice(0, 2));
    return chosen.map((it) => this.clubInfo(it[0], it[1])).sort((a, b) => a.str - b.str);
  }
  clubInfo(li: number, ci: number) {
    const lg = this.g.data.leagues[li];
    const c = lg.clubs[ci];
    return { li, ci, name: c.name, short: c.short, c1: c.c1, c2: c.c2, str: c.str, league: lg.name, country: lg.country };
  }

  trialMatch(): UserMatch {
    const t = this.P().trial_teams;
    return { kind: "trial", h: t[0], a: t[1], comp: "Peneira", label: "Jogo festivo com olheiros", day: this.g.S.day };
  }

  finishTrial(sim: MatchSim | null): void {
    const g = this.g;
    const t = this.P().trial_teams;
    if (!sim) sim = new MatchSim(g, t[0], t[1]);
    while (!sim!.finished) sim!.step();
    const r = this.rate(sim!);
    this.storeLast(sim!, r, "Peneira", "Jogo festivo");
    const need0 = this.cfg("peneira", "nota_minima_base", 5.6), per = this.cfg("peneira", "nota_por_ponto_de_forca", 0.075), ref = this.cfg("peneira", "forca_referencia", 60);
    const offers: ProOffer[] = [];
    let weakest: any = null;
    for (const sc of this.P().scouts) {
      if (!weakest || sc.str < weakest.str) weakest = sc;
      if (r >= need0 + (sc.str - ref) * per) offers.push(this.makeOffer(sc.li, sc.ci, false));
    }
    if (!offers.length && weakest) {
      const o = this.makeOffer(weakest.li, weakest.ci, false);
      o.role = "base"; o.wage = snapped(o.wage * 0.6, 0.1); o.luvas = 0;
      offers.push(o);
    }
    const pr = this.P();
    pr.offers = offers;
    pr.stage = "propostas";
    pr.ratings.push(r);
    this.socialAfterMatch(r, sim!);
    g.addNews("Fim da peneira", `Você tirou nota ${r.toFixed(1)}. ${offers.length} clube(s) fizeram proposta.`);
    g.save();
  }

  private storeLast(sim: MatchSim, r: number, comp: string, label: string): void {
    const pid = this.P().me;
    let gl = 0, a = 0;
    for (const s of sim.scorers) { if (s.pid === pid) gl++; if (s.apid === pid) a++; }
    const lu = this.g.S.last_user ?? {};
    this.P().last = { comp, label, h: sim.h, a: sim.a, hg: sim.score[0], ag: sim.score[1], rating: r, gol: gl, ass: a, min: sim.mins[pid] ?? 0,
      lances: sim.me.lances, on: sim.me.on, off: sim.me.off, lost: sim.me.lost, offside: sim.me.offside, card: sim.cards[pid] ?? 0,
      red: sim.sentOff.includes(pid), day: lu.day ?? this.g.S.day, pens: lu.pens ?? [] };
  }

  setupSim(sim: MatchSim): void {
    sim.focusPid = this.P().me;
    sim.focusSide = sim.h === this.g.S.club ? 0 : 1;
    this.g.lastSim = sim;
    if (this.P().stage !== "carreira") return;
    const p = this.me();
    if (this.g.club(this.g.S.club).xi.includes(p.id) || (p.susp ?? 0) > 0 || this.P().banned > 0) return;
    const ch = this.cfg("tecnico", "entra_do_banco_chance", 0.55) * (0.6 + this.P().coach / 100);
    if (this.g.rng.randf() < ch) sim.focusSubMin = this.g.rng.randiRange(55, 80);
  }

  pickLineup(): void {
    const g = this.g;
    const cid = g.S.club;
    g.autoLineup(cid);
    const p = this.me();
    const c = g.club(cid);
    const xi = c.xi;
    const slots = FORMATIONS[c.formation];
    if ((p.susp ?? 0) > 0 || this.P().banned > 0 || p.club !== cid) {
      const k = xi.indexOf(p.id);
      if (k >= 0) {
        let best: Player | null = null, bv = -1;
        for (const q of g.bench(cid)) { if (q.id === p.id) continue; const v = g.eff(q, slots[k][0]); if (v > bv) { bv = v; best = q; } }
        if (best) xi[k] = best.id;
      }
      return;
    }
    if (xi.includes(p.id)) return;
    const bonus = (this.P().coach - 50) * this.cfg("tecnico", "bonus_escalacao_por_ponto", 0.08) + (this.form(3) - 6.5) * 2;
    let bestI = -1, gain = 0;
    for (let i = 0; i < xi.length; i++) {
      const sp = slots[i][0];
      if (sp === "GOL" || g.fit(p.pos, sp) < 0.93) continue;
      const d = g.eff(p, sp) + bonus - g.eff(g.player(xi[i]), sp);
      if (d > gain) { gain = d; bestI = i; }
    }
    if (bestI >= 0) xi[bestI] = p.id;
  }

  statusLine(): string {
    const p = this.me();
    const pr = this.P();
    if (pr.banned > 0) return `AFASTADO pela diretoria (${pr.banned} jogo(s))`;
    if (pr.injury && (p.susp ?? 0) > 0) return `LESIONADO: ${pr.injury} (${(p.susp ?? 1) - 1} jogo(s))`;
    if ((p.susp ?? 0) > 0) return "SUSPENSO";
    return this.g.club(this.g.S.club).xi.includes(p.id) ? "TITULAR" : "NO BANCO";
  }

  /** Nota na partida (−1 = não jogou). */
  rate(sim: MatchSim): number {
    const pid = this.P().me;
    const mins = sim.mins[pid] ?? 0;
    if (mins <= 0) return -1;
    const N = this.sec("nota");
    const n = (k: string, f: number) => Number(N[k] ?? f);
    const p = this.me();
    const teamOvr = this.g.ratings(this.g.S.club).ger;
    let r = n("base", 6) + (p.ovr - teamOvr) * n("por_ponto_ovr", 0.04) + this.g.rng.randfn(0, n("ruido", 0.45));
    for (const s of sim.scorers) { if (s.pid === pid) r += n("gol", 1.1); if (s.apid === pid) r += n("assistencia", 0.7); }
    r += sim.me.on * n("chute_no_gol", 0.15) + sim.me.lost * n("perdeu_bola", -0.25) + sim.me.offside * n("impedido", -0.15) + sim.me.off * n("chute_fora", -0.05);
    const sd = sim.focusSide;
    const mine = sim.score[sd], other = sim.score[1 - sd];
    if (mine > other) r += n("vitoria", 0.35); else if (mine < other) r += n("derrota", -0.35);
    if (["ZAG", "LD", "LE", "VOL"].includes(p.pos)) r += other === 0 ? n("sem_sofrer_gols_defensor", 0.4) : Math.max(other - 1, 0) * n("gol_sofrido_defensor", -0.15);
    if (sim.sentOff.includes(pid)) r += n("vermelho", -1.5); else if ((sim.cards[pid] ?? 0) > 0) r += n("amarelo", -0.3);
    if (mins < 30) r = lerp(6, r, mins / 30 * 0.7 + 0.3);
    return snapped(clamp(r, n("min", 3), n("max", 10)), 0.1);
  }

  afterMatch(): void {
    const g = this.g;
    const pr = this.P();
    if (pr.stage !== "carreira") return;
    const sim = g.lastSim;
    const lu = g.S.last_user;
    if (!sim || !lu) return;
    const r = this.rate(sim);
    this.storeLast(sim, r, lu.comp ?? "", lu.label ?? "");
    const p = this.me();
    const ss = pr.season;
    const F = this.sec("fama");
    if (r >= 0) {
      ss.g++; ss.sum += r; ss.best = Math.max(ss.best, r); ss.min += pr.last.min; ss.gol += pr.last.gol; ss.ass += pr.last.ass;
      if (r >= 8) ss.mvp++;
      pr.ratings.push(r);
      if (pr.ratings.length > 12) pr.ratings.shift();
      pr.coach = clamp(pr.coach + (r - 6.3) * this.cfg("tecnico", "por_ponto_de_nota", 4), 0, 100);
      let df = 0;
      if (r >= Number(F.nota_boa ?? 7.5)) df += Number(F.ganho_nota_boa ?? 1.5);
      else if (r <= Number(F.nota_ruim ?? 5.8)) df += Number(F.perda_nota_ruim ?? -1);
      df += pr.last.gol * Number(F.gol ?? 0.6);
      df *= 0.7 + g.myClub().str / 100;
      this.fame(df);
      pr.xp += Math.max(r - 6, 0) * this.cfg("treino", "xp_por_nota", 3);
      this.injuryRoll();
    } else pr.coach = clamp(pr.coach + 0.5, 0, 100);
    const sd = sim.focusSide;
    const res = Math.sign(sim.score[sd] - sim.score[1 - sd]);
    pr.fans = clamp(pr.fans + res * 2 + (Math.max(r, 6) - 6.5) * 2 * (r >= 0 ? 1 : 0), 0, 100);
    if (pr.banned > 0) pr.banned--;
    if ((p.susp ?? 0) <= 1) pr.injury = "";
    this.train();
    this.pay(7);
    this.sponsorRoll();
    this.socialAfterMatch(r, sim);
    pr.posted = false;
    pr.replied = false;
    const nrounds = g.S.fixtures.length;
    if (lu.kind === "league") {
      const rd = g.S.round;
      if (rd === Math.round(nrounds * this.cfg("janela", "rodada_meio", 0.5))) this.window("meio");
      for (const k of this.sec("selecao").rodadas ?? []) if (rd === Number(k)) this.nationalCall();
    }
    if (pr.last.gol >= 3) g.addNews("HAT-TRICK!", `${p.name} marcou ${pr.last.gol} gols e levou a bola para casa.`);
    this.pickLineup();
    g.save();
  }

  fame(d: number): void {
    const pr = this.P();
    pr.fame = clamp(pr.fame + d, 0, 100);
    const target = Math.floor(120 + Math.pow(pr.fame, 1.6) * this.cfg("fama", "seguidores_por_fama", 9000) / 10);
    pr.followers = Math.max(pr.followers, Math.floor(lerp(pr.followers, target, 0.35)));
  }

  setTraining(kind: string): void { this.P().train = kind; this.g.save(); }
  xpNeeded(): number { return this.cfg("treino", "xp_custo_base", 20) + (this.me().ovr - 50) * this.cfg("treino", "xp_custo_por_ovr", 1.2); }
  private train(): void {
    const pr = this.P();
    const p = this.me();
    const tk = this.sec("treino")[pr.train] ?? { xp: 7, lesao: 1, energia: 0 };
    let gain = Number(tk.xp ?? 7);
    if (p.age >= this.cfg("treino", "idade_crescimento_lento", 30)) gain *= 0.4;
    pr.xp += gain;
    p.energy = clamp(p.energy + Number(tk.energia ?? 0), 20, 100);
    while (pr.xp >= this.xpNeeded() && p.ovr < p.pot) {
      pr.xp -= this.xpNeeded();
      p.ovr++;
      const keep = p.wage;
      this.g.price(p);
      p.wage = keep;
      this.g.addNews("Evolução!", `${p.name} subiu para ${p.ovr} de força.`);
    }
    if (p.ovr >= p.pot) pr.xp = Math.min(pr.xp, this.xpNeeded());
  }
  private injuryRoll(): void {
    const p = this.me();
    const tk = this.sec("treino")[this.P().train] ?? {};
    const ch = this.cfg("lesao", "chance_por_jogo", 0.025) * Number(tk.lesao ?? 1) * (p.energy < 50 ? 1.5 : 1);
    if (this.g.rng.randf() >= ch) return;
    const n = this.g.rng.randiRange(this.cfg("lesao", "jogos_min", 1), this.cfg("lesao", "jogos_max", 6));
    const names = ["Estiramento na coxa", "Entorse no tornozelo", "Lesão muscular", "Pancada no joelho", "Desgaste físico"];
    this.P().injury = n <= names.length ? names[Math.min(n - 1, names.length - 1)] : this.pick(names);
    p.susp = Math.max(p.susp ?? 0, n + 1);
    this.g.addNews("Lesão", `${p.name} sofreu ${String(this.P().injury).toLowerCase()} e desfalca o time por ${n} jogo(s).`);
  }
  private pay(days: number): void {
    const pr = this.P();
    const weeks = days / 7;
    const sal = this.me().wage / 1000 * weeks;
    const com = Number(this.agent().comissao ?? 0);
    const spons = pr.sponsors.reduce((t: number, s: any) => t + Number(s.semanal) * weeks, 0);
    pr.money += (sal + spons) * (1 - com);
  }
  weeklyIncome() {
    const spons = this.P().sponsors.reduce((t: number, s: any) => t + Number(s.semanal), 0);
    const sal = this.me().wage / 1000;
    const com = Number(this.agent().comissao ?? 0);
    return { salario: sal, patrocinio: spons, comissao: (sal + spons) * com, liquido: (sal + spons) * (1 - com) };
  }
  private sponsorRoll(): void {
    const pr = this.P();
    const have = pr.sponsors.map((s: any) => s.marca);
    for (const sp of this.life().patrocinadores ?? []) {
      if (have.includes(sp.marca) || pr.fame < Number(sp.fama_minima)) continue;
      if (this.g.rng.randf() < 0.06 + 0.06 * this.agentLevel()) {
        pr.sponsors.push({ marca: sp.marca, semanal: Number(sp.semanal) });
        this.g.addNews("Novo patrocínio", `${this.me().name} fechou com ${sp.marca}: ${this.g.money(Number(sp.semanal))} por semana.`);
        this.postPortal(`${this.me().name} fecha patrocínio com ${sp.marca}`);
      }
      return;
    }
  }
  buy(id: string): string {
    const pr = this.P();
    const it = (this.life().compras ?? []).find((x: any) => x.id === id);
    if (!it) return "";
    if (pr.owned.includes(id)) return "Você já tem isso.";
    if (pr.money < Number(it.preco)) return "Dinheiro insuficiente.";
    pr.money -= Number(it.preco);
    pr.owned.push(id);
    this.fame(Number(it.fama));
    pr.fans = clamp(pr.fans + Number(it.torcida), 0, 100);
    this.postMine(`Realizei mais um sonho: ${String(it.nome).toLowerCase()}!`);
    this.g.save();
    return `Comprado: ${it.nome}`;
  }

  newPost(user: string, text: string, kind: string, likes: number): any {
    const pr = this.P();
    const post = { id: pr.next_post, user, text, kind, likes, reply: "", reply_kind: "", day: this.g.S.day };
    pr.next_post++;
    pr.feed.unshift(post);
    while (pr.feed.length > 40) pr.feed.pop();
    return post;
  }
  private user(): string {
    const u = String(this.pick(this.social().usuarios ?? ["torcedor"]));
    const cs = this.g.club(this.g.S.club).short.toLowerCase();
    return "@" + u.split("{c}").join(cs) + (this.g.rng.randf() < 0.4 ? String(this.g.rng.randiRange(1, 99)) : "");
  }
  likes(base: number): number { return Math.floor(base * (20 + this.P().followers * this.g.rng.randfRange(0.002, 0.02))); }
  private postPortal(text: string): void { this.newPost("@" + String(this.pick(this.social().portais ?? ["PortalDaBola"])), text, "manchete", this.likes(3)); }
  private postMine(text: string): void { this.newPost("@" + this.me().name.toLowerCase().replace(/\s+/g, ""), text, "meu", this.likes(2)); }

  private socialAfterMatch(r: number, sim: MatchSim): void {
    const S = this.social();
    const sd = sim.focusSide;
    const lost = sim.score[sd] < sim.score[1 - sd], won = sim.score[sd] > sim.score[1 - sd];
    if (r < 0) {
      const t0 = lost ? String(this.pick(S.zoeira_rival ?? ["..."])) : "Cadê o {n}? Nem entrou em campo...";
      this.newPost(this.user(), this.fmt(t0), lost ? "zoeira" : "neutro", this.likes(1));
      return;
    }
    const used: string[] = [];
    const n = this.g.rng.randiRange(2, 4);
    for (let k = 0; k < n; k++) {
      let kind = "neutro";
      if (r >= 7.3) kind = this.g.rng.randf() < 0.85 ? "elogio" : "xingamento";
      else if (r < 5.9) kind = this.g.rng.randf() < 0.8 ? "xingamento" : "neutro";
      else kind = this.pick(["elogio", "neutro", "xingamento"]);
      if (lost && kind === "neutro" && this.g.rng.randf() < 0.4) kind = "zoeira";
      const txt = String(this.pick(S[kind === "zoeira" ? "zoeira_rival" : kind] ?? ["..."]));
      if (used.includes(txt)) continue;
      used.push(txt);
      this.newPost(this.user(), this.fmt(txt), kind, this.likes(kind !== "xingamento" ? 1 : 1.6));
    }
    if (r >= 8 || (won && r >= 7.5)) this.postPortal(this.fmt(String(this.pick(S.manchete_boa ?? ["{n} brilha"]))));
  }

  canReply(post: any): boolean { return !post.reply && ["xingamento", "neutro", "zoeira", "elogio"].includes(post.kind); }
  reply(postId: number, style: string): string {
    const g = this.g;
    const pr = this.P();
    const post = pr.feed.find((x: any) => x.id === postId);
    if (!post || !this.canReply(post)) return "";
    const R = this.sec("redes").respostas?.[style] ?? {};
    post.reply = style === "ignorar" ? "Ignorado" : String(this.pick(this.social().respostas?.[style] ?? ["..."]));
    post.reply_kind = style;
    if (style === "ignorar") { g.save(); return "Você ignorou."; }
    const mult = post.kind === "elogio" && style !== "humilde" ? 1.6 : 1;
    let fameD = Number(R.fama ?? 0);
    if (fameD > 0 && pr.replied) fameD = 0;
    if (fameD > 0) pr.replied = true;
    this.fame(fameD * (fameD > 0 ? 1 : mult));
    pr.fans = clamp(pr.fans + Number(R.torcida ?? 0) * mult, 0, 100);
    pr.coach = clamp(pr.coach + Number(R.tecnico ?? 0), 0, 100);
    pr.followers += Math.floor(pr.followers * Number(R.seguidores ?? 0) + g.rng.randiRange(0, 30));
    post.likes += this.likes(1 + Number(R.seguidores ?? 0) * 40);
    const out: string[] = [];
    if (g.rng.randf() < Number(R.multa ?? 0) * mult) {
      const fine = this.me().wage / 1000 * this.cfg("redes", "multa_salarios_semanas", 2);
      pr.money -= fine;
      pr.polemics++;
      g.addNews("Multa do clube", `A diretoria multou ${this.me().name} em ${g.money(fine)} pela resposta nas redes.`);
      this.postPortal(this.fmt(String(this.pick(this.social().manchete_polemica ?? ["{n} causa polêmica"]))));
      out.push(`Multa de ${g.money(fine)}`);
      if (pr.polemics >= this.cfg("redes", "polemicas_para_afastamento", 3)) {
        pr.polemics = 0;
        pr.banned = this.cfg("redes", "jogos_afastado", 2);
        this.pickLineup();
        g.addNews("Afastado!", `Depois de mais uma polêmica, ${this.me().name} foi afastado por ${pr.banned} jogos.`);
        out.push(`AFASTADO por ${pr.banned} jogos`);
      }
    }
    if (pr.sponsors.length && g.rng.randf() < Number(R.patrocinio ?? 0) * mult) {
      const lostSp = pr.sponsors.splice(g.rng.randiRange(0, pr.sponsors.length - 1), 1)[0];
      g.addNews("Patrocínio cancelado", `${lostSp.marca} rompeu o contrato com ${this.me().name} após a confusão.`);
      out.push(`${lostSp.marca} cancelou o patrocínio`);
    }
    g.save();
    if (!out.length) return ({ humilde: "A torcida gostou da humildade.", provocar: "Viralizou! Mais seguidores.", xingar: "Viralizou... e pegou mal." } as Record<string, string>)[style] ?? "";
    return out.join(" • ");
  }

  ownPost(id: string): string {
    const pr = this.P();
    if (pr.posted) return "Você já postou desde o último jogo.";
    const it = (this.social().posts_proprios ?? []).find((x: any) => x.id === id);
    if (!it) return "";
    pr.posted = true;
    this.postMine(String(it.texto));
    this.fame(Number(it.fama));
    pr.fans = clamp(pr.fans + Number(it.torcida), 0, 100);
    pr.coach = clamp(pr.coach + Number(it.tecnico), 0, 100);
    pr.followers += Math.floor(pr.followers * Number(it.seguidores));
    let msg = "Postado!";
    if (id === "sair") {
      const n = this.window("pedido");
      msg = `Seu pedido repercutiu: ${n} proposta(s) chegaram.`;
      this.postPortal(`${this.me().name} pede para sair do ${this.g.clubName(this.g.S.club)}`);
    } else if (id === "indireta") this.postPortal(`Clima pesado? ${this.me().name} manda indireta para o técnico`);
    else if (id === "festa" && this.g.rng.randf() < 0.35) {
      pr.polemics++;
      this.postPortal(`${this.me().name} é flagrado em balada na véspera de jogo`);
      msg = "A foto vazou na imprensa...";
    }
    this.g.save();
    return msg;
  }

  hire(id: string): string {
    const a = (this.life().empresarios ?? []).find((x: any) => x.id === id);
    if (!a) return "";
    if (this.P().fame < Number(a.fama_minima)) return `${a.nome} só trabalha com quem tem fama ${Math.floor(a.fama_minima)}+.`;
    this.P().agent = id;
    this.g.addNews("Novo empresário", `${a.nome} agora cuida da carreira de ${this.me().name}.`);
    this.g.save();
    return `${a.nome} contratado!`;
  }
  fireAgent(): void { this.P().agent = ""; this.g.save(); }

  makeOffer(li: number, ci: number, renewal: boolean): ProOffer {
    const g = this.g;
    const info = this.clubInfo(li, ci);
    const p = this.me();
    const gap = p.ovr - (info.str - 6);
    let role = "titular";
    if (gap < -12) role = "base"; else if (gap < -6) role = "reserva"; else if (gap < 0) role = "rotacao";
    let wage = Math.pow(Math.max(p.ovr - 48, 2), 2) * 0.07 * (0.55 + info.str / 110);
    wage *= (1 + Number(this.agent().aumento_salario ?? 0)) * (1 + this.P().fame / 220);
    wage *= g.rng.randfRange(0.9, 1.15);
    let luvas = 0;
    if (this.P().fame > 8 || p.ovr >= 62) luvas = wage * 52 / 1000 * g.rng.randfRange(0.1, 0.45);
    return { ...info, role, wage: snapped(Math.max(wage, 1), 0.1), years: renewal ? g.rng.randiRange(2, 4) : g.rng.randiRange(2, 5),
      luvas: snapped(luvas, 0.01), clause: snapped(Math.max(p.value, 0.2) * g.rng.randfRange(2, 4), 0.1), renewal, id: g.rng.next() };
  }

  window(why: string): number {
    const g = this.g;
    const pr = this.P();
    const lvl = this.agentLevel();
    let n = this.cfg("janela", "propostas_sem_empresario", 1) + lvl * this.cfg("janela", "propostas_por_nivel_empresario", 1);
    if (why === "pedido") n++;
    const p = this.me();
    const myCountry = g.league().country;
    const lo = p.ovr - 10, hi = p.ovr + 4 + Math.floor(pr.fame / 12) + lvl * 2;
    const pool: [number, number][] = [];
    g.data.leagues.forEach((lg, li) => {
      const abroad = lg.country !== myCountry;
      if (!this.signsFrom(li)) return;
      if (abroad && lvl < 2 && !(lvl === 1 && lg.prize < 1)) return;
      if (abroad && lvl < 3 && lg.prize >= 1.6 && pr.fame < 30) return;
      lg.clubs.forEach((c, ci) => {
        if (c.str < lo || c.str > hi) return;
        if (li === g.S.league && ci === g.S.club) return;
        pool.push([li, ci]);
      });
    });
    g.rng.shuffle(pool);
    let made = 0;
    for (const it of pool.slice(0, n)) {
      if (pr.offers.length >= 6) break;
      const o = this.makeOffer(it[0], it[1], false);
      pr.offers.push(o);
      made++;
      g.addNews(`Proposta do ${o.name}`, `${o.name} (${o.league}) quer ${p.name}: ${this.roleName(o.role)}, salário ${Money.wageShort(o.wage)}/sem por ${o.years} anos.`);
    }
    if (made > 0) this.postPortal(`${p.name} na mira de ${made} clube(s)`);
    return made;
  }

  negotiate(idx: number): string {
    const g = this.g;
    const pr = this.P();
    const o = pr.offers[idx];
    if (!o) return "";
    const key = String(o.id);
    const tries = pr.negotiated[key] ?? 0;
    const ch = 0.4 + this.agentLevel() * 0.15 - tries * 0.25;
    pr.negotiated[key] = tries + 1;
    if (g.rng.randf() < ch) {
      o.wage = snapped(o.wage * g.rng.randfRange(1.1, 1.22), 0.1);
      o.luvas = snapped(o.luvas * 1.25 + 0.01, 0.01);
      g.save();
      return `O clube aceitou melhorar: ${Money.wageShort(o.wage)}/sem.`;
    }
    const mustChoose = ["propostas", "livre"].includes(pr.stage) && pr.offers.length <= 1;
    if (!mustChoose && g.rng.randf() < 0.45 + tries * 0.2) { pr.offers.splice(idx, 1); g.save(); return `O ${o.name} se irritou e retirou a proposta.`; }
    g.save();
    return `O ${o.name} manteve a proposta.`;
  }
  reject(idx: number): void { const pr = this.P(); if (idx >= 0 && idx < pr.offers.length) { pr.offers.splice(idx, 1); this.g.save(); } }

  accept(idx: number): string {
    const g = this.g;
    const pr = this.P();
    const o: ProOffer = pr.offers[idx];
    if (!o) return "";
    if (pr.pending_move && Object.keys(pr.pending_move).length) return `Você já acertou com o ${pr.pending_move.name ?? "outro clube"} para a próxima temporada.`;
    pr.offers = [];
    const com = Number(this.agent().comissao ?? 0);
    const payLuvas = () => { pr.money += o.luvas * (1 - com); };
    if (o.renewal) {
      payLuvas();
      const p = this.me();
      p.wage = o.wage; p.contract = o.years; pr.clause = o.clause;
      g.addNews("Renovado!", `${p.name} renovou com o ${o.name} até ${g.S.year + o.years}.`);
      g.save();
      return "Contrato renovado!";
    }
    if (["propostas", "livre"].includes(pr.stage)) { payLuvas(); this.moveTo(o, pr.stage === "livre"); return `Bem-vindo ao ${o.name}!`; }
    if (o.li === g.S.league && !g.S.season_over) { payLuvas(); this.transferSameLeague(o); return `Transferência fechada: você já é do ${o.name}.`; }
    pr.pending_move = o;
    g.addNews("Acerto fechado", `${this.me().name} vai para o ${o.name} no fim da temporada.`);
    g.save();
    return `Acerto fechado! Você se apresenta ao ${o.name} no fim da temporada.`;
  }

  private signTerms(p: Player, o: ProOffer): void {
    p.wage = o.wage; p.contract = o.years; p.joined = this.g.S.season; p.cmin = 0; p.cgol = 0; p.cass = 0; p.titles = [];
    this.P().clause = o.clause;
    this.P().coach = ({ titular: 60, rotacao: 50, reserva: 42, base: 35 } as Record<string, number>)[o.role] ?? 50;
  }
  private transferSameLeague(o: ProOffer): void {
    const g = this.g;
    const p = this.me();
    const old = g.S.club;
    p.club = o.ci;
    this.signTerms(p, o);
    g.logTransfer(p, old, o.ci, p.value);
    g.S.club = o.ci;
    g.autoLineup(old);
    this.pickLineup();
    g.addNews("Novo clube", `${p.name} foi apresentado no ${o.name}.`);
    this.postMine("Novo capítulo! Feliz demais de vestir essa camisa");
    this.postPortal(`${p.name} acerta com o ${o.name}`);
    g.save();
  }

  /** Muda de liga: monta o mundo da nova liga e leva o jogador junto. */
  moveTo(o: ProOffer, nextYear: boolean): void {
    const g = this.g;
    if (nextYear && this.P().pending_move?.id === o.id) this.P().money += o.luvas * (1 - Number(this.agent().comissao ?? 0));
    const pro = JSON.parse(JSON.stringify(this.P()));
    const mep: Player = JSON.parse(JSON.stringify(this.me()));
    if (nextYear) {
      mep.age++;
      if (mep.age > 31) mep.ovr = Math.max(mep.ovr - g.rng.randiRange(0, 2), 40);
      mep.g = 0; mep.min = 0; mep.gol = 0; mep.ass = 0;
      pro.season = this.blankSeason();
      pro.season_caps = 0;
    }
    const year = g.S.year + (nextYear ? 1 : 0);
    const season = g.S.season + (nextYear ? 1 : 0);
    g.newCareer(g.slot, this.stubCoach(), o.ci, o.li, year);
    const S = g.S;
    S.mode = "pro"; S.season = season; S.news = []; S.unread = 0;
    const same = g.squad(o.ci).filter((q) => q.pos === mep.pos).sort((a, b) => a.ovr - b.ovr);
    if (same.length > 1) same[0].club = FREE;
    mep.id = S.next_id; S.next_id++;
    mep.club = o.ci;
    mep.susp = pro.injury ? mep.susp ?? 0 : 0;
    S.players[mep.id] = mep;
    Object.assign(pro, { me: mep.id, stage: "carreira", offers: [], pending_move: {}, season_closed: false, trial_teams: [] });
    S.pro = pro;
    this.signTerms(mep, o);
    g.price(mep);
    mep.wage = o.wage;
    this.pickLineup();
    g.addNews(`Bem-vindo ao ${o.name}`, `${mep.name} assinou por ${o.years} anos (${this.roleName(o.role)}). Salário de ${Money.wageShort(o.wage)} por semana.`);
    this.postMine(`Contrato assinado com o ${o.name}! Obrigado, Deus e família`);
    this.postPortal(`${mep.name} é o novo reforço do ${o.name}`);
    g.save();
  }

  private nationalCall(): void {
    const pr = this.P();
    const p = this.me();
    const S = this.sec("selecao");
    const ok = p.ovr >= Number(S.ovr_garantido ?? 80) || (p.ovr >= Number(S.ovr_minimo ?? 74) && this.form(5) >= Number(S.nota_media_minima ?? 6.8));
    if (!ok || pr.injury) return;
    const w = ({ AC: 0.45, PD: 0.3, PE: 0.3, MEI: 0.22, VOL: 0.08, LD: 0.06, LE: 0.06, ZAG: 0.07 } as Record<string, number>)[p.pos] ?? 0.1;
    let gl = 0;
    for (let k = 0; k < 2; k++) if (this.g.rng.randf() < w) gl++;
    pr.caps += 2; pr.season_caps = (pr.season_caps ?? 0) + 2; pr.ngoals += gl;
    this.fame(this.cfg("fama", "convocacao", 3));
    this.g.addNews("Convocado!", `${p.name} foi chamado para a seleção do(a) ${p.nat}. Fez ${gl} gol(s) nos dois amistosos.`);
    this.postPortal(`${p.name} é convocado para a seleção`);
    this.postMine(p.nat === "Brasil" ? "Sonho realizado! Vestir a camisa do meu país" : "Orgulho de defender meu país!");
  }

  closeSeason(): any {
    const g = this.g;
    const pr = this.P();
    if (pr.season_closed && pr.season_report && Object.keys(pr.season_report).length) return pr.season_report;
    pr.season_closed = true;
    const p = this.me();
    const ss = pr.season;
    const avg = this.avgRating();
    const sm = g.seasonSummary();
    const awards: string[] = [];
    const titles: string[] = [];
    const year = g.S.year;
    if (sm.champion === g.S.club) titles.push(g.LEAGUE);
    for (const t of g.S.trophies) if (t.year === year && t.name !== g.LEAGUE && !titles.includes(t.name)) titles.push(t.name);
    for (const t of titles) { pr.titles.push({ name: t, year, club: g.clubName(g.S.club) }); this.fame(this.cfg("fama", "titulo", 6)); }
    if (sm.top && sm.top.id === p.id) awards.push(`Artilheiro do ${g.LEAGUE}`);
    if (ss.g >= 15 && avg >= 7.4) awards.push("Seleção do campeonato");
    if (p.age <= 21 && ss.g >= 12 && avg >= 6.9) awards.push("Revelação do ano");
    let bola = "";
    if (pr.fame >= 70 && avg >= 7.6 && ss.gol + ss.ass >= 25) { awards.push("Bola de Ouro"); bola = p.name; }
    else {
      let best: Player | null = null;
      for (const q of Object.values(g.S.players)) {
        if (q.me || q.club < 0) continue;
        if (!best || q.ovr * 2 + q.gol > best.ovr * 2 + best.gol) best = q;
      }
      if (best) bola = `${best.name} (${g.clubName(best.club)})`;
    }
    let wc = "";
    if (year % 4 === 2 && (pr.season_caps ?? 0) > 0) {
      const big = BIG_NATIONS.includes(p.nat);
      const stage = ["fase de grupos", "oitavas", "quartas", "semifinal", "final"];
      let reached = 0;
      while (reached < 4 && g.rng.randf() < (big ? 0.55 : 0.35) + 0.08 * reached) reached++;
      if (reached === 4 && g.rng.randf() < (big ? 0.14 : 0.04) / 0.14 * 0.5) {
        wc = "CAMPEÃO DA COPA DO MUNDO!";
        titles.push("Copa do Mundo");
        pr.titles.push({ name: "Copa do Mundo", year, club: `Seleção do(a) ${p.nat}` });
        this.fame(15);
      } else wc = `Copa do Mundo: eliminado na ${stage[reached]}`;
    }
    for (const a of awards) { pr.awards.push({ name: a, year }); this.fame(this.cfg("fama", "premio", 8) * (a === "Bola de Ouro" ? 2 : 0.5)); }
    pr.fame *= 1 - this.cfg("fama", "queda_anual", 0.12);
    pr.history.push({ year, club: g.clubName(g.S.club), league: g.LEAGUE, g: ss.g, gol: ss.gol, ass: ss.ass, avg: snapped(avg, 0.01), ovr: p.ovr });
    p.contract--;
    let contractMsg = "";
    if (!pr.pending_move || !Object.keys(pr.pending_move).length) {
      if (p.contract <= 0) {
        contractMsg = "Seu contrato acabou. Você está livre no mercado.";
        pr.stage = "livre";
        pr.offers = [];
        this.window("pedido");
        if (!pr.offers.length) pr.offers.push(this.makeOffer(g.S.league, Math.min(g.S.club, g.nLeague() - 1), false));
      } else if (p.contract === 1 && pr.coach >= 35) {
        pr.offers.push(this.makeOffer(g.S.league, g.S.club, true));
        contractMsg = "O clube ofereceu renovação (veja Empresário > Propostas).";
      }
    } else contractMsg = `Você se apresenta ao ${pr.pending_move.name} na próxima temporada.`;
    this.window("fim");
    const rep = { year, g: ss.g, gol: ss.gol, ass: ss.ass, avg, mvp: ss.mvp, awards, titles, bola, wc, contract: contractMsg, pos: sm.pos, champion: g.clubName(sm.champion) };
    pr.season_report = rep;
    g.save();
    return rep;
  }

  nextSeason(): void {
    const g = this.g;
    const pr = this.P();
    const mv = pr.pending_move;
    pr.season = this.blankSeason();
    pr.season_caps = 0;
    pr.season_closed = false;
    if (mv && Object.keys(mv).length) this.moveTo(mv, true);
    else { g.newSeason(); pr.coach = clamp(pr.coach, 30, 100); this.pickLineup(); }
    this.P().offers = this.P().offers.filter((o: ProOffer) => !o.renewal || this.me().contract <= 1);
    g.save();
  }

  canRetire(): boolean { return this.me().age >= 33; }
  retire(): void {
    this.P().retired = true;
    this.P().stage = "aposentado";
    this.g.addNews("Fim de carreira", `${this.me().name} pendurou as chuteiras.`);
    this.g.save();
  }

  private forceIntoXi(cid: number): void {
    const c = this.g.club(cid);
    const p = this.me();
    if (c.xi.includes(p.id)) return;
    const slots = FORMATIONS[c.formation];
    let best = 0, bf = -1;
    slots.forEach((s, i) => { const f = this.g.fit(p.pos, s[0]); if (s[0] !== "GOL" && f > bf) { bf = f; best = i; } });
    c.xi[best] = p.id;
  }
}
