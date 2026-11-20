import type { Game } from "./game";
import { Rng, clamp } from "../data/rng";

export const TONES = ["humilde", "confiante", "provocar", "desviar"] as const;
export type Tone = typeof TONES[number];
const FEED_MAX = 60;

export interface Post { id: number; user: string; kind: string; text: string; likes: number; day: number; reply?: string; reply_kind?: string }
export interface Question { cat: string; q: string; a: Record<string, string> }

/**
 * Coletiva pós-jogo e redes sociais (porte de media.gd). Sorteio próprio: as respostas
 * e os posts não mexem nos resultados das partidas.
 */
export class Media {
  readonly R = new Rng(7);
  constructor(private g: Game) {}
  cfg(): Record<string, any> { return this.g.data.media ?? {}; }
  private pick<T>(arr: T[] | undefined, fallback: T): T { return arr && arr.length ? arr[this.R.randiRange(0, arr.length - 1)] : fallback; }

  st(): any {
    const S = this.g.S;
    if (!S.clubs) return {};
    if (!S.media || typeof S.media !== "object") {
      S.media = { v: 1, diretoria: 60, moral: 60, imprensa: 50, seguidores: 1200 + Math.floor(this.g.myClub().str * 40),
        aprovacao: 55, feed: [], next: 1, trending: [], streak: 0, pending: {}, log: [], news_seen: 0, interviews: 0, skipped: 0 };
    }
    return S.media;
  }
  isPro(): boolean { return this.g.pro.isPro() && this.g.pro.P().stage === "carreira"; }

  meter(key: string): number {
    const s = this.st();
    if (key === "torcida") return this.isPro() ? Number(this.g.pro.P().fans) : Number(this.g.S.support ?? 50);
    if (key === "diretoria" && this.isPro()) return Number(this.g.pro.P().coach ?? 50);
    return Number(s[key] ?? 50);
  }

  addMeter(key: string, d: number): void {
    if (d === 0) return;
    const s = this.st();
    const pr = this.isPro() ? this.g.pro.P() : null;
    if (key === "torcida") {
      if (pr) pr.fans = clamp(pr.fans + d, 0, 100);
      else this.g.S.support = clamp(this.g.S.support + Math.round(d), 0, 100);
    } else if (key === "diretoria") {
      if (pr) pr.coach = clamp((pr.coach ?? 50) + d, 0, 100);
      else s.diretoria = clamp(s.diretoria + d, 0, 100);
    } else if (key === "moral") {
      s.moral = clamp(s.moral + d, 0, 100);
      if (!pr) for (const p of this.g.squad(this.g.S.club)) p.energy = clamp(p.energy + d * 0.6, 20, 100);
    } else s[key] = clamp(Number(s[key] ?? 50) + d, 0, 100);
  }

  approval(): number {
    const s = this.st();
    return clamp(this.meter("torcida") * 0.4 + this.meter("diretoria") * 0.3 + s.imprensa * 0.15 + s.moral * 0.15, 0, 100);
  }

  lastView(): any {
    const lu = this.g.S.last_user;
    if (!lu) return null;
    const me = this.g.S.club;
    const home = lu.h === me;
    const gf = home ? lu.hg : lu.ag, ga = home ? lu.ag : lu.hg;
    const pens: number[] = lu.pens ?? [];
    let won = gf > ga, lost = gf < ga;
    if (gf === ga && pens.length === 2) {
      const pf = home ? pens[0] : pens[1], pa = home ? pens[1] : pens[0];
      won = pf > pa; lost = pf < pa;
    }
    const side = home ? 0 : 1;
    let cards = 0, red = 0;
    const st = lu.st ?? [];
    if (st.length >= 6) { cards = st[4][side] + st[5][side] + st[4][1 - side] + st[5][1 - side]; red = st[5][0] + st[5][1]; }
    let top = "", topG = 0;
    const count: Record<string, number> = {};
    for (const s of lu.sc ?? []) {
      if (s.side === side) { count[s.name] = (count[s.name] ?? 0) + 1; if (count[s.name] > topG) { topG = count[s.name]; top = s.name; } }
    }
    return { mine: me, opp: home ? lu.a : lu.h, gf, ga, won, lost, draw: !won && !lost, margin: gf - ga, cards, red,
      kind: lu.kind ?? "league", comp: lu.comp ?? "", stage: lu.label ?? "", top, top_g: topG, placar: `${gf} x ${ga}`, day: lu.day ?? this.g.S.day };
  }

