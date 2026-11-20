// Contexto compartilhado pelas telas.
import type { CareerApi, ClubVM, PlayerVM } from "./career_api";
import type { Nav } from "./nav";
import { h } from "./dom";
import { crest } from "./assets";
import { portrait, lookForPlayer } from "./chibi";
import { posChip, bar } from "./widgets";

export interface Ctx { nav: Nav; api: CareerApi; base: string; mountMatch?: MatchMount }
/** Ponto de montagem da partida (web/src/match): recebe o contêiner e devolve o placar no fim. */
export type MatchMount = (el: HTMLElement, info: { homeId: number; awayId: number; comp: string; compId: number }, onEnd: (r: { hg: number; ag: number }) => void) => () => void;

export const clubCrest = (c: ClubVM, size: number) => crest(c.crest, size, c.short, c.c1, c.c2);
export const kitOf = (c: ClubVM): [string, string, boolean] => [c.c1, c.c2, !!c.striped];

/** Linha de jogador (elenco, mercado, banco). */
export function playerRow(p: PlayerVM, club: ClubVM | null, right: (HTMLElement | string)[], onClick?: () => void): HTMLElement {
  const r = h("div.lrow", onClick ? { onclick: onClick } : null,
    posChip(p.pos), portrait(lookForPlayer(p, club ? kitOf(club) : undefined), 30, "head"),
    h("div.name", null, p.name, p.expiring ? h("span.small.neg-txt", null, "  ✎ contrato") : null, p.injured ? h("span.small.neg-txt", null, "  ✚ lesionado") : null),
    ...right);
  return r;
}

export function energyCell(p: PlayerVM): HTMLElement {
  return h("div", { style: "width:74px" }, h("div.small.num", null, `${Math.round(p.energy)}%`), bar(p.energy / 100, undefined, true));
}
