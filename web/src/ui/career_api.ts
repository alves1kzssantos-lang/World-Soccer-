// Contrato entre as telas e a carreira. A camada de carreira (web/src/career) implementa
// CareerApi; até lá as telas usam MockCareer (dados de exemplo) para poderem ser testadas.
export interface ClubVM { id: number; name: string; short: string; c1: string; c2: string; striped?: boolean; crest: number; str: number }
export interface PlayerVM {
  id: number; name: string; pos: string; age: number; ovr: number; pot: number; nat: string; num: number;
  energy: number; value: number; wage: number; contract: number; expiring?: boolean; injured?: boolean; loan?: string;
  goals?: number; apps?: number; assists?: number; look_skin?: number; look_hcolor?: number; look_hstyle?: number; look_beard?: boolean;
}
export interface LeagueVM { idx: number; name: string; country: string; compId: number; clubs: ClubVM[] }
export interface SlotVM { slot: number; empty: boolean; mode?: "tecnico" | "jogador"; club?: ClubVM; season?: number; league?: string; who?: string }
export interface MatchInfoVM { home: ClubVM; away: ClubVM; comp: string; compId: number; stage: string; date: string }
export interface TableRowVM { pos: number; club: ClubVM; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number; me?: boolean }
export interface PostVM { user: string; kind: "torcida" | "corneta" | "imprensa" | "rival" | "voce"; text: string; likes: number; when: string; verified?: boolean }
export interface PackVM { id: string; name: string; tier: "ouro" | "elite" | "lenda" | "jovem"; desc: string; price: number; count: number; odds: [string, number][] }
export interface FinanceVM { cash: number; seasonResult: number; budget: number; spent: number; wageBill: number; wageCap: number; confidence: number;
  income: { label: string; value: number }[]; expense: { label: string; value: number }[]; history: number[]; tx: { day: string; label: string; value: number }[] }
export interface QuestionVM { q: string; answers: Record<"humilde" | "confiante" | "provocar" | "desviar", string> }
export interface TieVM { a: ClubVM; b: ClubVM; sa: string; sb: string; winner: 0 | 1 | -1 }
export interface CupVM { name: string; compId: number; rounds: { name: string; ties: TieVM[] }[]; champion?: ClubVM }
export interface HubVM { club: ClubVM; league: string; compId: number; season: number; dateLabel: string; next: MatchInfoVM | null; tablePos: number; pts: number;
  played: number; form: string[]; money: number; approval: number; followers: string; lastPost: string; unread: number; formation: string; teamEnergy: number;
  expiring: number; offers: number }
export interface RenewalVM { player: PlayerVM; askWage: number; askYears: number; askRole: string; tries: number }
export interface MatchResultVM { home: ClubVM; away: ClubVM; hg: number; ag: number; scorers: { min: number; name: string; home: boolean }[]; stats: [string, number, number][] }

export interface CareerApi {
  slots(): SlotVM[];
  leagues(): LeagueVM[];
  newCareer(slot: number, mode: "tecnico" | "jogador", league: number, club: number, person: Record<string, unknown>): void;
  load(slot: number): boolean;
  hub(): HubVM;
  squad(): PlayerVM[];
  player(id: number): PlayerVM | undefined;
  lineup(): { formation: string; formations: string[]; xi: number[]; bench: number[]; training: "leve" | "normal" | "forte" };
  setLineup(xi: number[], bench: number[], formation: string, training: "leve" | "normal" | "forte"): void;
  autoLineup(): void;
  market(filter: { pos?: string; loans?: boolean }): PlayerVM[];
  buy(id: number): string;
  loanIn(id: number): string;
  loanOut(id: number): string;
  renewal(id: number): RenewalVM;
  proposeRenewal(id: number, wage: number, years: number, role: string): { result: "aceita" | "contraproposta" | "recusa"; text: string };
  packs(): PackVM[];
  openPack(id: string): { ok: boolean; msg: string; players: PlayerVM[]; refund: number };
  finance(): FinanceVM;
  table(): TableRowVM[];
  results(): { round: string; home: ClubVM; away: ClubVM; hg: number; ag: number }[];
  calendar(): { date: string; opp: ClubVM; home: boolean; comp: string; compId: number }[];
  cups(): CupVM[];
  pressQuestions(): QuestionVM[];
  answerPress(tone: string): { meters: Record<string, number>; reaction: string };
  social(tab: number): PostVM[];
  meters(): Record<string, number>;
  nextMatch(): MatchInfoVM | null;
  playMatch(result?: { hg: number; ag: number }): MatchResultVM;   // simula (ou recebe o placar da partida jogada)
  simulateMatch(): MatchResultVM;
  seasonOver(): boolean;
  seasonSummary(): { pos: number; champion: ClubVM; prize: number; topScorer: string; titles: string[] };
  newSeason(): void;
  money(v: number): string;
}

