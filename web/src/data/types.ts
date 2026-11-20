/** Tipos dos dados do jogo (exportados do projeto Godot para public/data/*.json). */
export type Pos = "GOL" | "ZAG" | "LD" | "LE" | "VOL" | "MEI" | "PD" | "PE" | "AC";

export interface ClubDef { name: string; short: string; c1: string; c2: string; str: number; logo: number }
export interface LeagueDef { name: string; country: string; nat: string; pool: string; prize: number; comp_id: number; clubs: ClubDef[] }
export interface CupDef {
  name: string; comp: number; size: number; prize: number; legs?: number; final_single?: boolean;
  region: string[]; take: number[]; only?: string[];
}
export interface NamesDef { names: Record<string, [string[], string[]]>; foreign: [string, string][]; striped: string[] }

/** Entrada de elenco real: [nome, posição, idade, nota, país?] */
export type RosterEntry = [string, string, number, number, string?];

export interface StoreTier { id: string; nome: string; ovr: [number, number]; cor: string }
export interface StorePackOdd { tier: string; p: number }
export interface StorePack {
  id: string; nome: string; descricao: string; preco_base: number; cartas: number;
  odds: StorePackOdd[]; idade_max?: number; pot_min?: number; cor: string;
}
export interface StoreDef {
  _sobre?: string; tiers: StoreTier[]; packs: StorePack[];
  receita_referencia: number; escala_min: number; escala_max: number;
  destaque_desconto: number; reembolso_duplicado: number; anos_contrato: number; tolerancia_teto_folha: number;
}

/** Tudo que o modo carreira lê dos arquivos de dados. */
export interface GameData {
  leagues: LeagueDef[];
  cups: CupDef[];
  names: NamesDef;
  rosters: Record<string, RosterEntry[]>;
  tuning: Record<string, Record<string, unknown>>;
  economy: Record<string, number>;
  rules: Record<string, Record<string, unknown>>;
  media: Record<string, any>;
  pro: Record<string, any>;
  proLife: Record<string, any>;
  proSocial: Record<string, any>;
  store: StoreDef;
  temas?: Record<string, any>;
}

export const DATA_FILES = {
  leagues: "leagues.json", cups: "cups.json", names: "names.json", rosters: "rosters_real.json",
  tuning: "match_tuning.json", economy: "economy.json", rules: "career_rules.json", media: "media_texts.json",
  pro: "pro_career.json", proLife: "pro_life.json", proSocial: "pro_social.json", store: "store.json", temas: "temas.json",
} as const;