  fill(t: string, v: any, extra: Record<string, unknown> = {}): string {
    const who = this.isPro() ? this.g.pro.me().name : this.g.S.coach.name;
    let out = t.split("{t}").join(who).split("{c}").join(this.g.clubName(this.g.S.club));
    if (v) {
      out = out.split("{r}").join(this.g.clubName(v.opp)).split("{placar}").join(v.placar).split("{fase}").join(v.stage)
        .split("{copa}").join(v.comp).split("{cartoes}").join(String(v.cards)).split("{p}").join(v.top || this.g.clubName(this.g.S.club))
        .split("{pos}").join(String(this.g.positionOf(this.g.S.club)));
    }
    for (const k of Object.keys(extra)) out = out.split(`{${k}}`).join(String(extra[k]));
    return out;
  }

  buildInterview(): Question[] {
    const v = this.lastView();
    if (!v) return [];
    const P = this.cfg().perguntas ?? {};
    const cats: string[] = [];
    if (this.isPro()) {
      const last = this.g.pro.P().last ?? {};
      const r = Number(last.rating ?? -1);
      if ((last.min ?? 0) < 30) cats.push("pro_banco");
      else if (r >= 7.3) cats.push("pro_nota_boa");
      else if (r >= 0 && r < 6) cats.push("pro_nota_ruim");
      else cats.push("pro_regular");
      if ((last.gol ?? 0) > 0) cats.push("pro_gol");
    }
    if (v.won) cats.push(v.margin >= 3 ? "goleada" : "vitoria");
    else if (v.lost) cats.push(v.margin <= -3 ? "derrota_pesada" : "derrota");
    else cats.push("empate");
    if (!this.isPro() && v.top && (v.top_g >= 2 || v.won)) cats.push("destaque");
    if (v.cards >= 5 || v.red > 0) cats.push("arbitragem");
    if (v.kind === "cup") cats.push("copa");
    else if (!this.isPro()) {
      const pos = this.g.positionOf(this.g.S.club);
      const oppPos = v.opp < this.g.nLeague() ? this.g.positionOf(v.opp) : 99;
      const n = this.g.nLeague();
      if (Math.abs(pos - oppPos) <= 2) cats.push("confronto_direto");
      if (pos <= 3 && this.g.myClub().j >= 5) cats.push("topo");
      else if (pos > n - 4 && this.g.myClub().j >= 5) cats.push("rebaixamento");
    }
    const out: Question[] = [];
    const seen = new Set<string>();
    for (const c of cats) {
      if (seen.has(c) || !P[c]) continue;
      seen.add(c);
      const q = this.pick<any>(P[c], { texto: "...", respostas: {} });
      const answers: Record<string, string> = {};
      for (const tone of TONES) answers[tone] = this.fill(String(q.respostas?.[tone] ?? "..."), v);
      out.push({ cat: c, q: this.fill(String(q.texto), v), a: answers });
      if (out.length >= 3) break;
    }
    return out;
  }

  effects(tone: string, v: any): Record<string, number> {
    const C = this.cfg();
    const e: Record<string, number> = { ...(C.tons?.[tone]?.efeitos ?? {}) };
    if (v?.lost) { const adj = C.derrota_ajuste?.[tone] ?? {}; for (const k of Object.keys(adj)) e[k] = (e[k] ?? 0) + Number(adj[k]); }
    if (tone === "provocar" && v?.won) e.torcida = (e.torcida ?? 0) + 2;
    return e;
  }

  pending(): any { return this.g.S.clubs ? this.st().pending ?? {} : {}; }
  hasInterview(): boolean { const p = this.pending(); return !!p && Array.isArray(p.qs) && (p.i ?? 0) < p.qs.length; }
  /** Pergunta atual da coletiva (ou null). */
  currentQuestion(): Question | null { return this.hasInterview() ? this.pending().qs[this.pending().i] : null; }

