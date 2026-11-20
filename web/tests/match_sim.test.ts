import { Ball } from "../src/match/sim/physics";
import { Match } from "../src/match/sim/match";
import { demoTeams } from "../src/match/demoTeams";
import { T } from "../src/match/sim/tuning";
import { GOAL_HALF, L, W, type ScriptKind } from "../src/match/sim/types";

function play(seed: number, steps: number) {
  const m = new Match(demoTeams(), { seed, userSide: -1 });
  let worst = 0, ballIn = 0, nan = 0;
  for (let i = 0; i < steps && m.mode !== "ended"; i++) {
    m.update(T.step);
    const bs = m.bodies;
    for (let a = 0; a < bs.length; a++) {
      const A = bs[a];
      if (!Number.isFinite(A.x + A.y + A.vx + A.vy)) nan++;
      for (let b = a + 1; b < bs.length; b++) {
        const B = bs[b];
        const gap = Math.hypot(A.x - B.x, A.y - B.y) - (A.radius + B.radius);
        if (gap < worst) worst = gap;
      }
    }
    if (m.ballState === "loose" || m.ballState === "pass") {
      for (const p of m.players) {
        if (p === m.passTarget || p.kick > 0 || p.keeper || p === m.holder) continue;
        if (m.ball.z < 1.6 && Math.hypot(p.body.x - m.ball.x, p.body.y - m.ball.y) < p.body.radius * 0.8) ballIn++;
      }
    }
  }
  return { m, worst, ballIn, nan };
}

describe("partida (simulação)", () => {
  it("10 mil passos sem corpos sobrepostos, sem bola dentro de corpo, sem NaN", () => {
    for (const seed of [1, 2, 3]) {
      const r = play(seed, 10000);
      expect(r.nan).toBe(0);
      expect(r.worst).toBeGreaterThan(-0.02);
      expect(r.ballIn).toBe(0);
    }
  });

  it("mesma semente, mesma partida (determinística)", () => {
    const a = play(11, 6000).m, b = play(11, 6000).m;
    expect(a.score).toEqual(b.score);
    expect(a.ball.x).toBeCloseTo(b.ball.x, 6);
    expect(a.players[5].body.y).toBeCloseTo(b.players[5].body.y, 6);
  });

  it("uma partida inteira termina, com chances dos dois lados", () => {
    let chances = [0, 0], goals = 0;
    for (const seed of [4, 5, 6, 7]) {
      const m = new Match(demoTeams(), { seed, userSide: -1 });
      let had = false;
      for (let i = 0; i < 60 * 400 && m.mode !== "ended"; i++) {
        m.update(T.step);
        if (m.chance && !had) chances[m.chance.side]++;
        had = !!m.chance;
      }
      expect(m.mode).toBe("ended");
      goals += m.score[0] + m.score[1];
    }
    expect(chances[0]).toBeGreaterThan(4);
    expect(chances[1]).toBeGreaterThan(4);
    expect(goals).toBeGreaterThan(1);
  });

  it("lances da máquina seguem o roteiro (≥95%)", () => {
    const want: Record<string, string[]> = { goal: ["goal"], save: ["save"], out: ["out"] };
    let ok = 0, total = 0;
    for (const kind of ["goal", "save", "out"] as ScriptKind[]) {
      for (let k = 0; k < 20; k++) {
        const side = k % 2;
        const m = new Match(demoTeams(), { seed: 100 + k, userSide: -1 });
        m.update(1.2);
        const h = m.team[side][9];
        const gy = side === 0 ? 0 : L, dir = side === 0 ? -1 : 1;
        h.body.x = W / 2 + ((k % 5) - 2) * 4; h.body.y = gy - dir * (14 + (k % 4) * 3);
        m.ball.place(h.body.x, h.body.y + dir * 0.5);
        let got = "";
        m.events.onGoal = () => { got = "goal"; };
        m.events.onText = (s) => { if (!got) got = /Defesa|espalma/.test(s) ? "save" : /fora|cima|trave|travess/i.test(s) ? "out" : got; };
        (m as unknown as { holder: unknown; ballState: string }).holder = h;
        (m as unknown as { ballState: string }).ballState = "held";
        m.chance = { side, kind, t: 0 } as Match["chance"];
        (m as unknown as { aiShot: (p: unknown, k: string) => void }).aiShot(h, kind);
        for (let i = 0; i < 300 && !got; i++) m.update(T.step);
        total++;
        if (want[kind].includes(got)) ok++;
      }
    }
    expect(ok / total).toBeGreaterThanOrEqual(0.95);
  });

  it("chute mirado chega perto do ponto (atacante bom, força média)", () => {
    const m = new Match(demoTeams(), { seed: 9, userSide: -1 });
    m.update(1.2);
    const h = m.team[0][9];
    h.info.chu = 95;
    h.body.x = W / 2; h.body.y = 18;
    m.ball.place(W / 2, 17.5);
    let errSum = 0;
    for (let k = 0; k < 20; k++) {
      m.ball.place(W / 2, 17.5);
      m.doShot(h, W / 2 + 2, 1.0, 0.4, 0);
      // segue a bola até a linha do gol (sem goleiro: só a física)
      const b = m.ball;
      for (let i = 0; i < 200 && b.y > 0; i++) b.step(T.step);
      errSum += Math.abs(b.x - (W / 2 + 2));
    }
    expect(errSum / 20).toBeLessThan(GOAL_HALF / 2);
  });

  it("passe rasteiro chega com a velocidade pedida", () => {
    const b = new Ball();
    b.place(0, 0);
    const v0 = Ball.groundSpeedFor(20, T.passArrive);
    b.vx = v0;
    for (let i = 0; i < 600 && b.x < 20; i++) b.step(T.step);
    expect(b.speed()).toBeGreaterThan(T.passArrive - 1);
    expect(b.speed()).toBeLessThan(T.passArrive + 1);
  });
});
