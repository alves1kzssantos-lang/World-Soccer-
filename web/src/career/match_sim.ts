import type { Game } from "./game";
import { FORMATIONS } from "./game";
import type { Player, Scorer, Stats } from "./state";
import { Rng, hashOf, clamp } from "../data/rng";

export interface SimEvent {
  type: "goal" | "chance" | "card" | "sub" | "lance";
  side: number; text: string; min: number; name?: string; red?: boolean;
}
/** Resultado de um lance jogado em campo (vem da partida ao vivo). */
export interface LanceResult { goal: boolean; kind: string; pid: number; apid?: number; pen?: boolean }

const SCORE_W: Record<string, number> = { AC: 8.0, PD: 5.5, PE: 5.5, MEI: 4.0, VOL: 1.6, LD: 0.8, LE: 0.8, ZAG: 0.9, GOL: 0.0 };
const ASSIST_W: Record<string, number> = { AC: 3.0, PD: 6.0, PE: 6.0, MEI: 6.5, VOL: 3.0, LD: 3.0, LE: 3.0, ZAG: 0.8, GOL: 0.2 };

/**
 * Simulação de uma partida minuto a minuto (porte de match_sim.gd), com árbitro: faltas, cartões,
 * expulsões, impedimentos e pênaltis. Chame step() até `finished`.
 */
export class MatchSim {
  score = [0, 0];
  minute = 0;
  finished = false;
  att = [0, 0]; shots = [0, 0]; poss = [0, 0];
  scorers: Scorer[] = [];
  r: { def: number; mei: number; atq: number; ger: number }[] = [];
  mins: Record<number, number> = {};
  subs = [0, 0];
  subWindows = [0, 0];
  private lastSubMin = [-1, -1];
  aiSides = [true, true];
  benchIds: number[][] = [[], []];
  private subRng = new Rng();
  out: number[] = [];
  origXi: number[][] = [];
  interactive = false;
  pending: { side?: number; pg?: number } = {};
  fouls = [0, 0]; yellows = [0, 0]; reds = [0, 0]; offsides = [0, 0];
  cards: Record<number, number> = {};
  sentOff: number[] = [];
  penaltyScored = false;
  penalties = [0, 0];
  lastSide = 0;
  focusPid = -1;
  focusSide = -1;
  focusSubMin = -1;
  me = { lances: 0, on: 0, off: 0, lost: 0, offside: 0 };

  constructor(readonly g: Game, readonly h: number, readonly a: number) {
    g.validateXi(h);
    g.validateXi(a);
    this.origXi = [g.club(h).xi.slice(), g.club(a).xi.slice()];
    this.subRng.setSeed(hashOf(h, a, g.S.day ?? 0, g.S.season ?? 1));
    for (let sd = 0; sd < 2; sd++) this.benchIds[sd] = g.bench(this.cid(sd)).map((p) => p.id);
    if (g.pro.isPro() && (h === g.S.club || a === g.S.club)) g.pro.setupSim(this);
    g.curSim = this;
    this.refresh();
  }

  private get rng(): Rng { return this.g.rng; }
  private tf(k: string, f: number): number { return this.g.tf("arbitro", k, f); }

  refresh(): void {
    this.r = [this.g.ratings(this.h), this.g.ratings(this.a)];
    const loss = this.tf("perda_forca_expulsao", 0.09);
    for (let side = 0; side < 2; side++) {
      if (this.reds[side] > 0) {
        const f = Math.max(1 - loss * this.reds[side], 0.6);
        const rr = this.r[side];
        rr.def = Math.round(rr.def * f); rr.mei = Math.round(rr.mei * f); rr.atq = Math.round(rr.atq * f); rr.ger = Math.round(rr.ger * f);
      }
    }
  }

  stats(): Stats {
    return [this.att.slice(), this.shots.slice(), this.poss.slice(), this.fouls.slice(), this.yellows.slice(), this.reds.slice(), this.offsides.slice()];
  }

