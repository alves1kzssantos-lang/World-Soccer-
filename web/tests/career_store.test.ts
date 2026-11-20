import { describe, it, expect } from "vitest";
import { data, newGame } from "./career_helpers";

/** Prepara um clube com caixa, orçamento e folha folgados para testar a box. */
async function richGame(league: number, club: number, seed: number) {
  const g = await newGame(league, club, seed);
  g.S.money = 500;
  g.S.econ.transfer_budget = 500;
  g.S.econ.wage_budget = 99999;
  return g;
}

describe("box de contratações", () => {
  it("tem só a box com três cartas (Bronze, Prata, Ouro) e chances que somam 100%", async () => {
    const d = await data();
    const g = await newGame(0, 0, 1);

    const packs = g.store.packs();
    const odds = g.store.odds("box");

    expect(packs.map((p) => p.id)).toEqual(["box"]);
    expect(d.store.tiers.map((t) => t.id)).toEqual(["bronze", "prata", "ouro"]);
    expect(odds.reduce((t, o) => t + o.p, 0)).toBeCloseTo(1, 6);
    const p = Object.fromEntries(odds.map((o) => [o.tier, o.p]));
    expect(p.ouro).toBeLessThan(p.prata);   // Ouro é a mais rara
    expect(p.prata).toBeLessThan(p.bronze); // Bronze é a menos rara
  });

  it("preço do giro escala com o tamanho econômico do clube", async () => {
    const big = await newGame(0, 0, 2);   // Flamengo
    const small = await newGame(1, 19, 2); // clube da Série B

    expect(big.store.price("box")).toBeGreaterThan(small.store.price("box"));
  });

  it("girar contrata um jogador real do nível sorteado e cobra do caixa", async () => {
    const g = await richGame(0, 0, 3);
    const before = g.squad(0).length;

    const res = g.store.buy("box");

    expect(res.ok).toBe(true);
    expect(res.cards.length).toBe(1);
    const c = res.cards[0];
    const t = g.store.tier(c.tier);
    expect(c.ovr).toBeGreaterThanOrEqual(t.ovr[0]);
    expect(c.ovr).toBeLessThanOrEqual(t.ovr[1]);
    if (c.outcome === "contratado") {
      const p = g.player(c.pid!);
      expect(p.club).toBe(0);
      expect(p.wage).toBeGreaterThan(0);
      expect(g.squad(0).length).toBe(before + 1);
    }
    expect(g.S.fin.loja).toBeGreaterThan(0);
  });

  it("cada time tem só 3 giros por temporada", async () => {
    const g = await richGame(0, 0, 4);

    const results = [1, 2, 3, 4].map(() => g.store.buy("box"));

    expect(results.slice(0, 3).every((r) => r.ok)).toBe(true);
    expect(results[3].ok).toBe(false);
    expect(results[3].text).toMatch(/giros/);
    expect(g.store.spinsLeft()).toBe(0);
  });

  it("os giros renovam na temporada seguinte e são contados por time", async () => {
    const g = await richGame(0, 0, 5);
    for (let i = 0; i < 3; i++) g.store.buy("box");

    g.S.season += 1;
    const leftNextSeason = g.store.spinsLeft();
    g.S.season -= 1;
    g.S.club = 1;
    const leftOtherClub = g.store.spinsLeft();

    expect(leftNextSeason).toBe(3);
    expect(leftOtherClub).toBe(3);
  });

  it("respeita o teto da folha (reembolso) e sem caixa não gira", async () => {
    const g = await richGame(0, 0, 6);
    g.S.econ.wage_budget = 1;

    const r = g.store.buy("box");

    expect(r.ok).toBe(true);
    expect(r.cards.every((c) => c.outcome !== "contratado" && c.refund > 0)).toBe(true);
    g.S.money = 0;
    expect(g.store.canBuy("box")).toMatch(/Caixa insuficiente/);
  });
});
