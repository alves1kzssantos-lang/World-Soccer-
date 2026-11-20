import { Match } from "../src/match/sim/match";
import { demoTeams } from "../src/match/demoTeams";
import { T } from "../src/match/sim/tuning";
it("dbg", () => {
  const texts: Record<string, number> = {};
  const m = new Match(demoTeams(), { seed: 3, userSide: -1, events: { onText: (s) => { const k = s.split(" ")[0]; texts[k] = (texts[k] || 0) + 1; } } });
  let chances = 0, had = false, shots = 0, prevShot = false;
  const states: Record<string, number> = {};
  for (let i = 0; i < 60 * 400 && m.mode !== "ended"; i++) {
    m.update(T.step);
    if (m.chance && !had) { chances++; console.log("chance", m.minute, m.chance.side, m.chance.kind); }
    had = !!m.chance;
    if (m.ballState === "shot" && !prevShot) shots++;
    prevShot = m.ballState === "shot";
    states[m.mode + "/" + m.ballState] = (states[m.mode + "/" + m.ballState] || 0) + 1;
  }
  console.log("score", m.score, "min", m.minute, "chances", chances, "shots", shots, JSON.stringify(texts), JSON.stringify(states));
});
