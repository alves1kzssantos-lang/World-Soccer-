import { DATA_FILES, GameData } from "./types";

/** Fonte dos arquivos de dados: no navegador vem de fetch; nos testes, do disco. */
export interface DataSource { readJson(file: string): Promise<unknown> }

/** Navegador / app: lê de ./data/<arquivo> (pasta public/data). */
export class FetchDataSource implements DataSource {
  constructor(private base = "./data/") {}
  async readJson(file: string): Promise<unknown> {
    const r = await fetch(this.base + file);
    if (!r.ok) throw new Error(`Falha ao carregar ${file}: ${r.status}`);
    return r.json();
  }
}

export async function loadGameData(src: DataSource): Promise<GameData> {
  const keys = Object.keys(DATA_FILES) as (keyof typeof DATA_FILES)[];
  const out: Record<string, unknown> = {};
  await Promise.all(keys.map(async (k) => {
    try { out[k] = await src.readJson(DATA_FILES[k]); }
    catch (e) { if (k === "temas") out[k] = {}; else throw e; }
  }));
  return out as unknown as GameData;
}

/** Normaliza nomes para comparar (sem acento, minúsculo, só letras e números). */
export function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