  isOutOfPlay(pid: number): boolean { return this.sentOff.includes(pid); }
  addFoul(side: number): void { this.fouls[side]++; }

  /** Dá um cartão. Devolve true se o jogador foi expulso (vermelho ou segundo amarelo). */
  giveCard(side: number, pid: number, color: "amarelo" | "vermelho"): boolean {
    if (this.sentOff.includes(pid)) return false;
    if (color === "amarelo") {
      this.cards[pid] = (this.cards[pid] ?? 0) + 1;
      this.yellows[side]++;
      if (this.cards[pid] < 2) return false;
    }
    this.sentOff.push(pid);
    this.reds[side]++;
    this.refresh();
    return true;
  }

  cid(side: number): number { return side === 0 ? this.h : this.a; }
  possession(side: number): number {
    const t = this.poss[0] + this.poss[1];
    if (t === 0) return 50;
    const ph = Math.round(100 * this.poss[0] / t);
    return side === 0 ? ph : 100 - ph;
  }

  private pick(side: number, weights: Record<string, number>, skip = -1): Player {
    const xi = this.g.club(this.cid(side)).xi;
    let total = 0;
    const ws: number[] = [];
    for (const pid of xi) {
      const p = this.g.player(pid);
      const w = pid === skip || this.sentOff.includes(pid) ? 0 : (weights[p.pos] ?? 0) * Math.pow(p.ovr / 70, 2);
      ws.push(w); total += w;
    }
    let x = this.rng.randf() * total;
    if (total <= 0) return this.g.player(xi[0]);
    for (let i = 0; i < xi.length; i++) { x -= ws[i]; if (x <= 0) return this.g.player(xi[i]); }
    return this.g.player(xi[xi.length - 1]);
  }

  private cardForFoul(): "" | "amarelo" | "vermelho" {
    const r = this.rng.randf();
    if (r < this.tf("chance_vermelho_direto", 0.025)) return "vermelho";
    if (r < this.tf("chance_amarelo_na_falta", 0.22)) return "amarelo";
    return "";
  }

  /** Um minuto de jogo. Devolve os lances: goal, chance, card, sub ou "lance" (chance a ser jogada em campo). */
  step(): SimEvent[] {
    const ev: SimEvent[] = [];
    if (this.finished) return ev;
    this.minute++;
    this.aiSubs(ev);
    if (this.minute === this.focusSubMin) {
      const t = this.focusSub();
      if (t) ev.push({ type: "sub", side: this.focusSide, text: t, min: this.minute });
    }
    for (let side = 0; side < 2; side++) {
      for (const pid of this.g.club(this.cid(side)).xi) if (!this.sentOff.includes(pid)) this.mins[pid] = (this.mins[pid] ?? 0) + 1;
    }
    if (this.minute % 15 === 0) this.refresh();
    const fpm = this.tf("faltas_por_minuto_por_time", 0.13);
    for (let fs = 0; fs < 2; fs++) if (this.rng.randf() < fpm) ev.push(...this.midfieldFoul(fs));
    const mh = this.r[0].mei * 1.03, ma = this.r[1].mei;
    const side = this.rng.randf() < mh / (mh + ma) ? 0 : 1;
    this.poss[side]++;
    this.lastSide = side;
    if (this.rng.randf() < 0.30) {
      this.att[side]++;
      const o = 1 - side;
      let ratio = this.r[side].atq / Math.max(this.r[o].def, 1);
      if (side === 0) ratio *= 1.04;
      const cname = this.g.club(this.cid(side)).name;
      let live = this.interactive && (this.focusPid < 0 || side === this.focusSide);
      if (!live && this.rng.randf() < this.tf("chance_impedimento_ataque_simulado", 0.06)) {
        this.offsides[side]++;
        ev.push({ type: "chance", side, text: `Impedimento marcado contra o ${cname}.`, min: this.minute });
      } else if (!live && this.rng.randf() < this.tf("chance_penalti_ataque_simulado", 0.022)) {
        ev.push(...this.simPenalty(side));
      } else if (this.rng.randf() < clamp(0.36 * ratio, 0.1, 0.7)) {
        this.shots[side]++;
        const pg = clamp(0.26 * Math.pow(ratio, 1.6), 0.08, 0.6);
        if (live && this.focusPid >= 0 && !this.focusInvolved()) live = false;
        if (live) {
          if (this.focusPid >= 0) this.me.lances++;
          this.pending = { side, pg };
          ev.push({ type: "lance", side, text: "", min: this.minute });
        } else {
          const sc = this.pick(side, SCORE_W);
          if (this.rng.randf() < pg) {
            let apid = 0;
            if (this.rng.randf() < 0.72) apid = this.pick(side, ASSIST_W, sc.id).id;
            ev.push(this.goal(side, sc.id, apid));
          } else {
            const opts = ["%s finaliza e o goleiro defende!", "%s chuta por cima do gol.", "%s bate cruzado, raspa a trave!", "%s cabeceia para fora."];
            ev.push({ type: "chance", side, text: this.rng.pick(opts).replace("%s", sc.name), min: this.minute });
          }
        }
      } else if (this.rng.randf() < 0.35) {
        const opts2 = ["%s chega com perigo, mas a zaga corta.", "Boa troca de passes do %s.", "%s pressiona a saída de bola."];
        ev.push({ type: "chance", side, text: this.rng.pick(opts2).replace("%s", cname), min: this.minute });
      }
    }
    if (this.minute >= 90) this.finished = true;
    return ev;
  }

