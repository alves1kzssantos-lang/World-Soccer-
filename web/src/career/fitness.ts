import type { Game } from "./game";
import type { Player } from "./state";
import type { MatchSim } from "./match_sim";
import { Rng, hashOf, clamp } from "../data/rng";

export const POS_DRAIN: Record<string, number> = { GOL: 0.35, ZAG: 0.85, LD: 1.15, LE: 1.15, VOL: 1.1, MEI: 1.05, PD: 1.1, PE: 1.1, AC: 0.95 };
export const TRAINING = { leve: { rec: 1.3, grow: 0 }, normal: { rec: 1.0, grow: 0.015 }, forte: { rec: 0.72, grow: 0.05 } };
export const TRAINING_NAMES = { leve: "Leve", normal: "Normal", forte: "Forte" };
const INJURIES = ["lesão muscular na coxa", "entorse no tornozelo", "contusão no joelho", "estiramento na panturrilha", "dores nas costas", "lesão no adutor"];

/** Energia (condição física) dos jogadores (porte de fitness.gd). */
export class Fitness {
  /** Sorteio próprio das lesões (não mexe na sequência da partida). */
  readonly injRng = new Rng(1);
  constructor(private g: Game) {}
  f(key: string, fallback: number): number { return this.g.tf("energia", key, fallback); }

  ageDrain(age: number): number { return age <= 21 ? 0.95 : 1 + Math.max(0, age - 28) * this.f("cansaco_por_ano_acima_28", 0.035); }
  ageRecovery(age: number): number { return clamp(1 + (26 - age) * this.f("recuperacao_por_ano", 0.025), 0.72, 1.18); }
  drainPerMin(p: Player, slotPos = "", press = 1): number {
    const pos = slotPos || p.pos;
    return this.f("cansaco_por_minuto", 0.30) * (POS_DRAIN[pos] ?? 1) * this.ageDrain(p.age ?? 26) * press;
  }
  live(p: Player, mins: number, slotPos = "", press = 1): number { return clamp(p.energy - mins * this.drainPerMin(p, slotPos, press), 0, 100); }
  factor(energy: number): number { const e = clamp(energy / 100, 0, 1); return 1 - this.f("perda_rendimento_max", 0.16) * Math.pow(1 - e, 1.4); }
  afterMatch(p: Player, mins: number, slotPos = ""): number {
    const used = mins * this.drainPerMin(p, slotPos);
    const left = p.energy - (this.f("desgaste_fixo_jogo", 4) * mins / 90 + used * this.f("desgaste_que_fica", 0.6));
    return clamp(left, this.f("energia_minima", 15), 100);
  }
  trainingMode(): "leve" | "normal" | "forte" { const t = this.g.S.training; return t in TRAINING ? t : "normal"; }
  training() { return TRAINING[this.trainingMode()]; }
  setTraining(t: "leve" | "normal" | "forte"): void { this.g.S.training = t; this.g.save(); }
  recover(p: Player, days: number, mine: boolean): number {
    const tr = mine ? this.training().rec : 1;
    let gain = days * this.f("recuperacao_por_dia", 4.6) * this.ageRecovery(p.age ?? 26) * tr;
    if ((p.susp ?? 0) > 0 && p.injury) gain *= 0.6;
    return Math.min(p.energy + gain, 100);
  }
  injuryChance(p: Player, mins: number, endEnergy: number): number {
    if (mins <= 0) return 0;
    const tired = Math.max(0, this.f("energia_risco", 55) - endEnergy) / 12;
    const ageK = 1 + Math.max(0, (p.age ?? 26) - 30) * 0.06;
    const trainK = this.trainingMode() === "forte" && p.club === this.g.S.club ? 1.15 : 1;
    return this.f("lesao_base", 0.006) * mins / 90 * Math.pow(1 + tired, 2) * ageK * trainK;
  }
  rollInjuries(sim: MatchSim): Player[] {
    const hurt: Player[] = [];
    this.injRng.setSeed(hashOf(this.g.S.day ?? 0, sim.h, sim.a, this.g.S.season ?? 1));
    for (const k of Object.keys(sim.mins)) {
      const p = this.g.S.players[Number(k)];
      if (!p || p.me) continue;
      const mn = sim.mins[p.id];
      const endE = this.live(p, mn);
      if (this.injRng.randf() < this.injuryChance(p, mn, endE)) {
        const games = [1, 1, 2, 2, 3, 4, 6][this.injRng.randiRange(0, 6)];
        p.susp = Math.max(p.susp ?? 0, games + 1);
        p.injury = INJURIES[this.injRng.randiRange(0, INJURIES.length - 1)];
        hurt.push(p);
      }
    }
    return hurt;
  }
  tiredStarters(cid: number, limit = 65): Player[] {
    return this.g.S.clubs[cid].xi.map((pid) => this.g.S.players[pid]).filter((p) => p && p.energy < limit);
  }
  color(energy: number): string { return energy >= 75 ? "39e33f" : energy >= 55 ? "f2c94c" : "ff5a5a"; }
  label(p: Player): string {
    if ((p.susp ?? 0) > 0 && p.injury) return "LESIONADO";
    return p.energy >= 85 ? "Descansado" : p.energy >= 70 ? "Bem" : p.energy >= 55 ? "Cansado" : "Exausto";
  }
}
