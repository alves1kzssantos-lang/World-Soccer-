import { Match } from "../src/match/sim/match";
import { demoTeams } from "../src/match/demoTeams";
import { T } from "../src/match/sim/tuning";
import { W } from "../src/match/sim/types";
it("shots", () => {
  for (const side of [0, 1]) {
    let goals = 0, outs: string[] = [];
    for (let k = 0; k < 20; k++) {
      const m = new Match(demoTeams(), { seed: 10 + k, userSide: -1, events: { onText: (s) => outs.push(s) } });
      m.update(1.2); // sai da saída de bola
      const h = m.team[side][9];
      const gy = side === 0 ? 0 : 105;
      const dir = side === 0 ? -1 : 1;
      h.body.x = W / 2 + (k % 5 - 2) * 4; h.body.y = gy - dir * (14 + (k % 4) * 3);
      m.ball.place(h.body.x, h.body.y - dir * -0.5);
      (m as any).holder = h; (m as any).ballState = "held";
      m.chance = { side, kind: "goal", t: 0 } as any;
      (m as any).aiShot(h, "goal");
      for (let i = 0; i < 300 && m.mode !== "goal"; i++) m.update(T.step);
      if (m.mode === "goal") goals++;
    }
    console.log("side", side, "goals", goals, "/20", outs.filter((s) => !s.startsWith("GOO")).slice(0, 6));
  }
});