  private goal(side: number, pid: number, apid: number): SimEvent {
    const sc = this.g.player(pid);
    const cname = this.g.club(this.cid(side)).name;
    this.score[side]++;
    const g: Scorer = { min: this.minute, side, pid, name: sc.name, apid: 0, aname: "" };
    let txt = `GOL do ${cname}! ${sc.name} marca.`;
    if (apid > 0) {
      g.apid = apid;
      g.aname = this.g.player(apid).name;
      txt = `GOL do ${cname}! ${sc.name} marca com passe de ${g.aname}.`;
    }
    this.scorers.push(g);
    return { type: "goal", side, text: txt, name: sc.name, min: this.minute };
  }

  private midfieldFoul(fs: number): SimEvent[] {
    this.fouls[fs]++;
    const color = this.cardForFoul();
    if (!color) return [];
    const p = this.pick(fs, { AC: 1.0, PD: 1.0, PE: 1.0, MEI: 1.6, VOL: 2.4, LD: 1.8, LE: 1.8, ZAG: 2.2, GOL: 0.05 });
    if (color === "amarelo" && (this.cards[p.id] ?? 0) > 0 && this.rng.randf() < this.tf("cuidado_com_amarelo", 0.75)) return [];
    const off = this.giveCard(fs, p.id, color);
    const short = this.g.club(this.cid(fs)).short;
    const txt = off ? `EXPULSO! ${p.name} (${short}) recebe o vermelho.` : `Cartão amarelo para ${p.name} (${short}).`;
    return [{ type: "card", side: fs, text: txt, min: this.minute, red: off }];
  }

  private simPenalty(side: number): SimEvent[] {
    const o = 1 - side;
    this.fouls[o]++;
    this.penalties[side]++;
    const ev: SimEvent[] = [];
    const color = this.cardForFoul();
    if (color) {
      const d = this.pick(o, { AC: 0.1, PD: 0.2, PE: 0.2, MEI: 0.6, VOL: 1.5, LD: 1.5, LE: 1.5, ZAG: 3.0, GOL: 0.6 });
      const off = this.giveCard(o, d.id, color);
      ev.push({ type: "card", side: o, text: off ? `EXPULSO! ${d.name} comete o pênalti.` : `Amarelo para ${d.name} no lance do pênalti.`, min: this.minute, red: off });
    }
    const taker = this.pick(side, SCORE_W);
    this.shots[side]++;
    if (this.rng.randf() < this.tf("chance_gol_penalti_simulado", 0.76)) {
      const g = this.goal(side, taker.id, 0);
      g.text = "PÊNALTI! " + g.text;
      ev.push(g);
    } else {
      ev.push({ type: "chance", side, text: `PÊNALTI para o ${this.g.club(this.cid(side)).name}... ${taker.name} perde!`, min: this.minute });
    }
    return ev;
  }

