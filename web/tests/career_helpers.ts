import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadGameData, type DataSource } from "../src/data/db";
import type { GameData } from "../src/data/types";
import { Game } from "../src/career/game";
import { MemorySaveStore } from "../src/career/storage";

/** Lê public/data/*.json do disco (nos testes não há fetch). */
export class NodeDataSource implements DataSource {
  constructor(private dir = join(__dirname, "..", "public", "data")) {}
  async readJson(file: string): Promise<unknown> { return JSON.parse(readFileSync(join(this.dir, file), "utf8")); }
}

let cached: GameData | null = null;
export async function data(): Promise<GameData> {
  if (!cached) cached = await loadGameData(new NodeDataSource());
  return cached;
}

export const COACH = { name: "Teste", age: 40, nat: "Brasil", rep: 5 };

export async function newGame(league = 0, club = 0, seed = 1234): Promise<Game> {
  const g = new Game(await data(), new MemorySaveStore(), seed);
  g.newCareer(0, { ...COACH }, club, league);
  return g;
}

export function leagueIndex(d: GameData, name: string): number { return d.leagues.findIndex((l) => l.name === name); }
