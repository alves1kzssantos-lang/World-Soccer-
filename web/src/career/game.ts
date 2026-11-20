import type { GameData, LeagueDef, Pos, RosterEntry } from "../data/types";
import { Rng, snapped, clamp } from "../data/rng";
import { norm } from "../data/db";
import type { Club, Player, State, Fixture, Round, Coach } from "./state";
import * as Money from "./money";
import { Finance } from "./finance";
import { Fitness } from "./fitness";
import { Contracts } from "./contracts";
import { Loans } from "./loans";
import { Cups } from "./cups";
import { Media } from "./media";
import { Pro } from "./pro";
import { Store } from "./store";
import { MatchSim } from "./match_sim";
import type { SaveStore } from "./storage";

export const FREE = -1;
export const YOUTH = -2;

/** posição, x (0..1 na largura), y (0 = seu gol, 1 = gol adversário) */
export const FORMATIONS: Record<string, [Pos, number, number][]> = {
  "4-3-3": [["GOL", 0.5, 0.07], ["LE", 0.12, 0.30], ["ZAG", 0.37, 0.25], ["ZAG", 0.63, 0.25], ["LD", 0.88, 0.30],
    ["VOL", 0.5, 0.47], ["MEI", 0.26, 0.58], ["MEI", 0.74, 0.58], ["PE", 0.15, 0.83], ["AC", 0.5, 0.88], ["PD", 0.85, 0.83]],
  "4-4-2": [["GOL", 0.5, 0.07], ["LE", 0.12, 0.30], ["ZAG", 0.37, 0.25], ["ZAG", 0.63, 0.25], ["LD", 0.88, 0.30],
    ["PE", 0.13, 0.60], ["VOL", 0.38, 0.52], ["MEI", 0.62, 0.52], ["PD", 0.87, 0.60], ["AC", 0.36, 0.86], ["AC", 0.64, 0.86]],
  "4-2-3-1": [["GOL", 0.5, 0.07], ["LE", 0.12, 0.30], ["ZAG", 0.37, 0.25], ["ZAG", 0.63, 0.25], ["LD", 0.88, 0.30],
    ["VOL", 0.36, 0.46], ["VOL", 0.64, 0.46], ["PE", 0.15, 0.70], ["MEI", 0.5, 0.68], ["PD", 0.85, 0.70], ["AC", 0.5, 0.89]],
  "3-5-2": [["GOL", 0.5, 0.07], ["ZAG", 0.25, 0.25], ["ZAG", 0.5, 0.23], ["ZAG", 0.75, 0.25],
    ["LE", 0.10, 0.55], ["VOL", 0.5, 0.45], ["MEI", 0.32, 0.62], ["MEI", 0.68, 0.62], ["LD", 0.90, 0.55], ["AC", 0.36, 0.86], ["AC", 0.64, 0.86]],
};
export const FORMATION_NAMES = ["4-3-3", "4-4-2", "4-2-3-1", "3-5-2"];
export const POS_ORDER: Pos[] = ["GOL", "ZAG", "LD", "LE", "VOL", "MEI", "PD", "PE", "AC"];
export const SQUAD_TEMPLATE: Pos[] = ["GOL", "ZAG", "ZAG", "LD", "LE", "VOL", "MEI", "MEI", "PD", "PE", "AC",
  "GOL", "ZAG", "ZAG", "LD", "LE", "VOL", "VOL", "MEI", "MEI", "PD", "PE", "AC", "AC"];
export const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const SAVE_VERSION = 3;

const ATTR_OFF: Record<Pos, number[]> = {
  GOL: [-15, -10, -30, -5], ZAG: [-4, -8, -20, 6], LD: [3, 0, -12, 3], LE: [3, 0, -12, 3],
  VOL: [-1, 3, -8, 5], MEI: [0, 6, 0, -10], PD: [5, 1, 3, -25], PE: [5, 1, 3, -25], AC: [3, -3, 6, -30],
};
const NEAR: Record<string, string[]> = {
  ZAG: ["VOL", "LD", "LE"], LD: ["LE", "ZAG", "PD"], LE: ["LD", "ZAG", "PE"], VOL: ["MEI", "ZAG"],
  MEI: ["VOL", "PD", "PE"], PD: ["PE", "MEI", "AC"], PE: ["PD", "MEI", "AC"], AC: ["PD", "PE"],
};

export interface UserMatch {
  kind: "league" | "cup" | "trial"; h: number; a: number; comp: string; label: string; day: number;
  cup?: number; round?: number; leg?: number; agg?: number[];
}

/**
 * Estado e regras da carreira (porte de game.gd). As telas leem `g.S` e chamam os métodos.
 * Sem DOM: o save vai para um SaveStore (localStorage no app, memória nos testes).
 */
export class Game {
  S: State = {} as State;
  LEAGUE = "";
  slot = -1;
  rng = new Rng();
  lastSim: MatchSim | null = null;
  curSim: MatchSim | null = null;
  readonly finance: Finance;
  readonly fitness: Fitness;
  readonly contracts: Contracts;
  readonly loans: Loans;
  readonly cups: Cups;
  readonly media: Media;
  readonly pro: Pro;
  readonly store: Store;
  /** Grava automaticamente depois das ações (desligue nos testes de desempenho). */
  autosave = true;

  constructor(readonly data: GameData, readonly saves: SaveStore | null = null, seed?: number) {
    if (seed !== undefined) this.rng.setSeed(seed);
    this.finance = new Finance(this);
    this.fitness = new Fitness(this);
    this.contracts = new Contracts(this);
    this.loans = new Loans(this);
    this.cups = new Cups(this);
    this.media = new Media(this);
    this.pro = new Pro(this);
    this.store = new Store(this);
  }

  // ------------------------------------------------------------ ajuste (match_tuning.json)
  tf(section: string, key: string, fallback: number): number {
    const s = this.data.tuning[section] as Record<string, unknown> | undefined;
    const v = s ? s[key] : undefined;
    return typeof v === "number" ? v : fallback;
  }

