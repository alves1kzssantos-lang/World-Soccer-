import { Match } from "../src/match/sim/match";
import { demoTeams } from "../src/match/demoTeams";
import { T } from "../src/match/sim/tuning";
import { L, W } from "../src/match/sim/types";

function run(seed: number, seconds: number, userSide = -1) {
  const m = new Match(demoTeams(), { seed, userSide, matchSeconds: 270 });
  let worst = 0, ballIn = 0, nan = 0;
  const steps = Math.round(seconds / T.step);
  for (let i = 0; i < steps; i++) {
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
        if (p === m.passTarget || p.kick > 0 || p.keeper) continue;
        if (m.ball.z < 1.6 && Math.hypot(p.body.x - m.ball.x, p.body.y - m.ball.y) < p.body.radius * 0.8) ballIn++;
      }
    }
  }
  return { m, worst, ballIn, nan };
}

describe("partida (simulação)", () => {
  it("90 minutos sem corpos sobrepostos, sem NaN, com gols", () => {
    const r = run(3, 280);
    console.log("placar", r.m.score, "minuto", r.m.minute, "pior folga", r.worst.toFixed(3), "bola dentro", r.ballIn, "modo", r.m.mode);
    expect(r.nan).toBe(0);
    expect(r.worst).toBeGreaterThan(-0.02);
    expect(r.m.mode).toBe("ended");
  });
});
