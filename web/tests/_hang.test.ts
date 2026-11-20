import { Match } from "../src/match/sim/match";
import { demoTeams } from "../src/match/demoTeams";
it("hang", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const m = new Match(demoTeams(), { seed, userSide: 0 });
    const t0 = Date.now();
    for (let f = 0; f < 3000; f++) {
      m.update(1 / 60);
      if (m.mode === "decide") { m.update(0.5); (m as any).goLive(); (m as any).endChance(); }
      if (Date.now() - t0 > 3000) { console.log("SLOW seed", seed, "frame", f, m.mode, m.ballState); break; }
    }
  }
  console.log("done");
}, 120000);
