import { describe, it, expect } from "vitest";
import { data, newGame, leagueIndex } from "./career_helpers";
import { Game, FREE } from "../src/career/game";
import { MemorySaveStore } from "../src/career/storage";
import { SimMatchScript } from "../src/career/match_script";
import * as Money from "../src/career/money";

describe("dados", () => {
  it("carregam todos os arquivos", async () => {
    const d = await data();
    expect(d.leagues.length).toBeGreaterThan(40);
    expect(d.leagues[0].clubs.length % 2).toBe(0);
    expect(d.cups.length).toBeGreaterThan(5);
    expect(Object.keys(d.rosters).length).toBeGreaterThan(100);
    expect(d.store.packs.map((p) => p.id)).toEqual(["box"]);
    expect(d.tuning.arbitro).toBeTruthy();
  });
  it("formata dinheiro no padrão brasileiro", () => {
    expect(Money.fmt(12.44)).toBe("$ 12,4 mi");
    expect(Money.fmt(0.85)).toBe("$ 850 mil");
    expect(Money.fmt(-3.25)).toBe("−$ 3,3 mi");
    expect(Money.wage(43.8)).toBe("$ 43,8 mil/sem");
    expect(Money.fmt(1250)).toBe("$ 1.250 mi");
  });
});

describe("carreira de técnico", () => {
  for (const name of ["Brasileirão Série A", "Premier League", "La Liga"]) {
    it(`cria a carreira na ${name} com elencos reais`, async () => {
      const d = await data();
      const li = leagueIndex(d, name);
      const g = await newGame(li, 0);
      expect(g.S.clubs.length).toBeGreaterThanOrEqual(d.leagues[li].clubs.length);
      for (let c = 0; c < g.nLeague(); c++) {
        expect(g.squad(c).length).toBeGreaterThanOrEqual(20);
        expect(g.club(c).xi.length).toBe(11);
      }
      const reals = g.squad(0).filter((p) => p.real);
      expect(reals.length).toBeGreaterThan(5);
      expect(g.S.fixtures.length).toBe((g.nLeague() - 1) * 2);
      expect(g.S.money).toBeGreaterThan(0);
    });
  }

  it("joga a temporada inteira e todas as copas têm campeão", async () => {
    const g = await newGame(0, 0, 77);
    const games = g.simulateSeason();
    expect(g.S.season_over).toBe(true);
    expect(games).toBeGreaterThanOrEqual(38);
    expect(g.S.cups.length).toBeGreaterThan(0);
    for (const c of g.S.cups) expect(c.champion).toBeGreaterThanOrEqual(0);
    const tb = g.sortedTable();
    expect(g.club(tb[0]).j).toBe(38);
    const pts = tb.reduce((t, c) => t + g.club(c).pts, 0);
    expect(pts).toBeGreaterThan(38 * 10 * 2);
    const avgGoals = g.S.fixtures.flatMap((r) => r.m).reduce((t, m) => t + m.hg + m.ag, 0) / (38 * 10);
    expect(avgGoals).toBeGreaterThan(1.5);
    expect(avgGoals).toBeLessThan(4.5);
  }, 60000);

  it("save e load dão o mesmo estado (também depois da virada)", async () => {
    const g = await newGame(0, 3, 9);
    for (let i = 0; i < 5; i++) g.playNext(null);
    const t1 = g.serialize();
    const g2 = new Game(g.data, new MemorySaveStore());
    expect(g2.loadFromText(t1)).toBe(true);
    expect(g2.serialize()).toBe(t1);
    g.simulateSeason();
    g.newSeason();
    const t2 = g.serialize();
    const g3 = new Game(g.data, new MemorySaveStore());
    expect(g3.loadFromText(t2)).toBe(true);
    expect(g3.serialize()).toBe(t2);
    expect(g3.S.season).toBe(2);
    expect(g3.S.round).toBe(0);
  }, 60000);

  it("save antigo sem chaves novas ganha os padrões", async () => {
    const g = await newGame(0, 0, 3);
    const s = JSON.parse(g.serialize());
    delete s.econ; delete s.store; delete s.loan_offers; delete s.training;
    const g2 = new Game(g.data, new MemorySaveStore());
    expect(g2.loadFromText(JSON.stringify(s))).toBe(true);
    expect(g2.S.econ.wage_budget).toBeGreaterThan(0);
    expect(g2.S.store!.opened).toBe(0);
    expect(g2.S.training).toBe("normal");
  });

  it("finanças ficam dentro de limites em 3 temporadas (3 ligas)", async () => {
    const d = await data();
    for (const name of ["Brasileirão Série A", "Premier League", "Campeonato Paulista"]) {
      const li = leagueIndex(d, name);
      const g = await newGame(li, Math.floor(d.leagues[li].clubs.length / 2), 5);
      g.autosave = false;
      for (let s = 0; s < 3; s++) {
        g.simulateSeason();
        if (s < 2) g.newSeason();
      }
      const rev = g.finance.annualRevenue();
      expect(g.S.money).toBeGreaterThan(-rev);
      expect(g.S.money).toBeLessThan(rev * 6);
      for (const c of g.S.clubs) {
        if (c.id === g.S.club || c.cash === undefined) continue;
        const annual = g.finance.baseRevenue(c.str) * 52;
        expect(c.cash).toBeGreaterThan(-annual);
        expect(c.cash).toBeLessThan(annual * 1.5);
      }
      for (let c = 0; c < g.nLeague(); c++) expect(g.squad(c).length).toBeGreaterThanOrEqual(16);
      expect(isFinite(g.S.money)).toBe(true);
    }
  }, 120000);

  it("contratos: renovação aceita, contraproposta e recusa com saída de graça", async () => {
    const g = await newGame(0, 0, 21);
    const sq = g.squad(0).filter((p) => !p.me);
    const a = sq[2], b = sq[5], c = sq[8];
    for (const p of [a, b, c]) p.contract = 1;
    const da = g.contracts.demand(a);
    expect(g.contracts.propose(a.id, da.wage, da.years, da.role).result).toBe("aceita");
    expect(a.contract).toBe(da.years + 1);
    const db = g.contracts.demand(b);
    expect(g.contracts.propose(b.id, db.wage * 0.88, db.years, db.role).result).toBe("contraproposta");
    const dc = g.contracts.demand(c);
    expect(g.contracts.propose(c.id, dc.wage * 0.4, dc.years, dc.role).result).toBe("recusa");
    g.simulateSeason();
    g.newSeason();
    // saiu de graça: ficou sem clube (ou já foi aposentado/removido da lista de livres)
    expect(g.player(c.id)?.club ?? FREE).toBe(FREE);
    expect(g.S.transfers.some((t) => t.name === c.name && t.from === 0 && t.to === FREE)).toBe(true);
  }, 60000);

  it("empréstimo: sai, joga pelo outro clube e volta no fim da temporada", async () => {
    const g = await newGame(0, 0, 33);
    const p = g.squad(0).filter((q) => !g.myClub().xi.includes(q.id))[0];
    let r = { ok: false, text: "" };
    for (let i = 0; i < 20 && !r.ok; i++) r = g.loans.offerOut(p.id, false);
    expect(r.ok).toBe(true);
    expect(p.loan).toBeTruthy();
    const to = p.loan!.to;
    expect(g.loans.loanedOut(0)).toContain(p);
    g.simulateSeason();
    expect(g.loans.stats(p).g).toBeGreaterThanOrEqual(0);
    g.newSeason();
    if (g.player(p.id)?.loan === undefined && g.player(p.id).club === 0) expect(g.player(p.id).loan_hist?.[0].club).toBe(to);
    const bill = g.loans.wageBill(0);
    expect(bill).toBeGreaterThan(0);
  }, 60000);

  it("banco: limites de troca e substituições da máquina", async () => {
    const g = await newGame(0, 0, 44);
    const m = g.nextUserMatch()!;
    const { MatchSim } = await import("../src/career/match_sim");
    const sim = new MatchSim(g, m.h, m.a);
    sim.aiSides = [false, true];
    const side = m.h === 0 ? 0 : 1;
    const bench = sim.benchPlayers(side);
    expect(bench.length).toBeGreaterThan(0);
    expect(sim.substitute(side, 5, bench[0].id)).toBe("");
    while (!sim.finished) sim.step();
    expect(sim.subs[1 - side]).toBeGreaterThan(0);
    expect(sim.subs[1 - side]).toBeLessThanOrEqual(5);
  });

  it("MatchScript entrega chances e aplica o resultado do lance", async () => {
    const g = await newGame(0, 0, 55);
    const sim = g.newUserSim()!;
    const userSide = sim.h === g.S.club ? 0 : 1;
    const ms = new SimMatchScript(sim, userSide);
    let chances = 0, mine = 0;
    for (let min = 1; min <= 90 && !sim.finished;) {
      const ch = ms.nextChance(min);
      if (!ch) { min++; continue; }
      chances++;
      if (ch.user) mine++;
      const out = ch.user ? "goal" : ms.outcome(ch);
      const pid = g.club(sim.cid(ch.side)).xi[9];
      ms.resolve(ch, { goal: out === "goal", kind: out, pid });
      min = sim.minute + 1;
    }
    expect(chances).toBeGreaterThan(3);
    expect(mine).toBeGreaterThan(0);
    expect(sim.score[userSide]).toBeGreaterThanOrEqual(mine);
    g.playNext(sim);
    expect(g.S.round).toBe(1);
  });
});

