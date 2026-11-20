import { Match } from "../src/match/sim/match";
import { demoTeams } from "../src/match/demoTeams";
import { T } from "../src/match/sim/tuning";
it("ch", () => {
  for (const seed of [5, 6, 7, 8, 9, 10]) {
    const m = new Match(demoTeams(), { seed, userSide: -1 });
    const orig = (m as any).startChance.bind(m);
    const c = [0, 0]; const kinds: string[] = [];
    (m as any).startChance = (s: number) => { c[s]++; orig(s); kinds.push(s + ":" + m.chance!.kind); };
    for (let i = 0; i < 60 * 330 && m.mode !== "ended"; i++) m.update(T.step);
    console.log("seed", seed, "chances", c, "score", m.score, kinds.join(" "));
  }
});
