import type { Rng } from "./rng";

/** Medidas oficiais (m). x atravessa o campo (0..W), y vai de um gol ao outro (0..L). */
export const W = 68;
export const L = 105;
export const GOAL_HALF = 3.66;
export const CROSSBAR = 2.44;
export const BOX_HALF = 20.16;
export const BOX_DEPTH = 16.5;
export const PEN_SPOT = 11;

export type Pos = "GOL" | "ZAG" | "LD" | "LE" | "VOL" | "MEI" | "PD" | "PE" | "AC";

export interface PlayerInfo {
  id: number;
  name: string;
  num: number;
  pos: Pos;
  vel: number; // velocidade 1..99
  pas: number; // passe
  chu: number; // chute
  des: number; // desarme
  ovr: number;
  skin: number; // 0..5
  hair: number; // estilo 0..6
  hairColor: number; // 0..5
  beard?: boolean;
}

export interface TeamInfo {
  name: string;
  short: string;
  c1: string; // camisa
  c2: string; // calção / detalhes
  stripes?: boolean;
  formation: string;
  players: PlayerInfo[]; // 11 titulares, o primeiro é o goleiro
  strength: number;
}

/** Desfecho de uma chance da máquina (o roteiro vem da simulação da carreira). */
export type ScriptKind = "goal" | "save" | "out" | "lost" | "offside" | "penalty";

/**
 * Roteiro da partida: a carreira implementa para que o resultado ao vivo bata com a simulação.
 * chanceOutcome: chamado quando o time da máquina chega perto do gol.
 * staminaFactor: 1 = descansado, ~0.84 = esgotado (multiplica velocidade e precisão).
 */
export interface MatchScript {
  chanceOutcome(side: number, minute: number, rng: Rng): ScriptKind;
  staminaFactor?(side: number, idx: number, minute: number): number;
}

/** Roteiro padrão para jogar sem carreira: chances viram gol conforme a força dos times. */
export class DefaultScript implements MatchScript {
  constructor(private strength: [number, number]) {}
  chanceOutcome(side: number, _minute: number, rng: Rng): ScriptKind {
    const diff = (this.strength[side] - this.strength[1 - side]) / 100;
    const r = rng.next();
    const pGoal = 0.27 + diff;
    if (r < pGoal) return "goal";
    if (r < pGoal + 0.03) return "penalty";
    if (r < pGoal + 0.28) return "save";
    if (r < pGoal + 0.48) return "out";
    if (r < pGoal + 0.56) return "offside";
    return "lost";
  }
}

export interface MatchEvents {
  onGoal?(side: number, scorer: string, minute: number): void;
  onText?(text: string): void;
  onEnd?(score: [number, number]): void;
}

/** Formações: [posição, x 0..1 (esquerda→direita do time), u 0..1 (próprio gol→gol rival)]. */
export const FORMATIONS: Record<string, [Pos, number, number][]> = {
  "4-3-3": [["GOL", 0.5, 0.07], ["LE", 0.12, 0.3], ["ZAG", 0.37, 0.25], ["ZAG", 0.63, 0.25], ["LD", 0.88, 0.3],
    ["VOL", 0.5, 0.47], ["MEI", 0.26, 0.58], ["MEI", 0.74, 0.58], ["PE", 0.15, 0.83], ["AC", 0.5, 0.88], ["PD", 0.85, 0.83]],
  "4-4-2": [["GOL", 0.5, 0.07], ["LE", 0.12, 0.3], ["ZAG", 0.37, 0.25], ["ZAG", 0.63, 0.25], ["LD", 0.88, 0.3],
    ["PE", 0.13, 0.6], ["VOL", 0.38, 0.52], ["MEI", 0.62, 0.52], ["PD", 0.87, 0.6], ["AC", 0.36, 0.86], ["AC", 0.64, 0.86]],
  "4-2-3-1": [["GOL", 0.5, 0.07], ["LE", 0.12, 0.3], ["ZAG", 0.37, 0.25], ["ZAG", 0.63, 0.25], ["LD", 0.88, 0.3],
    ["VOL", 0.36, 0.46], ["VOL", 0.64, 0.46], ["PE", 0.15, 0.7], ["MEI", 0.5, 0.68], ["PD", 0.85, 0.7], ["AC", 0.5, 0.89]],
  "3-5-2": [["GOL", 0.5, 0.07], ["ZAG", 0.25, 0.25], ["ZAG", 0.5, 0.23], ["ZAG", 0.75, 0.25],
    ["LE", 0.1, 0.55], ["VOL", 0.5, 0.45], ["MEI", 0.32, 0.62], ["MEI", 0.68, 0.62], ["LD", 0.9, 0.55], ["AC", 0.36, 0.86], ["AC", 0.64, 0.86]],
};