  /** Resultado sorteado para o lance da máquina (mantém o equilíbrio do jogo). */
  lanceScript(): "goal" | "save" | "out" | "lost" | "offside" | "penalty" {
    const pen = this.tf("chance_penalti_ataque_simulado", 0.022) * 4;
    if (this.rng.randf() < pen) {
      this.penaltyScored = this.rng.randf() < this.tf("chance_gol_penalti_simulado", 0.76);
      return "penalty";
    }
    if (this.rng.randf() < (this.pending.pg ?? 0.25)) return "goal";
    if (this.rng.randf() < this.tf("chance_impedimento_ataque_simulado", 0.06) * 2) return "offside";
    const x = this.rng.randf();
    if (x < 0.45) return "save";
    if (x < 0.7) return "out";
    return "lost";
  }

  /** Recebe o resultado do lance jogado em campo. */
  resolveLance(res: LanceResult): SimEvent {
    const side = this.pending.side ?? 0;
    this.pending = {};
    if (res.pen) this.penalties[side]++;
    if (res.kind === "offside") this.offsides[side]++;
    if (res.goal) {
      const g = this.goal(side, res.pid, res.apid ?? 0);
      if (res.pen) g.text = "PÊNALTI! " + g.text;
      return g;
    }
    if (this.focusPid >= 0 && res.pid === this.focusPid) {
      if (res.kind === "save") this.me.on++;
      else if (res.kind === "out" || res.kind === "blocked") this.me.off++;
      else if (res.kind === "lost") this.me.lost++;
      else if (res.kind === "offside") this.me.offside++;
    }
    const nm = this.g.player(res.pid)?.name ?? "Jogador";
    const texts: Record<string, string> = { save: "%s finaliza e o goleiro defende!", out: "%s finaliza para fora.", lost: "%s perde a bola na hora H.",
      offside: "%s estava impedido.", blocked: "Chute de %s travado pela zaga." };
    return { type: "chance", side, text: (texts[res.kind] ?? "%s perde a chance.").replace("%s", nm), min: this.minute };
  }

  maxSubs(): number { return Number(this.g.contracts.cfg("banco", "substituicoes_max", 5)); }
  maxWindows(): number { return Number(this.g.contracts.cfg("banco", "paradas_max", 3)); }
  private newWindow(side: number): boolean { return this.minute !== this.lastSubMin[side] && this.minute !== 45 && this.minute !== 0; }

  substitute(side: number, slot: number, inPid: number, checkBench = true): string {
    if (this.subs[side] >= this.maxSubs()) return `Você já fez as ${this.maxSubs()} substituições.`;
    if (this.out.includes(inPid)) return "Esse jogador já saiu da partida.";
    const xi = this.g.club(this.cid(side)).xi;
    if (slot < 0 || slot >= xi.length) return "Escolha quem sai.";
    if (this.sentOff.includes(xi[slot])) return "Jogador expulso não pode ser substituído.";
    if (xi.includes(inPid)) return "Esse jogador já está em campo.";
    if (checkBench && !this.benchIds[side].includes(inPid)) return "Só entram jogadores relacionados no banco.";
    if (this.newWindow(side)) {
      if (this.subWindows[side] >= this.maxWindows()) return `Você já usou as ${this.maxWindows()} paradas para substituir (só no intervalo ou junto com outra troca).`;
      this.subWindows[side]++;
      this.lastSubMin[side] = this.minute;
    }
    this.out.push(xi[slot]);
    xi[slot] = inPid;
    this.subs[side]++;
    this.refresh();
    return "";
  }