  // ------------------------------------------------------------ datas (dia = dias desde 1970)
  dayOf(y: number, m: number, d: number): number { return Math.floor(Date.UTC(y, m - 1, d, 12) / 86400000); }
  dateOf(day: number): { year: number; month: number; day: number; weekday: number } {
    const dt = new Date(day * 86400000 + 43200000);
    return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate(), weekday: dt.getUTCDay() };
  }
  fmtDate(day: number): string { const d = this.dateOf(day); return `${String(d.day).padStart(2, "0")}/${String(d.month).padStart(2, "0")}/${d.year}`; }
  fmtShort(day: number): string { const d = this.dateOf(day); return `${String(d.day).padStart(2, "0")}/${String(d.month).padStart(2, "0")}`; }
  monthYear(day: number): string { const d = this.dateOf(day); return `${MONTHS[d.month - 1]} ${d.year}`; }

  // ------------------------------------------------------------ save
  save(): void {
    if (!this.autosave || this.slot < 0 || !this.S.clubs || !this.saves) return;
    this.saves.write(this.slot, JSON.stringify(this.S));
  }
  hasSave(i: number): boolean { return !!this.saves && this.saves.read(i) !== null; }
  peekSave(i: number): Record<string, unknown> | null {
    const raw = this.saves?.read(i);
    if (!raw) return null;
    try {
      const d = JSON.parse(raw) as State;
      const c = d.clubs[d.club];
      const info: Record<string, unknown> = { club: d.club, name: c.name, short: c.short, c1: c.c1, c2: c.c2, season: d.season, year: d.year,
        league: this.data.leagues[d.league ?? 0].name, li: d.league ?? 0, mode: d.mode ?? "tecnico" };
      if (d.mode === "pro" && d.pro) {
        const me = d.players[d.pro.me];
        info.player = me?.name ?? "Jogador"; info.pos = me?.pos ?? ""; info.ovr = me?.ovr ?? 0; info.stage = d.pro.stage ?? "";
      }
      return info;
    } catch { return null; }
  }
  /** Carrega um save (texto JSON). Completa chaves que versões antigas não tinham. */
  loadFromText(raw: string, slot = -1): boolean {
    let d: State;
    try { d = JSON.parse(raw); } catch { return false; }
    if (!d || !Array.isArray(d.clubs)) return false;
    this.S = d;
    this.slot = slot;
    const S = this.S;
    S.league ??= 0;
    S.loan_offers ??= [];
    S.training ??= "normal";
    S.cups ??= [];
    S.n_league ??= this.data.leagues[S.league].clubs.length;
    for (const p of Object.values(S.players)) { p.titles ??= []; }
    if (!S.econ) { this.finance.ensure(); this.finance.setSeasonBudget(); }
    this.finance.ensure();
    this.store.ensure();
    if (S.rng_seed !== undefined) this.rng.setSeed(S.rng_seed + S.day);
    this.LEAGUE = this.league().name;
    return true;
  }
  loadCareer(i: number): boolean {
    const raw = this.saves?.read(i);
    return raw ? this.loadFromText(raw, i) : false;
  }
  deleteSave(i: number): void { this.saves?.remove(i); }
  /** Texto do save atual (o mesmo que vai para o armazenamento). */
  serialize(): string { return JSON.stringify(this.S); }

  // ------------------------------------------------------------ nova carreira
  newCareer(slot: number, coach: Coach, clubId: number, leagueIdx = 0, year = 2026): void {
    this.slot = slot;
    const lg = this.data.leagues[leagueIdx];
    this.LEAGUE = lg.name;
    const seed = this.rng.next();
    this.S = {
      ver: SAVE_VERSION, mode: "tecnico", league: leagueIdx, coach, club: clubId, season: 1, year,
      day: this.dayOf(year, 1, 7), money: 0, support: 60,
      clubs: [], players: {}, next_id: 1, fixtures: [], round: 0, last_round: -1,
      season_over: false, news: [], unread: 0, offers: [], loan_offers: [], transfers: [],
      trophies: [], history: [], training: "normal",
      fin: { salarios: 0, patrocinio: 0, bilheteria: 0, compras: 0, vendas: 0, premios: 0 },
      n_league: lg.clubs.length, cups: [], econ: undefined as unknown as State["econ"], rng_seed: seed,
    };
    const usedReal = new Set<string>();
    lg.clubs.forEach((info, c) => {
      this.S.clubs.push({ id: c, name: info.name, short: info.short, c1: info.c1, c2: info.c2, str: info.str,
        li: leagueIdx, ci: c, guest: false, formation: "4-3-3", xi: [], titles: 0, logo: info.logo,
        pts: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0 });
      const have = this.addRealPlayers(this.realRoster(info.name, lg.name), c, usedReal, true);
      this.fillSquad(c, info.str, have, true);
    });
    for (let k = 0; k < 26; k++) {
      let age = this.rng.randiRange(29, 37);
      if (k % 4 === 0) age = this.rng.randiRange(19, 23);
      this.makePlayer(POS_ORDER[this.rng.randiRange(0, 8)], age > 25 ? this.rng.randiRange(64, 82) : this.rng.randiRange(58, 68), FREE, age);
    }
    for (const p of Object.values(this.S.players)) if (p.club >= 0 && p.contract < 2) p.contract = 2;
    this.S.money = snapped(this.finance.wexpK(lg.clubs[clubId].str) / 1000 * 26 * this.finance.cfg("caixa_inicial_semestres", 0.5) * 2, 0.1);
    this.finance.ensure();
    for (const c of this.S.clubs) this.finance.aiCashInit(c);
    this.finance.setSeasonBudget();
    this.store.ensure();
    this.youthIntake(6);
    this.makeFixtures();
    for (let c = 0; c < lg.clubs.length; c++) this.autoLineup(c);
    this.cups.buildSeason([]);
    for (let k = 0; k < 8; k++) this.aiTransfer();
    this.addNews(`Bem-vindo ao ${this.myClub().name}`, "A diretoria apresentou você como novo técnico. O elenco está chegando ao centro de treinamento.");
    this.S.unread = 1;
    this.save();
  }

  nLeague(): number { return this.S.n_league ?? this.S.clubs.length; }

  /** Clube de outra liga que entra numa copa (criado na primeira vez, com elenco). */
  guestClub(li: number, ci: number): number {
    const key = `${li}:${ci}`;
    this.S.guests ??= {};
    if (key in this.S.guests) return this.S.guests[key];
    const lg = this.data.leagues[li];
    const info = lg.clubs[ci];
    const cid = this.S.clubs.length;
    this.S.clubs.push({ id: cid, name: info.name, short: info.short, c1: info.c1, c2: info.c2, str: info.str, li, ci, guest: true,
      formation: "4-3-3", xi: [], titles: 0, logo: info.logo, pts: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0 });
    const used = new Set<string>();
    for (const op of Object.values(this.S.players)) if (op.real) used.add(`${norm(op.name)}|${op.real_age ?? op.age}`);
    const have = this.addRealPlayers(this.realRoster(info.name, lg.name), cid, used, false);
    this.fillSquad(cid, info.str, have, false);
    this.autoLineup(cid);
    this.S.guests[key] = cid;
    return cid;
  }

  /** Id da logo do clube no pacote de imagens (-1 se não houver). */
  clubLogo(cid: number): number {
    const c = this.S.clubs[cid];
    if (!c || c.ci < 0) return -1;
    return c.logo ?? this.data.leagues[c.li]?.clubs[c.ci]?.logo ?? -1;
  }

  // ------------------------------------------------------------ calendário e eventos
  nextEvent(): { kind: "league" | "cup"; round: number; day: number; cup?: number; leg?: number; stage?: number } | null {
    let leagueDay = 1 << 30;
    if (this.S.round < this.S.fixtures.length) leagueDay = this.S.fixtures[this.S.round].day;
    const cup = this.cups.nextDue();
    if (cup && cup.day < leagueDay) return { kind: "cup", cup: cup.cup, round: cup.round, leg: cup.leg, stage: cup.stage, day: cup.day };
    if (leagueDay === 1 << 30) return null;
    return { kind: "league", round: this.S.round, day: leagueDay };
  }

  /** Joga sozinho as fases de copa em que o clube do jogador não está. */
  advanceToUser(): void {
    for (let guard = 0; guard < 50; guard++) {
      const ev = this.nextEvent();
      if (!ev || ev.kind !== "cup") return;
      if (this.cups.myTie(ev.cup!)) return;
      this.cups.playRound(ev.cup!, null);
    }
    this.save();
  }

  nextUserMatch(): UserMatch | null {
    if (this.pro.isPro() && this.pro.P().stage === "peneira") return this.pro.trialMatch();
    if (this.S.season_over) return null;
    this.advanceToUser();
    const ev = this.nextEvent();
    if (!ev) return null;
    if (ev.kind === "cup") {
      const t = this.cups.myTie(ev.cup!)!;
      const c = this.S.cups[ev.cup!];
      const leg = ev.leg!;
      const ag = this.cups.aggregate(t, leg - 1);
      const flip = leg === 2;
      return { kind: "cup", h: flip ? t.a : t.h, a: flip ? t.h : t.a, comp: c.name, label: this.cups.stageLabel(c, ev.stage!),
        day: ev.day, cup: ev.cup, round: ev.round, leg, agg: flip ? [ag[1], ag[0]] : ag };
    }
    const mm = this.myMatch(this.S.round)!;
    return { kind: "league", h: mm.h, a: mm.a, comp: this.LEAGUE, label: `Rodada ${this.S.round + 1}`, day: ev.day };
  }

  /** Cria o MatchSim da próxima partida do jogador (para a tela de jogo). */
  newUserSim(): MatchSim | null {
    const m = this.nextUserMatch();
    if (!m) return null;
    const sim = new MatchSim(this, m.h, m.a);
    sim.interactive = true;
    return sim;
  }

  /** Joga o próximo evento do jogador (liga ou copa). userSim = partida jogada na tela ou null. */
  playNext(userSim: MatchSim | null): void {
    if (this.pro.isPro() && this.pro.P().stage === "peneira") { this.pro.finishTrial(userSim); return; }
    this.lastSim = userSim;
    this.advanceToUser();
    const ev = this.nextEvent();
    if (!ev) return;
    if (ev.kind === "league") {
      this.playRound(userSim);
      if (this.pro.isPro()) this.pro.afterMatch();
      this.media.afterMatch();
      return;
    }
    const t = this.cups.myTie(ev.cup!)!;
    const c = this.S.cups[ev.cup!];
    this.cups.playRound(ev.cup!, userSim);
    const leg = ev.leg!;
    const flip = leg === 2;
    const L = this.cups.tieLegs(t);
    const g = L.length >= leg ? L[leg - 1] : [t.hg, t.ag];
    const pens = t.pens;
    this.S.last_user = { kind: "cup", cup: ev.cup, round: ev.round, leg, comp: c.name, label: this.cups.stageLabel(c, ev.stage!), day: ev.day,
      h: flip ? t.a : t.h, a: flip ? t.h : t.a, hg: flip ? g[1] : g[0], ag: flip ? g[0] : g[1], agg: [t.hg, t.ag],
      pens: flip && pens.length ? [pens[1], pens[0]] : pens.slice(), tie_h: t.h, tie_a: t.a, sc: t.sc, st: t.st };
    this.S.day = ev.day + 1;
    for (const p of Object.values(this.S.players)) p.energy = Math.min(p.energy + 8, 100);
    if (this.pro.isPro()) this.pro.afterMatch();
    this.media.afterMatch();
    this.save();
  }

  league(): LeagueDef { return this.data.leagues[this.S.league ?? 0]; }
  myClub(): Club { return this.S.clubs[this.S.club]; }
  club(cid: number): Club { return this.S.clubs[cid]; }
  clubName(cid: number): string { return cid === FREE ? "Sem clube" : cid === YOUTH ? "Base" : this.S.clubs[cid]?.name ?? "?"; }

  // ------------------------------------------------------------ jogadores
  addRealPlayers(ros: RosterEntry[], cid: number, used: Set<string>, history: boolean): Record<string, number> {
    const have: Record<string, number> = {};
    for (const r of ros) {
      if (this.squad(cid).length >= 30) break;
      const pos = String(r[1]) as Pos;
      const key = `${norm(String(r[0]))}|${Number(r[2])}`;
      if (!POS_ORDER.includes(pos) || key === `|${Number(r[2])}` || used.has(key)) continue;
      used.add(key);
      const rp = this.makePlayer(pos, Number(r[3]), cid, Number(r[2]));
      rp.name = String(r[0]);
      rp.real = true;
      rp.real_age = Number(r[2]);
      rp.nat = r[4] ? String(r[4]) : this.data.leagues[this.S.clubs[cid]?.li ?? this.S.league].nat;
      rp.pot = Math.max(rp.pot, rp.ovr);
      if (history) this.seedHistory(rp);
      have[pos] = (have[pos] ?? 0) + 1;
    }
    return have;
  }

  fillSquad(cid: number, strength: number, have: Record<string, number>, history: boolean): void {
    const need: Record<string, number> = {};
    const anyReal = Object.keys(have).length > 0;
    SQUAD_TEMPLATE.forEach((tp, k) => {
      need[tp] = (need[tp] ?? 0) + 1;
      if ((have[tp] ?? 0) >= need[tp]) return;
      let base = strength + this.rng.randfn(0.5, 3.0);
      if (k >= 11) base -= 5;
      else if (anyReal) base -= 2;
      const p = this.makePlayer(tp, Math.round(base), cid);
      if (history) this.seedHistory(p);
    });
  }

  /** Elenco real do clube ([nome, posição, idade, nota, país]); chave "Liga|Clube" tem prioridade. */
  realRoster(cname: string, leagueName = ""): RosterEntry[] {
    const R = this.data.rosters;
    let key = cname;
    if (leagueName && R[`${leagueName}|${cname}`]) key = `${leagueName}|${cname}`;
    const out: RosterEntry[] = [];
    for (const r of R[key] ?? []) {
      if (Array.isArray(r) && r.length >= 4) out.push([String(r[0]), String(r[1]), Number(r[2]), Number(r[3]), r.length > 4 ? String(r[4] ?? "") : ""]);
    }
    return out;
  }

  private randomName(): [string, string] {
    const lg = this.league();
    let pool = lg.pool;
    let nat = lg.nat;
    if (this.rng.randf() < 0.25) {
      const f = this.rng.pick(this.data.names.foreign);
      pool = f[0]; nat = f[1];
    }
    const nm = this.data.names.names[pool] ?? this.data.names.names["BR"];
    return [`${this.rng.pick(nm[0])} ${this.rng.pick(nm[1])}`, nat];
  }

  /** Atributos dos lances (saem da nota geral + posição). */
  attrs(p: Player): { vel: number; pas: number; chu: number; des: number } {
    const o = p.ovr, id = p.id, d = ATTR_OFF[p.pos];
    return {
      vel: clamp(o + d[0] + (id * 7) % 9 - 4, 20, 99), pas: clamp(o + d[1] + (id * 13) % 9 - 4, 20, 99),
      chu: clamp(o + d[2] + (id * 17) % 9 - 4, 20, 99), des: clamp(o + d[3] + (id * 23) % 9 - 4, 20, 99),
    };
  }

  makePlayer(pos: Pos, ovr: number, cid: number, age = -1): Player {
    if (age < 0) age = clamp(Math.round(this.rng.randfn(26.5, 4.2)), 18, 36);
    ovr = clamp(ovr, 40, 94);
    let pot = ovr;
    if (age < 27) pot = clamp(ovr + Math.round((27 - age) * this.rng.randfRange(0.5, 1.6)), ovr, 95);
    const nm = this.randomName();
    const p: Player = {
      id: this.S.next_id, name: nm[0], nat: nm[1], pos, age, ovr, pot,
      club: cid, energy: 100, wage: 0, value: 0, ask: this.rng.randfRange(1.1, 1.45),
      contract: this.rng.randiRange(2, 4), joined: this.S.season, listed: false,
      g: 0, min: 0, gol: 0, ass: 0, cmin: 0, cgol: 0, cass: 0, titles: [],
    };
    this.S.next_id++;
    this.price(p);
    this.S.players[p.id] = p;
    return p;
  }

  price(p: Player): void {
    const o = Math.max(p.ovr - 50, 1) / 10;
    let af = 1.3;
    if (p.age >= 35) af = 0.2;
    else if (p.age >= 32) af = 0.45;
    else if (p.age >= 29) af = 0.8;
    else if (p.age >= 24) af = 1.1;
    if (p.pot - p.ovr >= 8) af *= 1.25;
    p.value = snapped(Math.max(Math.pow(o, 3.2) * 0.35 * af, 0.05), 0.01);
    p.wage = this.marketWage(p);
  }
  /** Salário de mercado (mil por semana). */
  marketWage(p: Player): number { return snapped(Math.max(Math.pow(Math.max(p.ovr - 55, 1), 2) * 0.07, 1.5), 0.1); }

  seedHistory(p: Player): void {
    const yrs = Math.min(this.rng.randiRange(0, 5), p.age - 18);
    if (yrs <= 0) return;
    p.joined = this.S.season - yrs;
    p.cmin = yrs * this.rng.randiRange(900, 2800);
    const gf: Record<string, number> = { AC: 0.5, PD: 0.28, PE: 0.28, MEI: 0.16, VOL: 0.06, LD: 0.04, LE: 0.04, ZAG: 0.04, GOL: 0 };
    const af: Record<string, number> = { AC: 0.18, PD: 0.25, PE: 0.25, MEI: 0.28, VOL: 0.1, LD: 0.14, LE: 0.14, ZAG: 0.03, GOL: 0 };
    const games = p.cmin / 90;
    p.cgol = Math.floor(games * gf[p.pos] * this.rng.randfRange(0.6, 1.2));
    p.cass = Math.floor(games * af[p.pos] * this.rng.randfRange(0.6, 1.2));
  }

  player(pid: number): Player { return this.S.players[pid]; }

  squad(cid: number): Player[] {
    const out = Object.values(this.S.players).filter((p) => p.club === cid);
    out.sort((a, b) => {
      const ia = POS_ORDER.indexOf(a.pos), ib = POS_ORDER.indexOf(b.pos);
      if (ia !== ib) return ia - ib;
      if (a.ovr !== b.ovr) return b.ovr - a.ovr;
      return a.id - b.id;
    });
    return out;
  }

  fit(ppos: string, spos: string): number {
    if (ppos === spos) return 1;
    if (ppos === "GOL" || spos === "GOL") return 0.45;
    return NEAR[ppos]?.includes(spos) ? 0.93 : 0.82;
  }

  eff(p: Player, spos: string): number {
    let e = p.energy;
    const sim = this.curSim;
    if (sim && !sim.finished) e = this.fitness.live(p, sim.mins[p.id] ?? 0, spos);
    return p.ovr * this.fit(p.pos, spos) * (0.85 + 0.15 * e / 100);
  }

  /** Multiplicador de rendimento pela energia (1.0 descansado .. ~0.84 exausto), para a partida ao vivo. */
  staminaFactor(pid: number): number {
    const p = this.S.players?.[pid];
    if (!p) return 1;
    let e = p.energy;
    const sim = this.curSim ?? this.lastSim;
    if (sim && !sim.finished) e = this.fitness.live(p, sim.mins[pid] ?? 0);
    return this.fitness.factor(e);
  }

  autoLineup(cid: number): void {
    const c = this.S.clubs[cid];
    const slots = FORMATIONS[c.formation];
    const avail = this.squad(cid).filter((p) => (p.susp ?? 0) === 0);
    const xi: number[] = [];
    for (const s of slots) {
      let best: Player | null = null;
      let bv = -1;
      for (const p of avail) {
        if (xi.includes(p.id)) continue;
        let v = this.eff(p, s[0]);
        if (p.energy < 60) v *= 0.93;
        if (v > bv) { bv = v; best = p; }
      }
      if (best) xi.push(best.id);
    }
    c.xi = xi;
  }

  validateXi(cid: number): void {
    const c = this.S.clubs[cid];
    const xi = c.xi;
    if (xi.length !== 11) { this.autoLineup(cid); return; }
    const slots = FORMATIONS[c.formation];
    const seen: number[] = [];
    for (let i = 0; i < 11; i++) {
      const pid = xi[i];
      const pl = this.S.players[pid];
      const ok = !!pl && pl.club === cid && !seen.includes(pid) && (pl.susp ?? 0) === 0;
      if (!ok) {
        let best: Player | null = null;
        let bv = -1;
        for (const p of this.squad(cid)) {
          if (xi.includes(p.id) || seen.includes(p.id) || (p.susp ?? 0) > 0) continue;
          const v = this.eff(p, slots[i][0]);
          if (v > bv) { bv = v; best = p; }
        }
        if (!best) { this.autoLineup(cid); return; }
        xi[i] = best.id;
      }
      seen.push(xi[i]);
    }
  }

  // ------------------------------------------------------------ banco
  benchMax(): number { return Number(this.contracts.cfg("banco", "reservas_max", 9)); }
  private benchAvail(cid: number): Player[] {
    const xi = this.S.clubs[cid].xi;
    return this.squad(cid).filter((p) => !xi.includes(p.id) && (p.susp ?? 0) === 0);
  }
  bench(cid: number): Player[] {
    const c = this.S.clubs[cid];
    const avail = this.benchAvail(cid);
    const mx = this.benchMax();
    const out: Player[] = [];
    if (c.bench_manual && c.bench) {
      for (const pid of c.bench) for (const p of avail) if (p.id === pid && out.length < mx) out.push(p);
      return out;
    }
    const byOvr = avail.slice().sort((a, b) => (a.ovr !== b.ovr ? b.ovr - a.ovr : a.id - b.id));
    for (const p of byOvr) if (p.me) out.push(p);
    for (const p of byOvr) if (p.pos === "GOL" && !out.includes(p)) { out.push(p); break; }
    for (const p of byOvr) { if (out.length >= mx) break; if (!out.includes(p)) out.push(p); }
    return out;
  }
  notListed(cid: number): Player[] { const b = this.bench(cid); return this.benchAvail(cid).filter((p) => !b.includes(p)); }
  benchToggle(pid: number): string {
    const c = this.myClub();
    const cur = this.bench(this.S.club).map((p) => p.id);
    const i = cur.indexOf(pid);
    if (i >= 0) cur.splice(i, 1);
    else {
      if (cur.length >= this.benchMax()) return `O banco já tem ${this.benchMax()} jogadores. Tire alguém antes.`;
      if (!this.benchAvail(this.S.club).some((p) => p.id === pid)) return "Esse jogador não pode ser relacionado.";
      cur.push(pid);
    }
    c.bench = cur;
    c.bench_manual = true;
    return "";
  }
  benchAuto(): void { const c = this.myClub(); delete c.bench; c.bench_manual = false; }
  swapIntoXi(slot: number, pid: number): void {
    const c = this.myClub();
    const old = c.xi[slot];
    const wasBench = !!c.bench_manual && !!c.bench && c.bench.includes(pid);
    c.xi[slot] = pid;
    if (wasBench) c.bench![c.bench!.indexOf(pid)] = old;
  }
  suspended(cid: number): Player[] { return this.squad(cid).filter((p) => (p.susp ?? 0) > 0); }

  ratings(cid: number): { def: number; mei: number; atq: number; ger: number } {
    const c = this.S.clubs[cid];
    const slots = FORMATIONS[c.formation];
    const sum = { def: 0, mei: 0, atq: 0 }, cnt = { def: 0, mei: 0, atq: 0 };
    let tot = 0;
    for (let i = 0; i < Math.min(11, c.xi.length); i++) {
      const sp = slots[i][0];
      const v = this.eff(this.S.players[c.xi[i]], sp);
      const k = ["GOL", "ZAG", "LD", "LE"].includes(sp) ? "def" : ["VOL", "MEI"].includes(sp) ? "mei" : "atq";
      sum[k] += v; cnt[k]++; tot += v;
    }
    return { def: Math.round(sum.def / Math.max(cnt.def, 1)), mei: Math.round(sum.mei / Math.max(cnt.mei, 1)),
      atq: Math.round(sum.atq / Math.max(cnt.atq, 1)), ger: Math.round(tot / 11) };
  }

  energyAvg(cid: number): number {
    const xi = this.S.clubs[cid].xi;
    let t = 0;
    for (const pid of xi) t += this.S.players[pid].energy;
    return Math.round(t / Math.max(xi.length, 1));
  }

  status(p: Player): string {
    const yrs = this.S.season - p.joined;
    const feats = p.cgol + p.cass + p.titles.length * 15;
    if (yrs >= 5 && feats >= 60) return "ÍDOLO";
    if ((yrs >= 2 && feats >= 25) || (yrs >= 1 && p.titles.length > 0)) return "GRANDE JOGADOR";
    if (yrs >= 1) return "JOGADOR DO ELENCO";
    return "RECÉM-CHEGADO";
  }

  // ------------------------------------------------------------ calendário
  makeFixtures(): void {
    const n = this.nLeague();
    const ids = Array.from({ length: n }, (_, i) => i);
    this.rng.shuffle(ids);
    const first: [number, number][][] = [];
    for (let r = 0; r < n - 1; r++) {
      const ms: [number, number][] = [];
      for (let i = 0; i < Math.floor(n / 2); i++) {
        const a = ids[i], b = ids[n - 1 - i];
        const flip = i === 0 ? r % 2 === 1 : i % 2 === 1;
        ms.push(flip ? [b, a] : [a, b]);
      }
      first.push(ms);
      const last = ids.pop()!;
      ids.splice(1, 0, last);
    }
    let day = this.dayOf(this.S.year, 1, 20);
    while (this.dateOf(day).weekday !== 0) day++;
    const gaps = [7, 4, 3, 7];
    const fixtures: Round[] = [];
    for (let r = 0; r < (n - 1) * 2; r++) {
      const src = first[r % (n - 1)];
      const ms: Fixture[] = src.map(([a0, b0]) => {
        const [h, a] = r >= n - 1 ? [b0, a0] : [a0, b0];
        return { h, a, hg: -1, ag: -1, sc: [], st: [] };
      });
      fixtures.push({ day, m: ms });
      day += gaps[r % gaps.length];
    }
    this.S.fixtures = fixtures;
    this.S.round = 0;
    this.S.last_round = -1;
  }

  myMatch(r: number): Fixture | null {
    if (r < 0 || r >= this.S.fixtures.length) return null;
    return this.S.fixtures[r].m.find((m) => m.h === this.S.club || m.a === this.S.club) ?? null;
  }

  sortedTable(): number[] {
    const ids = Array.from({ length: this.nLeague() }, (_, i) => i);
    ids.sort((x, y) => {
      const a = this.S.clubs[x], b = this.S.clubs[y];
      if (a.pts !== b.pts) return b.pts - a.pts;
      if (a.v !== b.v) return b.v - a.v;
      const sa = a.gp - a.gc, sb = b.gp - b.gc;
      if (sa !== sb) return sb - sa;
      if (a.gp !== b.gp) return b.gp - a.gp;
      return x - y;
    });
    return ids;
  }
  positionOf(cid: number): number { return this.sortedTable().indexOf(cid) + 1; }

  // ------------------------------------------------------------ rodada
  playRound(userSim: MatchSim | null): void {
    const rd = this.S.fixtures[this.S.round];
    this.S.day = rd.day;
    for (const m of rd.m) {
      if (m.hg >= 0) continue;
      const sim = userSim && m.h === userSim.h && m.a === userSim.a ? userSim : new MatchSim(this, m.h, m.a);
      while (!sim.finished) sim.step();
      this.applyResult(m, sim);
    }
    for (const p of Object.values(this.S.players)) {
      if ((p.susp ?? 0) > 0) {
        p.susp = (p.susp ?? 0) - 1;
        if (p.susp === 0 && p.injury && !p.me) delete p.injury;
      }
    }
    this.S.last_round = this.S.round;
    const mm = this.myMatch(this.S.round);
    if (mm) {
      this.S.last_user = { kind: "league", round: this.S.round, comp: this.LEAGUE, label: `Rodada ${this.S.round + 1}`, day: rd.day,
        h: mm.h, a: mm.a, hg: mm.hg, ag: mm.ag, sc: mm.sc, st: mm.st, pens: [] };
    }
    this.S.round++;
    let gap = 7;
    if (this.S.round < this.S.fixtures.length) gap = this.S.fixtures[this.S.round].day - rd.day;
    this.betweenRounds(gap, !!mm && mm.h === this.S.club);
    this.S.day = rd.day + 1;
    if (this.S.round >= this.S.fixtures.length) {
      this.S.season_over = true;
      this.addNews("Fim de temporada", "O campeonato terminou. Veja o resumo e prepare o próximo ano.");
    }
    this.save();
  }

  private applyResult(m: Fixture, sim: MatchSim): void {
    m.hg = sim.score[0];
    m.ag = sim.score[1];
    m.sc = sim.scorers;
    m.st = sim.stats();
    this.applyPlayers(sim);
    const ch = this.S.clubs[m.h], ca = this.S.clubs[m.a];
    ch.j++; ca.j++;
    ch.gp += m.hg; ch.gc += m.ag; ca.gp += m.ag; ca.gc += m.hg;
    if (m.hg > m.ag) { ch.v++; ch.pts += 3; ca.d++; }
    else if (m.hg < m.ag) { ca.v++; ca.pts += 3; ch.d++; }
    else { ch.e++; ca.e++; ch.pts++; ca.pts++; }
  }

  /** Depois de qualquer partida: minutos, gols, energia, suspensões, lesões, torcida. */
  applyPlayers(sim: MatchSim): void {
    if (this.curSim === sim) this.curSim = null;
    for (const hp of this.fitness.rollInjuries(sim)) {
      if (hp.club === this.S.club) this.addNews("Lesão", `${hp.name} sofreu ${hp.injury} e desfalca o time por ${(hp.susp ?? 1) - 1} jogo(s).`);
    }
    for (const pid of sim.sentOff) {
      const p = this.S.players[pid];
      if (!p) continue;
      p.susp = Math.floor(this.tf("arbitro", "jogos_suspensao_vermelho", 1)) + 1;
      if (p.club === this.S.club) this.addNews("Expulsão", `${p.name} foi expulso e cumpre suspensão no próximo jogo.`);
    }
    for (const k of Object.keys(sim.mins)) {
      const pid = Number(k);
      const p = this.S.players[pid];
      if (!p) continue;
      const mn = sim.mins[pid];
      p.g++; p.min += mn; p.cmin += mn;
      p.energy = this.fitness.afterMatch(p, mn);
    }
    for (const s of sim.scorers) {
      const sp = this.S.players[s.pid];
      if (sp) { sp.gol++; sp.cgol++; }
      const ap = s.apid > 0 ? this.S.players[s.apid] : undefined;
      if (ap) { ap.ass++; ap.cass++; }
    }
    this.S.clubs[sim.h].xi = sim.origXi[0];
    this.S.clubs[sim.a].xi = sim.origXi[1];
    if (sim.h === this.S.club || sim.a === this.S.club) {
      const mine = sim.h === this.S.club ? sim.score[0] : sim.score[1];
      const other = sim.h === this.S.club ? sim.score[1] : sim.score[0];
      if (mine > other) this.S.support = Math.min(this.S.support + 2, 100);
      else if (mine < other) this.S.support = Math.max(this.S.support - 2, 0);
    }
  }

  private betweenRounds(gap: number, wasHome: boolean): void {
    this.finance.roundTick(gap, wasHome);
    const mineId = this.S.club;
    const grow = this.fitness.training().grow * gap / 7;
    for (const p of Object.values(this.S.players)) {
      const mine = p.club === mineId;
      p.energy = this.fitness.recover(p, gap, mine);
      if (mine && grow > 0 && p.age <= 23 && p.ovr < p.pot && this.fitness.injRng.randf() < grow) { p.ovr++; this.price(p); }
    }
    for (let c = 0; c < this.S.clubs.length; c++) if (c !== this.S.club) this.autoLineup(c);
    if (this.pro.isPro()) this.pro.pickLineup();
    else {
      this.validateXi(this.S.club);
      const tired = this.fitness.tiredStarters(this.S.club);
      if (tired.length >= 3) {
        this.addNews("Titulares cansados", `${tired.length} titulares chegam abaixo de 65% de energia (${tired.slice(0, 3).map((x) => x.name).join(", ")}). Considere poupar alguém.`);
      }
    }
    this.loans.roundTick();
    this.contracts.roundNotice();
    if (!this.pro.isPro()) {
      for (const p of this.squad(this.S.club)) {
        if (p.loan) continue;
        if (this.rng.randf() < (p.listed ? 0.45 : 0.012)) this.makeOffer(p);
      }
    }
    const nt = this.rng.randiRange(0, 2);
    for (let k = 0; k < nt; k++) this.aiTransfer();
    for (const p of this.squad(YOUTH)) if (this.rng.randf() < 0.3 && p.ovr < p.pot) { p.ovr++; this.price(p); }
    if (this.S.round === Math.floor(this.S.fixtures.length / 2)) {
      this.youthIntake(4);
      this.addNews("Novos jovens na base", "A captação trouxe novos garotos. Veja a Base do clube.");
    }
    if (this.S.money < 0 && !this.pro.isPro() && this.S.money >= this.finance.debtLimit() && this.S.round % 5 === 0) {
      this.addNews("Caixa no vermelho", `O clube está devendo ${this.money(this.S.money)} e paga juros. Venda jogadores ou reduza a folha.`);
    }
  }

  private makeOffer(p: Player): void {
    const cid = this.rng.randiRange(0, this.nLeague() - 1);
    if (cid === this.S.club) return;
    const val = snapped(p.value * this.rng.randfRange(0.8, 1.2), 0.01);
    this.S.offers = this.S.offers.filter((o) => o.pid !== p.id);
    this.S.offers.push({ pid: p.id, club: cid, value: val });
    this.addNews(`Proposta por ${p.name}`, `${this.clubName(cid)} ofereceu ${this.money(val)}.`);
  }

  aiTransfer(): void {
    const n = this.nLeague();
    const seller = this.rng.randiRange(0, n - 1);
    const buyer = this.rng.randiRange(0, n - 1);
    if (seller === buyer || seller === this.S.club || buyer === this.S.club) return;
    const sq = this.squad(seller);
    if (!sq.length) return;
    const p = sq[this.rng.randiRange(0, sq.length - 1)];
    if (p.me || p.loan) return;
    const fee = snapped(p.value * this.rng.randfRange(0.9, 1.3), 0.01);
    if (!this.finance.aiCanBuy(buyer, fee)) return;
    this.finance.aiTransferCash(seller, buyer, fee);
    this.logTransfer(p, seller, buyer, fee);
    p.club = buyer; p.joined = this.S.season; p.cmin = 0; p.cgol = 0; p.cass = 0; p.titles = [];
    this.makePlayer(p.pos, this.S.clubs[seller].str - this.rng.randiRange(2, 6), seller, this.rng.randiRange(18, 23));
    this.trim(buyer);
    this.autoLineup(seller);
    this.autoLineup(buyer);
    const free = this.squad(FREE);
    if (free.length > 40) {
      free.sort((a, b) => a.ovr - b.ovr);
      delete this.S.players[free[0].id];
    }
  }

  trim(cid: number): void {
    const sq = this.squad(cid).sort((x, y) => x.ovr - y.ovr);
    let i = 0;
    while (sq.length - i > 26 && i < sq.length) {
      if (!sq[i].me && !sq[i].loan) sq[i].club = FREE;
      i++;
    }
  }

  logTransfer(p: Player, from: number, to: number, fee: number, loan = false): void {
    this.S.transfers.unshift({ name: p.name, pos: p.pos, nat: p.nat, from, to, value: fee, day: this.S.day, ...(loan ? { loan: true } : {}) });
    if (this.S.transfers.length > 60) this.S.transfers.pop();
  }

  youthIntake(count: number): void {
    const st = this.myClub().str;
    for (let k = 0; k < count; k++) {
      if (this.squad(YOUTH).length >= 10) return;
      const p = this.makePlayer(POS_ORDER[this.rng.randiRange(0, 8)], this.rng.randiRange(st - 32, st - 16), YOUTH, this.rng.randiRange(16, 18));
      p.pot = clamp(p.ovr + this.rng.randiRange(8, 30), 55, 92);
      this.price(p);
    }
  }

  addNews(title: string, text: string): void {
    this.S.news.unshift({ day: this.S.day, t: title, x: text });
    this.S.unread++;
    if (this.S.news.length > 40) this.S.news.pop();
  }

  money(v: number): string { return Money.fmt(v); }

  // ------------------------------------------------------------ mercado
  askFee(p: Player): number { return p.club < 0 ? 0 : snapped(p.value * p.ask, 0.01); }
  askWage(p: Player): number { return snapped(p.wage * (p.club === FREE ? 1 : 1.1), 0.1); }

  signPlayer(pid: number, fee: number, wage: number, years: number): string {
    const p = this.S.players[pid];
    if (p.loan) return `${p.name} está emprestado ao ${this.clubName(p.club)}. Espere o fim do empréstimo.`;
    if (this.squad(this.S.club).length >= 30) return "Elenco cheio (máximo 30). Venda alguém antes.";
    if (fee > this.S.money + 0.001) return "Você não tem caixa para essa proposta.";
    const board = this.finance.canSpend(fee, wage);
    if (board) return board;
    if (p.club >= 0 && fee < this.askFee(p) - 0.001) return `${this.clubName(p.club)} recusou: quer um valor maior.`;
    if (wage < this.askWage(p) * 0.97) return `${p.name} recusou: pede um salário maior.`;
    const from = p.club;
    this.finance.book("compras", `Contratação: ${p.name}`, -fee);
    this.finance.aiTransferCash(from, -1, fee);
    this.finance.onPurchase(fee, wage);
    this.logTransfer(p, from, this.S.club, fee);
    p.club = this.S.club; p.wage = wage; p.contract = years + 1; delete p.renew;
    p.joined = this.S.season; p.listed = false; p.cmin = 0; p.cgol = 0; p.cass = 0; p.titles = [];
    if (from >= 0) {
      if (this.squad(from).length < 22) this.makePlayer(p.pos, this.S.clubs[from].str - this.rng.randiRange(2, 6), from, this.rng.randiRange(18, 23));
      this.autoLineup(from);
    }
    this.addNews("Reforço confirmado", `${p.name} (${p.pos}, GER ${p.ovr}) assinou por ${years} ano(s).`);
    this.save();
    return "";
  }

  acceptOffer(idx: number): string {
    const o = this.S.offers[idx];
    const p = this.S.players[o.pid];
    if (!p || p.loan || p.club !== this.S.club) { this.S.offers.splice(idx, 1); return `${p?.name ?? "Jogador"} não pertence mais ao seu clube.`; }
    if (this.squad(this.S.club).length <= 16) return "Elenco muito curto para vender (mínimo 16).";
    if (this.status(p) === "ÍDOLO") this.S.support = Math.max(this.S.support - 25, 0);
    this.finance.book("vendas", `Venda: ${p.name}`, o.value);
    this.finance.onSale(o.value);
    this.finance.aiTransferCash(-1, o.club, o.value);
    this.logTransfer(p, this.S.club, o.club, o.value);
    p.club = o.club; p.joined = this.S.season; p.listed = false; p.cmin = 0; p.cgol = 0; p.cass = 0; p.titles = [];
    this.S.offers.splice(idx, 1);
    this.validateXi(this.S.club);
    this.trim(o.club);
    this.autoLineup(o.club);
    this.addNews("Venda concluída", `${p.name} foi vendido ao ${this.clubName(o.club)} por ${this.money(o.value)}.`);
    this.save();
    return "";
  }
  rejectOffer(idx: number): void { this.S.offers.splice(idx, 1); }

  promoteYouth(pid: number): string {
    if (this.squad(this.S.club).length >= 30) return "Elenco cheio (máximo 30).";
    const p = this.S.players[pid];
    p.club = this.S.club; p.joined = this.S.season; p.contract = 3;
    this.addNews("Jovem promovido", `${p.name} subiu para o profissional.`);
    this.save();
    return "";
  }

  // ------------------------------------------------------------ fim de temporada
  seasonSummary(): { pos: number; champion: number; prize: number; top: Player | null; table: number[] } {
    const tb = this.sortedTable();
    const pos = tb.indexOf(this.S.club) + 1;
    let best: Player | null = null;
    for (const p of Object.values(this.S.players)) if (!best || p.gol > best.gol) best = p;
    return { pos, champion: tb[0], prize: snapped((tb.length + 1 - pos) * 0.6 * this.league().prize, 0.01), top: best, table: tb };
  }

  newSeason(): void {
    const sm = this.seasonSummary();
    const champ = sm.champion;
    this.S.clubs[champ].titles++;
    this.S.history.push({ year: this.S.year, pos: sm.pos, champion: this.S.clubs[champ].name });
    if (champ === this.S.club) {
      this.S.trophies.push({ name: this.LEAGUE, year: this.S.year });
      this.S.support = Math.min(this.S.support + 15, 100);
      this.S.coach.rep = Math.min(this.S.coach.rep + 1, 10);
    }
    for (const p of this.squad(champ)) p.titles.push(this.LEAGUE);
    this.loans.seasonEnd();
    this.contracts.seasonEnd();
    const gone: Player[] = [];
    for (const p of Object.values(this.S.players)) {
      p.age++;
      const age = p.age;
      if (p.me) {
        if (age > 31) p.ovr = Math.max(p.ovr - this.rng.randiRange(0, 2), 40);
        p.g = 0; p.min = 0; p.gol = 0; p.ass = 0; p.energy = 100;
        continue;
      }
      if (age <= 23) p.ovr = Math.min(p.ovr + this.rng.randiRange(1, 4), p.pot);
      else if (age <= 29) { if (p.ovr < p.pot) p.ovr += this.rng.randiRange(0, 2); }
      else if (age <= 32) p.ovr -= this.rng.randiRange(0, 1);
      else p.ovr -= this.rng.randiRange(1, 3);
      if (age <= 23 && p.min >= Number(this.contracts.cfg("emprestimo", "evolucao_extra_minutos", 1200)) && p.ovr < p.pot) p.ovr++;
      p.pot = Math.max(p.pot, p.ovr);
      p.g = 0; p.min = 0; p.gol = 0; p.ass = 0; p.energy = 100;
      if (p.club !== this.S.club && p.club !== YOUTH) this.price(p);
      else { const w = p.wage; this.price(p); p.wage = w; }
      if (p.club >= 0) p.contract = Math.max(p.contract - 1, 1);
      if (age >= 38 || (p.club === FREE && age >= 36) || (p.club === YOUTH && age >= 21)) gone.push(p);
    }
    for (const p of gone) {
      const cid = p.club;
      if (cid === this.S.club) this.addNews("Aposentadoria", `${p.name} pendurou as chuteiras.`);
      delete this.S.players[p.id];
      if (cid >= 0 && this.squad(cid).length < 22) this.makePlayer(p.pos, this.S.clubs[cid].str - this.rng.randiRange(1, 6), cid, this.rng.randiRange(18, 22));
    }
    this.S.offers = [];
    for (const c of this.S.clubs) { c.pts = 0; c.j = 0; c.v = 0; c.e = 0; c.d = 0; c.gp = 0; c.gc = 0; }
    this.S.season++;
    this.S.year++;
    this.S.day = this.dayOf(this.S.year, 1, 7);
    this.S.season_over = false;
    this.S.fin = { salarios: 0, patrocinio: 0, bilheteria: 0, compras: 0, vendas: 0, premios: 0 };
    this.finance.ensure();
    this.finance.book("premios", `Premiação do campeonato (${sm.pos}º lugar)`, sm.prize);
    this.finance.setSeasonBudget();
    for (let k = 0; k < 6; k++) this.makePlayer(POS_ORDER[this.rng.randiRange(0, 8)], this.rng.randiRange(64, 80), FREE, this.rng.randiRange(28, 34));
    this.youthIntake(4);
    this.makeFixtures();
    this.cups.buildSeason(sm.table);
    for (let c = 0; c < this.S.clubs.length; c++) {
      if (c === this.S.club) this.validateXi(c);
      else this.autoLineup(c);
    }
    this.addNews(`Temporada ${this.S.season}`, `Premiação recebida: ${this.money(sm.prize)}. Um novo campeonato começa.`);
    this.save();
  }

  /** Simula a temporada inteira (útil para testes e para "simular tudo"). */
  simulateSeason(maxGames = 400): number {
    let g = 0;
    while (!this.S.season_over && g < maxGames) { g++; this.playNext(null); while (this.media.hasInterview()) this.media.answer("humilde"); }
    return g;
  }
}