// ------------------------------------------------------------------ dados de exemplo
const C = (id: number, name: string, short: string, c1: string, c2: string, crest: number, str: number, striped = false): ClubVM =>
  ({ id, name, short, c1, c2, crest, str, striped });
const CLUBS: ClubVM[] = [
  C(0, "Flamengo", "FLA", "#c4161c", "#111111", 410, 82, true), C(1, "Palmeiras", "PAL", "#006437", "#ffffff", 422, 82),
  C(2, "Cruzeiro", "CRU", "#1c3f94", "#ffffff", 407, 78), C(3, "Corinthians", "COR", "#ffffff", "#111111", 428, 77),
  C(4, "Botafogo", "BOT", "#111111", "#ffffff", 400, 77, true), C(5, "Atlético-MG", "CAM", "#111111", "#ffffff", 401, 77, true),
  C(6, "São Paulo", "SAO", "#ffffff", "#d71920", 435, 76), C(7, "Fluminense", "FLU", "#7a1631", "#00613c", 411, 76, true),
  C(8, "Internacional", "INT", "#d71920", "#ffffff", 416, 76), C(9, "Bahia", "BAH", "#ffffff", "#0b3fa8", 408, 76),
  C(10, "Grêmio", "GRE", "#0d80bf", "#111111", 414, 75, true), C(11, "Santos", "SAN", "#ffffff", "#111111", 431, 74),
  C(12, "Vasco da Gama", "VAS", "#111111", "#ffffff", 436, 74), C(13, "RB Bragantino", "RBB", "#ffffff", "#d71920", 402, 73),
  C(14, "Athletico-PR", "CAP", "#d71920", "#111111", 398, 73, true), C(15, "Mirassol", "MIR", "#f6d200", "#0f7a3e", 6976, 72),
  C(16, "Vitória", "VIT", "#d71920", "#111111", 438, 70, true), C(17, "Coritiba", "CFC", "#ffffff", "#00613c", 405, 70),
  C(18, "Chapecoense", "CHA", "#00843d", "#ffffff", 4182, 70), C(19, "Remo", "REM", "#0b2a5b", "#ffffff", 427, 69),
];
const NAMES = ["Agustín Rossi", "Guillermo Varela", "Léo Ortiz", "Léo Pereira", "Alex Sandro", "Ayrton Lucas", "Erick Pulgar", "Jorginho", "Saúl Ñíguez",
  "de Arrascaeta", "Gerson", "Luiz Araújo", "Everton", "Bruno Henrique", "Pedro", "Gonzalo Plata", "Wallace Yan", "Matheus Cunha", "Danilo",
  "Emerson Royal", "Juninho", "Michael", "Allan", "Carlinhos"];
const POS = ["GOL", "LD", "ZAG", "ZAG", "LE", "LE", "VOL", "VOL", "MEI", "MEI", "MEI", "PD", "PE", "AC", "AC", "PD", "PE", "GOL", "ZAG", "LD", "VOL", "PE", "MEI", "AC"];
const NATS = ["ARG", "URU", "BRA", "BRA", "BRA", "BRA", "CHI", "ITA", "ESP", "URU", "BRA", "BRA", "BRA", "BRA", "BRA", "EQU", "BRA", "BRA", "BRA", "BRA", "BRA", "BRA", "BRA", "BRA"];

function mkPlayers(base: number, n: number, ovr0: number, seed: number): PlayerVM[] {
  const out: PlayerVM[] = [];
  for (let i = 0; i < n; i++) {
    const id = base + i, ovr = Math.max(55, ovr0 - (i % 7) - ((i * seed) % 5));
    out.push({ id, name: NAMES[i % NAMES.length], pos: POS[i % POS.length], age: 19 + ((i * 7 + seed) % 16), ovr, pot: Math.min(94, ovr + ((i * 3) % 9)),
      nat: NATS[i % NATS.length], num: i + 1, energy: [100, 92, 84, 61, 48, 100, 73][i % 7], value: Math.round(ovr * ovr * 0.0016 * 10) / 10,
      wage: Math.round(ovr * ovr * 0.0065 * 10) / 10, contract: 1 + (i % 4), expiring: i % 9 === 4, injured: i === 15,
      goals: (i * 3) % 7, apps: 4 + (i % 9), assists: i % 4 });
  }
  return out;
}

