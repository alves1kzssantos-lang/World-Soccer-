// Times da demonstração (elencos reais do jogo original).
import type { TeamInfo, Pos } from "./sim/types";

const P = (id: number, name: string, num: number, pos: Pos, ovr: number, skin: number, hair: number, hc: number) => ({
  id, name, num, pos, ovr, skin, hair, hairColor: hc,
  vel: Math.min(99, ovr - 6 + ((id * 7) % 15)), pas: Math.min(99, ovr - 4 + ((id * 11) % 11)),
  chu: Math.min(99, ovr - 8 + ((id * 13) % 17)), des: Math.min(99, ovr - 8 + ((id * 5) % 15)),
});

export function demoTeams(): [TeamInfo, TeamInfo] {
  return [
    { name: "Flamengo", short: "FLA", c1: "#c8102e", c2: "#111111", stripes: true, formation: "4-3-3", strength: 80, players: [
      P(101, "Agust\u00edn Rossi", 1, "GOL", 80, 5, 3, 1),
      P(102, "Guillermo Varela", 2, "LD", 76, 0, 4, 0),
      P(103, "L\u00e9o Ortiz", 4, "ZAG", 80, 1, 5, 5),
      P(104, "L\u00e9o Pereira", 14, "ZAG", 79, 2, 6, 4),
      P(105, "Alex Sandro", 6, "LE", 77, 3, 0, 3),
      P(106, "Jorginho", 5, "VOL", 80, 4, 1, 2),
      P(107, "de Arrascaeta", 8, "MEI", 84, 5, 2, 1),
      P(108, "Gerson", 10, "MEI", 81, 0, 3, 0),
      P(109, "Samuel Lino", 11, "PE", 78, 1, 4, 5),
      P(110, "Pedro", 9, "AC", 82, 2, 5, 4),
      P(111, "Gonzalo Plata", 7, "PD", 79, 3, 6, 3),
    ] },
    { name: "Palmeiras", short: "PAL", c1: "#0b6b3a", c2: "#ffffff", stripes: false, formation: "4-3-3", strength: 78, players: [
      P(112, "Weverton", 1, "GOL", 80, 4, 0, 2),
      P(113, "Marcos Rocha", 2, "LD", 72, 5, 1, 1),
      P(114, "Gustavo G\u00f3mez", 4, "ZAG", 81, 0, 2, 0),
      P(115, "Murilo", 14, "ZAG", 78, 1, 3, 5),
      P(116, "Joaqu\u00edn Piquerez", 6, "LE", 79, 2, 4, 4),
      P(117, "An\u00edbal Moreno", 5, "VOL", 78, 3, 5, 3),
      P(118, "Raphael Veiga", 8, "MEI", 80, 4, 6, 2),
      P(119, "Maur\u00edcio", 10, "MEI", 77, 5, 0, 1),
      P(120, "Facundo Torres", 11, "PE", 79, 0, 1, 0),
      P(121, "Vitor Roque", 9, "AC", 81, 1, 2, 5),
      P(122, "Felipe Anderson", 7, "PD", 77, 2, 3, 4),
    ] },
  ];
}
