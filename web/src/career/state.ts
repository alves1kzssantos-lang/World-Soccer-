import type { Pos } from "../data/types";

export interface Loan {
  from: number; to: number; season: number; end_round: number; pct: number; buy: number; fee: number;
  start: { g: number; min: number; gol: number; ass: number };
}
export interface Player {
  id: number; name: string; nat: string; pos: Pos; age: number; ovr: number; pot: number;
  club: number; energy: number; wage: number; value: number; ask: number; contract: number; joined: number; listed: boolean;
  g: number; min: number; gol: number; ass: number; cmin: number; cgol: number; cass: number; titles: string[];
  real?: boolean; real_age?: number; susp?: number; injury?: string; loan?: Loan;
  renew?: { tries?: number; refused?: boolean }; role?: string; me?: boolean;
  loan_hist?: { club: number; season: number; g: number; min: number; gol: number; ass: number }[];
  look_skin?: number; look_hstyle?: number; look_hcolor?: number; look_beard?: boolean; look_boots?: string;
  num?: number; foot?: string; store_tier?: string;
}
export interface Club {
  id: number; name: string; short: string; c1: string; c2: string; str: number; li: number; ci: number; guest: boolean;
  trial?: boolean; formation: string; xi: number[]; titles: number;
  pts: number; j: number; v: number; e: number; d: number; gp: number; gc: number;
  cash?: number; bench?: number[]; bench_manual?: boolean; logo?: number;
}
export interface Scorer { min: number; side: number; pid: number; name: string; apid: number; aname: string }
export type Stats = [number[], number[], number[], number[], number[], number[], number[]];
export interface Fixture { h: number; a: number; hg: number; ag: number; sc: Scorer[]; st: Stats | [] }
export interface Round { day: number; m: Fixture[] }
export interface Tie {
  h: number; a: number; hg: number; ag: number; pens: number[]; w: number; sc: Scorer[]; st: Stats | []; legs: number[][];
}
export interface Cup {
  def: number; name: string; comp: number; alive: number[]; rounds: Tie[][]; days: number[];
  stages: { round: number; leg: number }[]; next: number; champion: number; celebrated?: boolean;
}
export interface News { day: number; t: string; x: string }
export interface Coach { name: string; age: number; nat: string; rep: number; [k: string]: unknown }

/** Estado completo da carreira (vai inteiro para o save em JSON). */
export interface State {
  ver: number; mode?: "tecnico" | "pro"; league: number; coach: Coach; club: number; season: number; year: number; day: number;
  money: number; support: number; clubs: Club[]; players: Record<number, Player>; next_id: number;
  fixtures: Round[]; round: number; last_round: number; season_over: boolean;
  news: News[]; unread: number; offers: { pid: number; club: number; value: number }[];
  loan_offers: { pid: number; club: number; pct: number; half: boolean; buy: number }[];
  transfers: { name: string; pos: string; nat: string; from: number; to: number; value: number; day: number; loan?: boolean }[];
  trophies: { name: string; year: number }[]; history: { year: number; pos: number; champion: string }[];
  training: "leve" | "normal" | "forte"; fin: Record<string, number>; n_league: number;
  cups: Cup[]; guests?: Record<string, number>; econ: Econ; media?: any; pro?: any; last_user?: any;
  store?: StoreState; rng_seed?: number;
}
export interface Econ {
  ledger: { d: number; k: string; t: string; v: number }[]; hist: [number, number][];
  transfer_budget: number; transfer_spent: number; wage_budget: number; board_warn: number; last_gate: number;
}
export interface StoreState { opened: number; spent: number; history: { day: number; pack: string; got: string[]; price: number }[] }