export class MockCareer implements CareerApi {
  private sq = mkPlayers(1, 24, 84, 3);
  private mk = mkPlayers(500, 60, 88, 5).map((p, i) => ({ ...p, name: NAMES[(i + 7) % NAMES.length] + (i > 20 ? " Jr." : ""), loan: i % 6 === 0 ? "Empréstimo" : undefined }));
  private m: Record<string, number> = { diretoria: 63, torcida: 78, elenco: 81, imprensa: 52 };
  private cash = 46.4;
  money(v: number): string {
    const a = Math.abs(v), s = v < 0 ? "−" : "";
    return a >= 1 ? `${s}$ ${a.toFixed(1).replace(".", ",")} mi` : `${s}$ ${Math.round(a * 1000)} mil`;
  }
  slots(): SlotVM[] {
    return [{ slot: 0, empty: false, mode: "tecnico", club: CLUBS[0], season: 2, league: "Brasileirão Série A", who: "Alves" },
      { slot: 1, empty: false, mode: "jogador", club: CLUBS[17], season: 1, league: "Brasileirão Série A", who: "Kauã Silva" },
      { slot: 2, empty: true }, { slot: 3, empty: true }];
  }
  leagues(): LeagueVM[] {
    return [{ idx: 0, name: "Brasileirão Série A", country: "Brasil", compId: 1410, clubs: CLUBS },
      { idx: 3, name: "Premier League", country: "Inglaterra", compId: 2270, clubs: CLUBS.slice(0, 8) },
      { idx: 4, name: "La Liga", country: "Espanha", compId: 6790, clubs: CLUBS.slice(4, 14) }];
  }
  newCareer(): void {}
  load(): boolean { return true; }
  hub(): HubVM {
    return { club: CLUBS[0], league: "Brasileirão Série A", compId: 1410, season: 2, dateLabel: "Março 2027", next: this.nextMatch(), tablePos: 3, pts: 16,
      played: 8, form: ["V", "V", "E", "D", "V"], money: this.cash, approval: 74, followers: "5,8 mil", lastPost: "@fla_noticias: \"Que vitória!\"",
      unread: 4, formation: "4-3-3", teamEnergy: 88, expiring: 2, offers: 3 };
  }
  squad(): PlayerVM[] { return this.sq; }
  player(id: number): PlayerVM | undefined { return [...this.sq, ...this.mk].find((p) => p.id === id); }
  private xi = this.sq.slice(0, 11).map((p) => p.id);
  private bench = this.sq.slice(11, 20).map((p) => p.id);
  private training: "leve" | "normal" | "forte" = "normal";
  private formation = "4-3-3";
  lineup() { return { formation: this.formation, formations: ["4-3-3", "4-4-2", "4-2-3-1", "3-5-2", "5-3-2"], xi: this.xi, bench: this.bench, training: this.training }; }
  setLineup(xi: number[], bench: number[], formation: string, training: "leve" | "normal" | "forte"): void { this.xi = xi; this.bench = bench; this.formation = formation; this.training = training; }
  autoLineup(): void { const s = [...this.sq].sort((a, b) => b.ovr * b.energy - a.ovr * a.energy); this.xi = s.slice(0, 11).map((p) => p.id); this.bench = s.slice(11, 20).map((p) => p.id); }
  market(f: { pos?: string; loans?: boolean }): PlayerVM[] { return this.mk.filter((p) => (!f.pos || p.pos === f.pos) && (!f.loans || p.loan)); }
  buy(id: number): string { const p = this.player(id); return p ? `Proposta enviada por ${p.name}.` : ""; }
  loanIn(id: number): string { const p = this.player(id); return p ? `Pedido de empréstimo por ${p.name} enviado.` : ""; }
  loanOut(id: number): string { const p = this.player(id); return p ? `${p.name} disponível para empréstimo.` : ""; }
  renewal(id: number): RenewalVM { const p = this.player(id)!; return { player: p, askWage: Math.round(p.wage * 1.2 * 10) / 10, askYears: 3, askRole: "Titular", tries: 0 }; }
  proposeRenewal(id: number, wage: number): { result: "aceita" | "contraproposta" | "recusa"; text: string } {
    const r = this.renewal(id);
    if (wage >= r.askWage) return { result: "aceita", text: `${r.player.name} renovou!` };
    if (wage >= r.askWage * 0.85) return { result: "contraproposta", text: `${r.player.name} pede ${this.money(r.askWage * 0.95 / 1000)}/sem.` };
    return { result: "recusa", text: `${r.player.name} recusou a proposta.` };
  }
  packs(): PackVM[] {
    return [
      { id: "jovem", name: "Pack Jovem Promessa", tier: "jovem", desc: "Até 21 anos com potencial 80+", price: 4.5, count: 2, odds: [["Potencial 80–84", 70], ["Potencial 85–89", 25], ["Potencial 90+", 5]] },
      { id: "ouro", name: "Pack Ouro 80+", tier: "ouro", desc: "1 jogador com geral 80 ou mais", price: 9.0, count: 1, odds: [["80–82", 72], ["83–85", 23], ["86+", 5]] },
      { id: "elite", name: "Pack Elite 85+", tier: "elite", desc: "1 jogador com geral 85 ou mais", price: 22.0, count: 1, odds: [["85–86", 70], ["87–89", 26], ["90+", 4]] },
      { id: "lenda", name: "Pack Lenda 90+", tier: "lenda", desc: "1 craque com geral 90 ou mais", price: 48.0, count: 1, odds: [["90–91", 80], ["92–93", 17], ["94+", 3]] },
    ];
  }
  openPack(id: string): { ok: boolean; msg: string; players: PlayerVM[]; refund: number } {
    const p = this.packs().find((x) => x.id === id)!;
    if (this.cash < p.price) return { ok: false, msg: "Caixa insuficiente para este pack.", players: [], refund: 0 };
    this.cash -= p.price;
    const min = { jovem: 74, ouro: 80, elite: 85, lenda: 90 }[p.tier];
    const got = Array.from({ length: p.count }, (_, i) => {
      const b = this.mk[(Math.random() * this.mk.length) | 0];
      return { ...b, id: 9000 + Math.floor(Math.random() * 9999), ovr: min + Math.floor(Math.random() * 4), age: p.tier === "jovem" ? 18 + i : b.age };
    });
    return { ok: true, msg: "", players: got, refund: 0 };
  }
  finance(): FinanceVM {
    return { cash: this.cash, seasonResult: 1.9, budget: 14.5, spent: 4.2, wageBill: 0.894, wageCap: 1.11, confidence: 82,
      income: [{ label: "Direitos de TV", value: 1.9 }, { label: "Patrocínio", value: 1.6 }, { label: "Bilheteria", value: 3.1 }, { label: "Premiações", value: 0.8 }, { label: "Vendas", value: 0 }],
      expense: [{ label: "Salários", value: -4.1 }, { label: "Comissão técnica", value: -0.55 }, { label: "Contratações", value: -4.2 }, { label: "Loja (packs)", value: -9 }],
      history: [26.8, 27.4, 28.9, 28.1, 29.6, 31.2, 30.4, 32.8, 34.1, this.cash],
      tx: Array.from({ length: 14 }, (_, i) => ({ day: `${22 - i}/02`, label: ["Bilheteria (43.405 pagantes)", "Folha salarial", "Cota de TV", "Patrocínio"][i % 4], value: [0.849, -0.511, 0.236, 0.194][i % 4] })) };
  }
  table(): TableRowVM[] {
    return [...CLUBS].sort((a, b) => b.str - a.str).map((c, i) => ({ pos: i + 1, club: c, p: 8, w: 6 - (i >> 2), d: 2, l: i >> 2, gf: 16 - i, ga: 6 + (i >> 1), pts: 20 - i, me: c.id === 0 }));
  }
  results() { return Array.from({ length: 8 }, (_, i) => ({ round: `Rodada ${8 - i}`, home: CLUBS[i], away: CLUBS[19 - i], hg: (i * 3) % 4, ag: (i * 5) % 3 })); }
  calendar() { return Array.from({ length: 8 }, (_, i) => ({ date: `${8 + i * 4}/03`, opp: CLUBS[(i * 3 + 1) % 20], home: i % 2 === 0, comp: i % 3 === 2 ? "Copa Libertadores" : "Brasileirão Série A", compId: i % 3 === 2 ? 7800 : 1410 })); }
  cups(): CupVM[] {
    const t = (a: number, b: number, sa: string, sb: string, w: 0 | 1 | -1): TieVM => ({ a: CLUBS[a], b: CLUBS[b], sa, sb, winner: w });
    return [{ name: "Copa Libertadores", compId: 7800, rounds: [
      { name: "Oitavas", ties: [t(0, 19, "3", "1", 0), t(1, 18, "2", "2 (4)", 1), t(2, 17, "1", "0", 0), t(3, 16, "0", "2", 1), t(4, 15, "2", "1", 0), t(5, 14, "1", "1 (3)", 0), t(6, 13, "3", "0", 0), t(7, 12, "0", "1", 1)] },
      { name: "Quartas", ties: [t(0, 18, "2", "1", 0), t(2, 16, "1", "1 (5)", 0), t(4, 5, "0", "1", 1), t(6, 12, "2", "0", 0)] },
      { name: "Semifinal", ties: [t(0, 2, "", "", -1), t(5, 6, "", "", -1)] }, { name: "Final", ties: [] }] }];
  }
  pressQuestions(): QuestionVM[] {
    return [{ q: "Vitória importante fora de casa. O que fez a diferença hoje?", answers: { humilde: "O grupo trabalhou muito a semana toda. Mérito deles.", confiante: "Somos o melhor time do campeonato e mostramos isso.", provocar: "O adversário só se defendeu. Faltou coragem.", desviar: "Prefiro analisar com calma antes de falar." } },
      { q: "A torcida pediu mais minutos para os garotos da base. Vai atender?", answers: { humilde: "A torcida tem razão, eles vão ter chances.", confiante: "Eu sei o momento certo de cada um.", provocar: "Quem escala sou eu, não a arquibancada.", desviar: "Vamos ver jogo a jogo." } }];
  }
  answerPress(tone: string): { meters: Record<string, number>; reaction: string } {
    const d: Record<string, Record<string, number>> = { humilde: { diretoria: 2, torcida: 3, elenco: 4, imprensa: 3 }, confiante: { diretoria: 3, torcida: 4, elenco: 2, imprensa: -1 },
      provocar: { diretoria: -3, torcida: 6, elenco: 1, imprensa: -6 }, desviar: { diretoria: 0, torcida: -2, elenco: 0, imprensa: -2 } };
    for (const k of Object.keys(this.m)) this.m[k] = Math.max(0, Math.min(100, this.m[k] + (d[tone]?.[k] ?? 0)));
    return { meters: { ...this.m }, reaction: tone === "provocar" ? "A resposta viralizou e dividiu opiniões." : "A resposta foi bem recebida." };
  }
  social(tab: number): PostVM[] {
    const all: PostVM[] = [
      { user: "fla_noticias", kind: "torcida", text: "Que vitória! Time com cara de campeão.", likes: 812, when: "hoje" },
      { user: "chorao_da_geral", kind: "corneta", text: "Ganhou, mas sofreu demais no fim. Tem que mexer antes.", likes: 274, when: "hoje" },
      { user: "CanalDoTorcedor", kind: "imprensa", text: "Flamengo vence e encosta no G4.", likes: 132, when: "hoje", verified: true },
      { user: "rival_fc", kind: "rival", text: "Juiz ajudou de novo, né?", likes: 95, when: "hoje" },
      { user: "torcida_fla96", kind: "torcida", text: "Arrascaeta é outro nível. Renova logo!", likes: 640, when: "ontem" },
      { user: "jornal_esportivo", kind: "imprensa", text: "Técnico confia no elenco: 'esse time sabe o que quer'.", likes: 120, when: "há 2 dias", verified: true },
    ];
    const kinds = ["", "torcida", "corneta", "imprensa", "rival"];
    const out = tab ? all.filter((p) => p.kind === kinds[tab]) : all;
    return Array.from({ length: 6 }, () => out).flat();
  }
  meters(): Record<string, number> { return { ...this.m }; }
  nextMatch(): MatchInfoVM | null { return { home: CLUBS[0], away: CLUBS[1], comp: "Brasileirão Série A", compId: 1410, stage: "Rodada 9", date: "15/03" }; }
  playMatch(r?: { hg: number; ag: number }): MatchResultVM {
    const hg = r?.hg ?? 2, ag = r?.ag ?? 1;
    return { home: CLUBS[0], away: CLUBS[1], hg, ag, scorers: [{ min: 23, name: "Pedro", home: true }, { min: 58, name: "Flaco López", home: false }, { min: 81, name: "de Arrascaeta", home: true }].slice(0, hg + ag),
      stats: [["Posse de bola (%)", 54, 46], ["Chutes", 14, 9], ["Chutes no gol", 6, 3], ["Faltas", 11, 14], ["Escanteios", 6, 3], ["Cartões amarelos", 2, 3]] };
  }
  simulateMatch(): MatchResultVM { return this.playMatch(); }
  seasonOver(): boolean { return false; }
  seasonSummary() { return { pos: 2, champion: CLUBS[1], prize: 12.4, topScorer: "Pedro (21 gols)", titles: ["Copa do Brasil"] }; }
  newSeason(): void {}
}
