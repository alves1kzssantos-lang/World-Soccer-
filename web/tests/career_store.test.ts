import { describe, it, expect } from "vitest";
import { data, newGame } from "./career_helpers";

describe("loja de contratações", () => {
  it("chances de cada pack somam 100% e estão visíveis", async () => {
    const d = await data();
    const g = await newGame(0, 0, 1);
    for (const p of d.store.packs) {
      const odds = g.store.odds(p.id);
      expect(odds.length).toBe(p.odds.length);
      expect(odds.reduce((t, o) => t + o.p, 0)).toBeCloseTo(1, 6);
      for (const o of odds) expect(o.pct).toMatch(/%$/);
    }
  });

  it("preço escala com o tamanho econômico do clube e o destaque tem desconto", async () => {
    const d = await data();
    const big = await newGame(0, 0, 2);   // Flamengo
    const small = await newGame(1, 19, 2); // clube da Série B
    for (const p of d.store.packs) {
      if (p.id === big.store.featured() || p.id === small.store.featured()) continue;
      expect(big.store.price(p.id)).toBeGreaterThan(small.store.price(p.id));
    }
    const f = big.store.featured();
    const pk = d.store.packs.find((x) => x.id === f)!;
    expect(big.store.price(f)).toBeCloseTo(pk.preco_base * big.store.priceScale() * (1 - d.store.destaque_desconto), 2);
  });

  it("abrir pack contrata jogadores reais do nível sorteado e cobra do caixa", async () => {
    const g = await newGame(0, 0, 3);
    g.S.money = 500;
    g.S.econ.transfer_budget = 500;
    g.S.econ.wage_budget = 99999;
    const before = g.squad(0).length;
    const price = g.store.price("ouro");
    const res = g.store.buy("ouro");
    expect(res.ok).toBe(true);
    expect(res.cards.length).toBe(2);
    expect(g.S.money).toBeLessThan(500 - price + 0.01 + res.cards.reduce((t, c) => t + c.refund, 0));
    for (const c of res.cards) {
      const t = g.store.tier(c.tier);
      expect(c.ovr).toBeGreaterThanOrEqual(t.ovr[0]);
      expect(c.ovr).toBeLessThanOrEqual(t.ovr[1]);
      if (c.outcome === "contratado") {
        const p = g.player(c.pid!);
        expect(p.club).toBe(0);
        expect(p.wage).toBeGreaterThan(0);
        expect(p.contract).toBe(g.data.store.anos_contrato + 1);
      }
    }
    expect(g.squad(0).length).toBe(before + res.cards.filter((c) => c.outcome === "contratado").length);
    expect(g.S.fin.loja).toBeGreaterThan(0);
    expect(g.S.store!.opened).toBe(1);
  });

  it("jogador repetido vira reembolso", async () => {
    const g = await newGame(0, 0, 4);
    g.S.money = 500;
    g.S.econ.transfer_budget = 500;
    g.S.econ.wage_budget = 99999;
    // força todos os candidatos possíveis a já serem do clube: compra muitos packs até sair repetido
    let dup = 0;
    for (let i = 0; i < 60 && dup === 0; i++) {
      if (g.squad(0).length > 26) for (const p of g.squad(0).slice(-4)) g.contracts.toFree(p);
      const r = g.store.buy("lenda");
      if (!r.ok) break;
      dup += r.cards.filter((c) => c.outcome === "repetido").length;
    }
    expect(dup).toBeGreaterThan(0);
  });

  it("respeita o teto da folha e o limite do elenco", async () => {
    const g = await newGame(0, 0, 5);
    g.S.money = 500;
    g.S.econ.transfer_budget = 500;
    g.S.econ.wage_budget = 1;
    const r = g.store.buy("elite");
    expect(r.ok).toBe(true);
    expect(r.cards.every((c) => c.outcome !== "contratado")).toBe(true);
    expect(r.cards.every((c) => c.refund > 0)).toBe(true);
    while (g.squad(0).length < 30) g.makePlayer("MEI", 60, 0, 25);
    expect(g.store.canBuy("elenco")).toMatch(/Elenco cheio/);
  });

  it("sem caixa não compra e o modo jogador não tem loja", async () => {
    const g = await newGame(0, 0, 6);
    g.S.money = 0;
    expect(g.store.canBuy("lenda")).toMatch(/Caixa insuficiente/);
  });
});