  benchPlayers(side: number): Player[] {
    const xi = this.g.club(this.cid(side)).xi;
    return this.benchIds[side].filter((pid) => this.g.S.players[pid] && !xi.includes(pid)).map((pid) => this.g.player(pid));
  }

  liveEnergy(pid: number): number { return this.g.fitness.live(this.g.player(pid), this.mins[pid] ?? 0); }

  private aiSubs(ev: SimEvent[]): void {
    const at = (this.g.contracts.cfg("banco", "ia_minutos", [58, 68, 78]) as number[]).map(Number);
    if (!at.includes(this.minute)) return;
    for (let side = 0; side < 2; side++) {
      if (!this.aiSides[side] || (this.focusPid >= 0 && side === this.focusSide)) continue;
      const c = this.cid(side);
      const xi = this.g.club(c).xi;
      const slots = FORMATIONS[this.g.club(c).formation];
      const losing = this.score[side] < this.score[1 - side];
      let done = 0;
      const want = this.minute === at[0] ? this.subRng.randiRange(1, 2) : (this.subRng.randf() < (losing ? 0.9 : 0.6) ? 1 : 0);
      while (done < want && this.subs[side] < this.maxSubs()) {
        let worst = -1, we = 101;
        for (let i = 0; i < xi.length; i++) {
          const pid = xi[i];
          if (this.sentOff.includes(pid) || (slots[i][0] === "GOL" && this.liveEnergy(pid) > 25)) continue;
          let en = this.liveEnergy(pid);
          if (losing && this.minute >= 68 && ["ZAG", "VOL", "LD", "LE"].includes(slots[i][0])) en -= 12;
          if (en < we) { we = en; worst = i; }
        }
        if (worst < 0) break;
        if (done > 0 && we >= Number(this.g.contracts.cfg("banco", "ia_energia_troca", 58))) break;
        let pos: string = slots[worst][0];
        if (losing && this.minute >= 68 && ["ZAG", "VOL", "LD", "LE"].includes(pos)) pos = "AC";
        let best: Player | null = null, bv = -1;
        for (const p of this.benchPlayers(side)) {
          if (this.out.includes(p.id) || xi.includes(p.id)) continue;
          const v = this.g.eff(p, pos);
          if (v > bv) { bv = v; best = p; }
        }
        if (!best) break;
        const leaving = this.g.player(xi[worst]).name;
        if (this.substitute(side, worst, best.id)) break;
        done++;
        ev.push({ type: "sub", side, min: this.minute, text: `SUBSTITUIÇÃO no ${this.g.club(c).name}: entra ${best.name}, sai ${leaving}.` });
      }
    }
  }

  focusOnPitch(): boolean {
    return this.focusPid >= 0 && this.g.club(this.cid(this.focusSide)).xi.includes(this.focusPid) && !this.sentOff.includes(this.focusPid);
  }
  focusInvolved(): boolean {
    if (!this.focusOnPitch()) return false;
    const pos = this.g.player(this.focusPid).pos;
    return this.rng.randf() < this.g.pro.cfgPos("envolvimento_no_lance", pos, 0.5);
  }
  private focusSub(): string {
    if (this.focusOnPitch() || this.subs[this.focusSide] >= 5 || this.out.includes(this.focusPid)) return "";
    const xi = this.g.club(this.cid(this.focusSide)).xi;
    const mypos = this.g.player(this.focusPid).pos;
    let best = -1, bs = -1;
    for (let i = 0; i < xi.length; i++) {
      const p = this.g.player(xi[i]);
      if (p.pos === "GOL" || this.sentOff.includes(xi[i])) continue;
      const sc = this.g.fit(mypos, p.pos) * 100 - p.ovr * 0.3;
      if (sc > bs) { bs = sc; best = i; }
    }
    if (best < 0) return "";
    const leaving = this.g.player(xi[best]).name;
    if (this.substitute(this.focusSide, best, this.focusPid, false)) return "";
    return `Substituição: entra ${this.g.player(this.focusPid).name}, sai ${leaving}.`;
  }
}
