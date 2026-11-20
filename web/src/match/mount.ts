import type { Game } from "../career/game";
import { SimMatchScript } from "../career/match_script";
import { CareerLiveScript } from "./career_adapter";
import { MatchInput } from "./input/input";
import { Match } from "./sim/match";
import { FORMATIONS, type PlayerInfo, type Pos, type TeamInfo } from "./sim/types";
import { Renderer } from "./view/renderer";

/** O que a partida precisa da carreira (a interface entrega o RealCareer). */
export interface CareerHost {
  g: Game;
  liveSim: unknown;
  markPlayed?(): void;
}

export interface MatchInfo { homeId: number; awayId: number; comp: string; compId: number }

const hex = (c: string): string => (c.startsWith("#") ? c : `#${c}`);

function teamFrom(g: Game, cid: number): TeamInfo {
  const c = g.S.clubs[cid];
  const form = FORMATIONS[c.formation] ? c.formation : "4-3-3";
  const slots = FORMATIONS[form];
  const players: PlayerInfo[] = [];
  for (let i = 0; i < 11; i++) {
    const pid = c.xi[i];
    const p = g.S.players[pid];
    const a = g.attrs(p);
    const look = p as unknown as Record<string, number>;
    players.push({
      id: p.id, name: p.name, num: i === 0 ? 1 : i + 1, pos: slots[i][0] as Pos,
      vel: a.vel, pas: a.pas, chu: a.chu, des: a.des, ovr: p.ovr,
      skin: look.look_skin ?? (p.id * 3) % 6, hair: look.look_hstyle ?? p.id % 7, hairColor: look.look_hcolor ?? (p.id * 5) % 6,
    });
  }
  return { name: c.name, short: c.short, c1: hex(c.c1), c2: hex(c.c2), formation: form, players, strength: c.str ?? 70 };
}

/**
 * Monta a partida ao vivo dentro de `el` (canvas em tela cheia) usando a simulação da carreira.
 * Chama onEnd com o placar quando o jogo acaba. Devolve a função que desmonta.
 */
export function mountLiveMatch(el: HTMLElement, info: MatchInfo, onEnd: (r: { hg: number; ag: number }) => void, host: CareerHost): () => void {
  const g = host.g;
  const sim = g.newUserSim();
  if (!sim) { onEnd({ hg: 0, ag: 0 }); return () => undefined; }
  host.liveSim = sim;
  const userSide = sim.h === g.S.club ? 0 : 1;
  const career = new SimMatchScript(sim, userSide as 0 | 1);
  const proMe = g.pro?.isPro?.() ? g.pro.P().me : -1;
  const match = new Match([teamFrom(g, sim.h), teamFrom(g, sim.a)], {
    seed: (g.S.day ?? 1) * 97 + sim.h,
    userSide,
    controlledId: proMe,
    script: new CareerLiveScript(career, (pid) => g.staminaFactor(pid)),
    events: { onText: () => undefined },
  });
  void info;
  return runMatch(el, match, () => {
    // completa os minutos que faltarem na simulação (o placar oficial é o dela)
    let guard = 0;
    while (!sim.finished && guard++ < 200) career.nextChance(99);
    onEnd({ hg: sim.score[0], ag: sim.score[1] });
  }, () => {
    // o placar oficial é o da simulação (inclui lances que não foram para o campo)
    if (match.score[0] !== sim.score[0] || match.score[1] !== sim.score[1]) {
      match.score[0] = Math.max(match.score[0], sim.score[0]);
      match.score[1] = Math.max(match.score[1], sim.score[1]);
    }
  });
}

/** Laço de quadros da partida dentro de um elemento. Devolve a função que desmonta. */
export function runMatch(el: HTMLElement, match: Match, onEnd: () => void, onFrame?: () => void): () => void {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none";
  el.style.position = el.style.position || "relative";
  el.appendChild(canvas);
  const ctx = canvas.getContext("2d", { alpha: false })!;
  const renderer = new Renderer(ctx, match);
  const input = new MatchInput(canvas, () => match, () => renderer);
  let ended = false, endT = 0;
  const finish = (): void => { if (!ended) { ended = true; onEnd(); } };
  input.onRestart = finish;
  window.__match = match;
  window.__renderer = renderer;
  let dpr = 1;
  const resize = (): void => {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const r = el.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round((r.width || innerWidth) * dpr));
    canvas.height = Math.max(1, Math.round((r.height || innerHeight) * dpr));
  };
  addEventListener("resize", resize);
  resize();
  let raf = 0, last = performance.now(), alive = true;
  const perf = window.__perf;
  const frame = (now: number): void => {
    if (!alive) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    match.update(dt);
    onFrame?.();
    renderer.render(dt, dpr);
    if (perf) { perf.frames++; perf.sumMs += dt * 1000; perf.worstMs = Math.max(perf.worstMs, dt * 1000); perf.drawMs += renderer.frameMs; }
    if (match.mode === "ended") { endT += dt; if (endT > 3) finish(); }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    removeEventListener("resize", resize);
    canvas.remove();
  };
}
