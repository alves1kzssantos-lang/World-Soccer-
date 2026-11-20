import type { MatchSim, SimEvent, LanceResult } from "./match_sim";

/** Desfecho que a partida ao vivo deve encenar num lance da máquina. */
export type ScriptOutcome = "goal" | "save" | "out" | "lost" | "offside" | "penalty";

/** Chance que a partida ao vivo encena no campo. user = é a vez do jogador decidir (câmera lenta + toque). */
export interface ChanceEvent {
  minute: number; side: 0 | 1; user: boolean; pg: number;
  /** Lances do minuto (gols, cartões, substituições) para o placar/narração. */
  events: SimEvent[];
}

/**
 * Ponte entre a carreira (MatchSim) e a partida ao vivo (web/src/match).
 * A partida ao vivo avança o relógio e pergunta se há chance; nos lances da máquina segue o desfecho
 * sorteado (outcome); nos do jogador, devolve o que aconteceu em campo (resolve).
 */
export interface MatchScript {
  nextChance(minute: number): ChanceEvent | null;
  outcome(chance: ChanceEvent): ScriptOutcome;
  resolve?(chance: ChanceEvent, result: LanceResult): SimEvent;
}

/** Implementação sobre o MatchSim da carreira. */
export class SimMatchScript implements MatchScript {
  /** Lances já processados (para o placar/narração). */
  readonly log: SimEvent[] = [];
  constructor(readonly sim: MatchSim, readonly userSide: 0 | 1 | -1) {}

  /** Avança a simulação até `minute` (inclusive) e devolve a primeira chance encontrada. */
  nextChance(minute: number): ChanceEvent | null {
    while (!this.sim.finished && this.sim.minute < minute) {
      const evs = this.sim.step();
      this.log.push(...evs.filter((e) => e.type !== "lance"));
      const lance = evs.find((e) => e.type === "lance");
      if (lance) {
        const side = lance.side as 0 | 1;
        return { minute: this.sim.minute, side, user: side === this.userSide, pg: this.sim.pending.pg ?? 0.25, events: evs };
      }
    }
    return null;
  }

  outcome(_chance: ChanceEvent): ScriptOutcome { return this.sim.lanceScript(); }

  resolve(_chance: ChanceEvent, result: LanceResult): SimEvent {
    const e = this.sim.resolveLance(result);
    this.log.push(e);
    return e;
  }
}