  answer(tone: Tone): { efeitos: Record<string, number>; texto: string } | null {
    if (!this.hasInterview() || !TONES.includes(tone)) return null;
    const s = this.st();
    const p = s.pending;
    const q: Question = p.qs[p.i];
    const v = this.lastView();
    const e = this.effects(tone, v);
    const applied: Record<string, number> = {};
    for (const k of ["diretoria", "torcida", "moral", "imprensa"]) {
      const d = Number(e[k] ?? 0);
      if (this.isPro() && k === "moral") continue;
      this.addMeter(k, d);
      if (d !== 0) applied[k] = d;
    }
    const gain = Math.floor(Number(e.seguidores ?? 1) * (40 + s.seguidores * 0.004) * (v?.won ? 1.6 : 1));
    this.addFollowers(gain);
    applied.seguidores = gain;
    s.log.unshift({ day: this.g.S.day, cat: q.cat, tone, q: q.q, a: q.a[tone] });
    while (s.log.length > 20) s.log.pop();
    p.i++;
    p.tones.push(tone);
    const RX = this.cfg().social?.reacao ?? {};
    const nreact = tone === "provocar" ? 2 : 1;
    for (let k2 = 0; k2 < nreact; k2++) {
      let kind = "fa";
      if (tone === "provocar") kind = k2 === 1 ? "rival" : this.R.randf() < 0.6 ? "fa" : "hater";
      else if (tone === "desviar") kind = "hater";
      this.post(kind, this.fill(String(this.pick(RX[tone], "...")), v));
    }
    if (tone === "provocar") this.addTag(this.fill(String(this.cfg().social?.tags_coletiva?.provocar ?? "Coletiva"), v));
    if (p.i >= p.qs.length) this.closeInterview();
    return { efeitos: applied, texto: this.summary(applied) };
  }

  skipInterview(): void {
    if (!this.hasInterview()) return;
    const s = this.st();
    s.skipped++;
    this.addMeter("imprensa", -2);
    this.post("jornalista", this.fill(String(this.pick(this.cfg().social?.reacao?.pulou, "...")), this.lastView()));
    s.pending = {};
    this.g.save();
  }

  private closeInterview(): void {
    const s = this.st();
    const tones: string[] = s.pending.tones ?? [];
    s.interviews++;
    let best = "", bc = 0;
    for (const t of TONES) { const c = tones.filter((x) => x === t).length; if (c > bc) { bc = c; best = t; } }
    if (best) {
      const heads: Record<string, string> = { humilde: "{t} assume responsabilidade e elogia o grupo", confiante: "{t} confiante: 'esse time sabe o que quer'",
        provocar: "{t} provoca o {r} e esquenta a semana", desviar: "{t} evita polêmica na coletiva" };
      this.post("jornalista", this.fill(heads[best], this.lastView()));
    }
    s.pending = {};
    this.g.save();
  }

  private summary(applied: Record<string, number>): string {
    const names: Record<string, string> = { diretoria: this.isPro() ? "Técnico" : "Diretoria", torcida: "Torcida", moral: "Elenco", imprensa: "Imprensa" };
    const parts: string[] = [];
    for (const k of ["diretoria", "torcida", "moral", "imprensa"]) if (k in applied) parts.push(`${names[k]} ${applied[k] > 0 ? "+" : ""}${Math.trunc(applied[k])}`);
    parts.push(`+${applied.seguidores ?? 0} seguidores`);
    return parts.join("  •  ");
  }

  feed(): Post[] { return this.isPro() ? this.g.pro.P().feed ?? [] : this.st().feed ?? []; }

  private handle(kind: string, v: any): string {
    const S = this.cfg().social ?? {};
    const poolKey: Record<string, string> = { fa: "torcedores", hater: "haters", jornalista: "jornalistas", rival: "rivais" };
    let u = String(this.pick(S[poolKey[kind] ?? "torcedores"], "torcedor"));
    const cs = this.g.myClub().short.toLowerCase();
    let rs = cs;
    if (v) rs = v.opp >= 0 && v.opp < this.g.S.clubs.length ? this.g.club(v.opp).short.toLowerCase() : "rival";
    u = u.split("{c}").join(cs).split("{r}").join(rs);
    if (kind !== "jornalista" && this.R.randf() < 0.35) u += String(this.R.randiRange(2, 99));
    return "@" + u;
  }

  post(kind: string, text: string): void {
    for (const recent of this.feed().slice(0, 6)) if (recent.text === text) return;
    if (this.isPro()) {
      const pk = ({ fa: "elogio", hater: "xingamento", jornalista: "manchete", rival: "zoeira" } as Record<string, string>)[kind] ?? "neutro";
      this.g.pro.newPost(this.handle(kind, this.lastView()), text, pk, this.g.pro.likes(kind === "hater" ? 1.2 : 1));
      return;
    }
    const s = this.st();
    const likes = Math.floor((15 + s.seguidores * this.R.randfRange(0.004, 0.03)) * (["hater", "rival"].includes(kind) ? 1.5 : 1));
    s.feed.unshift({ id: s.next, user: this.handle(kind, this.lastView()), kind, text, likes, day: this.g.S.day });
    s.next++;
    while (s.feed.length > FEED_MAX) s.feed.pop();
  }

