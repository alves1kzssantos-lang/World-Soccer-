import { Match } from "../src/match/sim/match";
import { demoTeams } from "../src/match/demoTeams";
import { T } from "../src/match/sim/tuning";
it("terr", () => {
  const m = new Match(demoTeams(), { seed: 5, userSide: -1 });
  const hold = [0, 0], zone = [0, 0];
  let passes = [0, 0], prev: any = null, lost = 0;
  for (let i = 0; i < 60 * 300 && m.mode !== "ended"; i++) {
    m.update(T.step);
    const h = m.holder;
    if (h && m.ballState === "held") {
      hold[h.team]++;
      const dGoal = h.team === 0 ? h.body.y : 105 - h.body.y;
      if (dGoal < 40) zone[h.team]++;
    }
    if (h !== prev && h && prev && h.team !== prev.team) lost++;
    if (h) prev = h;
  }
  console.log("hold", hold, "zone", zone, "turnovers", lost, "score", m.score, "chanceCd", m.chanceCd);
});