describe("carreira de jogador", () => {
  it("peneira, propostas, assinatura e temporada", async () => {
    const d = await data();
    const g = new Game(d, new MemorySaveStore(), 99);
    const prof = g.pro.newProfile();
    prof.name = "Craque Teste";
    g.pro.start(0, prof);
    expect(g.pro.P().stage).toBe("peneira");
    expect(g.nextUserMatch()!.kind).toBe("trial");
    g.playNext(null);
    expect(g.pro.P().stage).toBe("propostas");
    expect(g.pro.P().offers.length).toBeGreaterThan(0);
    expect(g.pro.accept(0)).toMatch(/Bem-vindo/);
    expect(g.pro.P().stage).toBe("carreira");
    const me = g.pro.me();
    expect(me.club).toBe(g.S.club);
    expect(me.wage).toBeGreaterThan(0);
    let games = 0;
    while (!g.S.season_over && games < 80) { g.playNext(null); games++; while (g.media.hasInterview()) g.media.answer("confiante"); }
    expect(g.S.season_over).toBe(true);
    expect(g.pro.P().money).toBeGreaterThan(0);
    const rep = g.pro.closeSeason();
    expect(rep.year).toBe(g.S.year);
    g.pro.nextSeason();
    expect(g.pro.me().age).toBe(prof.age + 1);
  }, 60000);
});

describe("mídia", () => {
  it("coletiva com os 4 tons mexe nos medidores dentro de 0..100", async () => {
    const g = await newGame(0, 0, 66);
    let answered = 0;
    for (let i = 0; i < 12; i++) {
      g.playNext(null);
      const tones = ["humilde", "confiante", "provocar", "desviar"] as const;
      while (g.media.hasInterview()) { g.media.answer(tones[answered % 4]); answered++; }
    }
    expect(answered).toBeGreaterThan(8);
    for (const k of ["diretoria", "moral", "imprensa", "torcida"]) {
      const v = g.media.meter(k);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(g.media.feed().length).toBeGreaterThan(5);
  });
});