  addFollowers(n: number): void {
    if (this.isPro()) this.g.pro.P().followers = Math.max(this.g.pro.P().followers + n, 0);
    else this.st().seguidores = Math.max(this.st().seguidores + n, 0);
  }
  followers(): number { return this.isPro() ? this.g.pro.P().followers : this.st().seguidores; }

  private addTag(tag: string): void {
    const s = this.st();
    tag = tag.replace(/[ .\-]/g, "");
    s.trending = s.trending.filter((x: string) => x !== tag);
    s.trending.unshift(tag);
    while (s.trending.length > 5) s.trending.pop();
  }

  /** Depois de cada jogo do usuário: sequência, posts, assuntos e a coletiva pendente. */
  afterMatch(): void {
    if (!this.g.S.clubs) return;
    if (this.g.pro.isPro() && !this.isPro()) return;
    const v = this.lastView();
    if (!v) return;
    const s = this.st();
    const S = this.cfg().social ?? {};
    let stk = s.streak;
    stk = v.won ? Math.max(stk, 0) + 1 : Math.min(stk, 0) - 1;
    s.streak = stk;
    const bad = Math.max(-stk, 0);
    this.addFollowers(Math.floor((30 + this.followers() * 0.006) * (v.won ? 2 : v.draw ? 0.6 : 0.3)));
    if (!this.isPro()) {
      this.addMeter("diretoria", v.won ? 2 : v.draw ? -0.5 : -3 - (v.margin <= -3 ? 2 : 0));
      s.moral = clamp(s.moral + (v.won ? 3 : v.draw ? 0 : -3), 0, 100);
      if (s.diretoria < 20 && this.R.randf() < 0.5) {
        this.g.addNews("Diretoria impaciente", `A confiança no trabalho de ${this.g.S.coach.name} está baixa. Os próximos jogos serão decisivos.`);
      }
      const jk = v.won ? "jornalista_vitoria" : v.draw ? "jornalista_empate" : "jornalista_derrota";
      this.post("jornalista", this.fill(String(this.pick(S[jk], "...")), v));
      const nPosts = 3 + Math.min(bad, 3);
      let haterShare = v.won ? 0.15 : v.draw ? 0.4 : 0.55;
      haterShare = clamp(haterShare + 0.08 * bad - (s.imprensa - 50) * 0.002, 0.05, 0.9);
      for (let k = 0; k < nPosts; k++) {
        if (this.R.randf() < haterShare) {
          const pool = bad >= 3 && this.R.randf() < 0.5 ? S.hater_sequencia ?? [] : S[v.won ? "hater_geral" : "hater_derrota"] ?? ["..."];
          const tag = this.fill(String(this.pick(S.tags_ruins, "Crise")), v);
          this.post("hater", this.fill(String(this.pick(pool, "...")), v, { n: bad, tag }));
        } else {
          this.post("fa", this.fill(String(this.pick(S[v.won ? "fa_vitoria" : v.draw ? "fa_empate" : "fa_derrota"], "...")), v));
        }
      }
      if (stk >= 3) this.post("fa", this.fill(String(this.pick(S.sequencia_vitorias, "...")), v, { n: stk }));
    }
    if (v.lost || (v.won && this.R.randf() < 0.5)) this.post("rival", this.fill(String(this.pick(S[v.lost ? "rival_zoeira" : "rival_choro"], "...")), v));
    if (stk >= 2) this.addTag(this.fill(String(this.pick(S.tags_boas, "Embalado")), v));
    else if (bad >= 3) this.addTag(this.fill(String(this.pick(S.tags_ruins, "Crise")), v));
    this.reactTransfers();
    s.aprovacao = this.approval();
    s.pending = { qs: this.buildInterview(), i: 0, tones: [], day: v.day };
    this.g.save();
  }

  private reactTransfers(): void {
    if (this.isPro()) return;
    const s = this.st();
    const S = this.cfg().social ?? {};
    const seen = s.news_seen ?? 0;
    let newest = seen, made = 0;
    const cn = this.g.clubName(this.g.S.club);
    for (const n of this.g.S.news ?? []) {
      if (n.day <= seen) break;
      newest = Math.max(newest, n.day);
      if (made >= 2) continue;
      if (n.t === "Reforço confirmado") {
        this.post("fa", String(this.pick(S.contratacao, "...")).split("{p}").join(n.x.split(" (")[0]).split("{c}").join(cn));
        made++;
      } else if (n.t === "Venda concluída") {
        this.post(this.R.randf() < 0.5 ? "hater" : "fa", String(this.pick(S.venda, "...")).split("{p}").join(n.x.split(" foi vendido")[0]).split("{c}").join(cn));
        made++;
      }
    }
    s.news_seen = newest;
  }
}
