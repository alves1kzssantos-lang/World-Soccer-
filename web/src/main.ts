// Ponto de entrada: interface do jogo (menus em DOM) com a carreira real e a partida ao vivo.
// ?demo=1 abre direto a partida de demonstração (Flamengo x Palmeiras).
import { startUI } from "./ui/app";
import type { Ctx } from "./ui/ctx";
import { startDemo } from "./match/demo";
import { demoTeams } from "./match/demoTeams";
import { mountLiveMatch, runMatch, type CareerHost } from "./match/mount";
import { Match } from "./match/sim/match";

if (new URLSearchParams(location.search).has("demo")) {
  let cv = document.getElementById("game") as HTMLCanvasElement | null;
  if (!cv) {
    cv = document.createElement("canvas");
    cv.id = "game";
    cv.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh";
    document.body.appendChild(cv);
  }
  startDemo(cv);
} else {
  let uiCtx: Ctx | null = null;
  startUI({
    mountMatch: (el, info, onEnd) => {
      const api = uiCtx?.api as unknown as CareerHost | undefined;
      if (api && api.g) return mountLiveMatch(el, info, onEnd, api);
      // sem carreira real (modo exemplo): joga a partida de demonstração
      const m = new Match(demoTeams(), { userSide: 0 });
      return runMatch(el, m, () => onEnd({ hg: m.score[0], ag: m.score[1] }));
    },
  }).then((r) => { uiCtx = r.ctx; });
}
