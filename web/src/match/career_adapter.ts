import type { ChanceEvent, MatchScript } from "../career/match_script";
import type { Rng } from "./sim/rng";
import type { LiveResult, LiveScript, ScriptKind } from "./sim/types";

/**
 * Liga o MatchScript da carreira (career/match_script.ts) à partida ao vivo:
 * a carreira decide quando há chance e o desfecho dos lances da máquina; a partida devolve o que
 * aconteceu em campo nos lances do jogador (resolve).
 */
export class CareerLiveScript implements LiveScript {
  constructor(private career: MatchScript, private stamina?: (pid: number) => number) {}
  chanceAt(minute: number): { side: number; ref: unknown } | null {
    const c = this.career.nextChance(minute);
    return c ? { side: c.side, ref: c } : null;
  }
  outcome(_side: number, _minute: number, _rng: Rng, ref?: unknown): ScriptKind {
    return ref ? this.career.outcome(ref as ChanceEvent) : "lost";
  }
  resolve(ref: unknown, result: LiveResult): void {
    this.career.resolve?.(ref as ChanceEvent, result);
  }
  staminaFactor(pid: number): number {
    return this.stamina ? this.stamina(pid) : 1;
  }
}
