# Carreira (web) — API

Porte em TypeScript puro (sem DOM) da carreira do jogo Godot. Tudo em pt-BR.

## Carregar e começar
```ts
import { loadGameData, FetchDataSource } from "../data/db";
import { Game, LocalSaveStore } from "../career";
const data = await loadGameData(new FetchDataSource("./data/"));   // public/data/*.json
const g = new Game(data, new LocalSaveStore());
g.newCareer(slot, { name, age, nat, rep: 5 }, clubIndex, leagueIndex);   // técnico
g.pro.start(slot, { ...g.pro.newProfile(), name: "Fulano" });           // jogador
g.loadCareer(slot); g.peekSave(slot); g.deleteSave(slot);
```
Estado: `g.S` (JSON inteiro do save). Liga: `g.league()`, clubes `g.S.clubs`, jogadores `g.S.players`.

## Rodada / partida
- `g.nextUserMatch()` → `{kind, h, a, comp, label, day, cup?, leg?, agg?}` (ou `null` no fim).
- `g.newUserSim()` → `MatchSim` interativo para a partida ao vivo; `g.playNext(sim | null)` aplica (ou simula tudo).
- `new SimMatchScript(sim, userSide)` implementa `MatchScript` (`match_script.ts`):
  `nextChance(minuto)` avança o sim e devolve `ChanceEvent {minute, side, user, pg, events}`;
  `outcome(chance)` = desfecho sorteado para lance da máquina (`goal|save|out|lost|offside|penalty`);
  `resolve(chance, {goal, kind, pid, apid?, pen?})` registra o que aconteceu em campo.
- Substituições: `sim.substitute(side, slot, pid)`, `sim.benchPlayers(side)`, `sim.maxSubs()`, `sim.maxWindows()`.
- Energia ao vivo: `g.staminaFactor(pid)` (1.0 → ~0.84).
- Atributos dos lances: `g.attrs(p)` → `{vel, pas, chu, des}`; formações `FORMATIONS`.
- Tabela: `g.sortedTable()`, `g.positionOf(cid)`; calendário `g.S.fixtures`; copas `g.S.cups` + `g.cups.*`.
- Fim de temporada: `g.seasonSummary()`, `g.newSeason()`; `g.simulateSeason()` (teste/“simular tudo”).

## Elenco e mercado
`g.squad(cid)`, `g.bench(cid)`, `g.benchToggle(pid)`, `g.autoLineup(cid)`, `g.swapIntoXi(slot, pid)`,
`g.ratings(cid)`, `g.signPlayer(pid, fee, wage, years)`, `g.askFee(p)`, `g.askWage(p)`, `g.acceptOffer(i)`, `g.promoteYouth(pid)`.
- Contratos: `g.contracts.expiringList(cid)`, `.demand(p)`, `.propose(pid, wage, years, role)`, `.release(pid)`, `.releaseCost(p)`.
- Empréstimos: `g.loans.availableIn()`, `.termsIn(p)`, `.loanIn(pid, half, pct, withBuy)`, `.offerOut(pid, half)`,
  `.offers()`, `.acceptRequest(i)`, `.recall(pid)`, `.buyOption(pid)`, `.wageBill(cid)`.
- Energia/treino: `g.fitness.setTraining("leve"|"normal"|"forte")`, `.label(p)`, `.color(e)`.

## Dinheiro
`g.finance.breakdown()`, `.seasonResult()`, `.transferLeft()`, `g.S.econ` (orçamento, extrato `ledger`, histórico `hist`).
Formatação: `Money.fmt(mi)`, `Money.wage(milSem)`, `Money.signed(mi)`.

## Loja de contratações (NOVO, caixa do clube)
`g.store.packs()`, `.price(id)`, `.odds(id)` (mostrar antes!), `.featured()` (destaque semanal com desconto),
`.canBuy(id)` → "" ou motivo, `.buy(id)` → `{ok, text, price, cards: [{name, pos, ovr, tier, tierName, outcome: contratado|repetido|teto_salarial, refund}]}`.
Dados em `public/data/store.json`.

## Mídia
`g.media.hasInterview()`, `.currentQuestion()` → `{cat, q, a: {tom: resposta}}`, `.answer(tom)`, `.skipInterview()`,
`.feed()`, `.followers()`, `.approval()`, `.meter("diretoria"|"torcida"|"moral"|"imprensa")`, `g.media.st().trending`.

## Jogador (modo carreira de jogador)
`g.pro.P()` (estado), `.me()`, `.statusLine()`, `.accept(i)`, `.negotiate(i)`, `.reject(i)`, `.hire(id)`, `.buy(id)`,
`.reply(postId, estilo)`, `.ownPost(id)`, `.setTraining(k)`, `.closeSeason()`, `.nextSeason()`, `.retire()`.

## Dados
Exportados do Godot por `web/tools/export_data.gd` (`leagues.json`, `cups.json`, `names.json`) + cópias dos JSON de ajuste.
Testes: `npx vitest run tests/career*`.
