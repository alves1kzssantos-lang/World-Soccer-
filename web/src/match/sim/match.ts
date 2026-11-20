import { Ball, Body, predictCrossing, separate, steer } from "./physics";
import { Rng } from "./rng";
import { T } from "./tuning";
import {
  BOX_DEPTH, BOX_HALF, CROSSBAR, DefaultScript, FORMATIONS, GOAL_HALF, L, PEN_SPOT, W,
  type LiveResult, type LiveScript, type MatchEvents, type PlayerInfo, type Pos, type ScriptKind, type TeamInfo,
} from "./types";

export type Mode = "live" | "slowmo" | "decide" | "restart" | "goal" | "ended";
export type BallState = "held" | "pass" | "loose" | "shot";
export type Anim = "run" | "kick" | "slide" | "fall" | "dive" | "catch" | "cheer" | "kneel" | "sad" | "ready";

export class Player {
  body = new Body();
  anim: Anim = "run";
  animT = 0;
  stun = 0;
  kick = 0;
  tried = false;
  tackleCd = 0;
  decideT = 0.6;
  diveDir = 0;
  homeX = 0;
  homeY = 0;
  stamina = 1;
  constructor(
    public info: PlayerInfo,
    public team: number,
    public idx: number,
    public role: Pos,
    public slotX: number,
    public slotU: number,
  ) {}
  get keeper(): boolean {
    return this.role === "GOL";
  }
}

interface Chance {
  side: number;
  kind: ScriptKind | null; // null = chance do usuário (resolve na física)
  t: number;
  ref?: unknown; // chance da carreira (para registrar o resultado)
}

const dirOf = (t: number): number => (t === 0 ? -1 : 1); // time 0 ataca para y = 0
const oppGoalY = (t: number): number => (t === 0 ? 0 : L);
const ownGoalY = (t: number): number => (t === 0 ? L : 0);

export interface MatchOptions {
  seed?: number;
  script?: LiveScript;
  events?: MatchEvents;
  userSide?: number; // -1 = ninguém (máquina x máquina)
  controlledId?: number; // carreira de jogador: só decide quando a bola está com ele
  matchSeconds?: number;
}

/** Partida contínua: simulação a 60 Hz com chances que congelam para o usuário decidir. */
export class Match {
  readonly rng: Rng;
  readonly script: LiveScript;
  /** Chance da carreira esperando a posse do time (0 e 1). */
  pendingChance: [unknown, unknown] = [null, null];
  private pendingT: [number, number] = [0, 0];
  private lastPasser: Player | null = null;
  private chanceResult: LiveResult | null = null;
  readonly events: MatchEvents;
  readonly players: Player[] = [];
  readonly team: Player[][] = [[], []];
  readonly bodies: Body[] = [];
  readonly ref = new Body();
  readonly ball = new Ball();
  userSide: number;
  controlledId: number;
  matchSeconds: number;

  score: [number, number] = [0, 0];
  time = 0;
  mode: Mode = "restart";
  timeScale = 1;
  desat = 0;
  modeT = 0;
  ballState: BallState = "held";
  holder: Player | null = null;
  lastTouch: Player | null = null;
  passTarget: Player | null = null;
  passAimX = 0;
  passAimY = 0;
  passOffside = false;
  chance: Chance | null = null;
  chanceCd: [number, number] = [3, 3];
  sinceChance: [number, number] = [0, 0];
  shotBy: Player | null = null;
  shotPlan = { x: 0, z: 0, react: 0.2, speed: 4, save: -1 }; // save: -1 física, 0 não defende, 1 defende
  penaltyMode = false;
  userDribble = 0;
  scorer: Player | null = null;
  slide = false;
  possession: [number, number] = [1, 1];
  hint = "";
  banner = "";
  bannerT = 0;
  private acc = 0;
  private restartFn: (() => void) | null = null;
  private lastMinute = -1;

  constructor(readonly teams: [TeamInfo, TeamInfo], opts: MatchOptions = {}) {
    this.rng = new Rng(opts.seed ?? 7);
    this.script = opts.script ?? new DefaultScript([teams[0].strength, teams[1].strength]);
    this.events = opts.events ?? {};
    this.userSide = opts.userSide ?? 0;
    this.controlledId = opts.controlledId ?? -1;
    this.matchSeconds = opts.matchSeconds ?? T.matchSeconds;
    for (let t = 0; t < 2; t++) {
      const slots = FORMATIONS[teams[t].formation] ?? FORMATIONS["4-3-3"];
      for (let i = 0; i < 11; i++) {
        const s = slots[i];
        const info = teams[t].players[i];
        const p = new Player(info, t, i, s[0], s[1], s[2]);
        p.body.radius = p.keeper ? T.keeperRadius : T.playerRadius;
        p.body.mass = T.massBase + info.des * 0.25;
        p.body.maxSpeed = T.speedBase + info.vel * T.speedPerPoint;
        this.players.push(p);
        this.team[t].push(p);
        this.bodies.push(p.body);
      }
    }
    this.ref.radius = T.refRadius;
    this.ref.maxSpeed = 7;
    this.bodies.push(this.ref);
    this.kickoff(0, true);
  }

  get minute(): number {
    return Math.min(90, Math.floor((this.time * 90) / this.matchSeconds));
  }
  /** Fração de posse do time 0 (0..1). */
  get possession0(): number {
    return this.possession[0] / (this.possession[0] + this.possession[1]);
  }
  isUserTurn(): boolean {
    return this.mode === "decide";
  }

  // ------------------------------------------------------------ laço
  /** Avança o tempo real (s). A física roda em passos fixos de 1/60 s, escalados pela câmera lenta. */
  update(realDt: number): void {
    realDt = Math.min(realDt, 0.1);
    if (this.mode === "slowmo") {
      this.modeT += realDt;
      const k = Math.min(this.modeT / T.slowmo, 1);
      this.timeScale = 1 - 0.9 * k;
      this.desat = k;
      if (k >= 1) {
        this.mode = "decide";
        this.timeScale = 0;
        this.hint = this.penaltyMode
          ? "PÊNALTI: arraste da bola para o gol"
          : "Toque = passe • Segure = passe alto • Arraste da bola = chute";
      }
    } else if (this.mode === "decide") {
      this.timeScale = 0;
      this.desat = 1;
    } else {
      this.timeScale = 1;
      this.desat = Math.max(this.desat - realDt * 5, 0);
    }
    if (this.bannerT > 0) {
      this.bannerT -= realDt;
      if (this.bannerT <= 0) this.banner = "";
    }
    this.acc += realDt * this.timeScale;
    while (this.acc >= T.step) {
      this.acc -= T.step;
      this.step(T.step);
    }
  }

  /** Um passo fixo da simulação. */
  step(dt: number): void {
    if (this.mode === "ended") return;
    this.modeT += this.mode === "slowmo" ? 0 : dt;
    if (this.mode === "live" || this.mode === "slowmo") {
      this.time += dt;
      if (this.holder) this.possession[this.holder.team] += dt;
    }
    for (let i = 0; i < 2; i++) {
      this.chanceCd[i] = Math.max(this.chanceCd[i] - dt, 0);
      if (this.mode === "live") this.sinceChance[i] += dt;
      if (this.pendingChance[i] !== null) this.pendingT[i] += dt;
    }
    if (this.minute !== this.lastMinute) {
      this.lastMinute = this.minute;
      this.updateStamina();
      const c = this.script.chanceAt?.(this.minute);
      if (c) { this.pendingChance[c.side] = c.ref; this.pendingT[c.side] = 0; }
    }
    for (const p of this.players) {
      if (p.stun > 0) p.stun -= dt;
      if (p.kick > 0) p.kick -= dt;
      if (p.tackleCd > 0) p.tackleCd -= dt;
      p.animT += dt;
      if ((p.anim === "kick" || p.anim === "fall" || p.anim === "slide") && p.animT > 0.6) p.anim = "run";
    }
    switch (this.mode) {
      case "restart":
        this.positionPlayers(dt);
        if (this.modeT > 0.9 && this.restartFn) {
          const f = this.restartFn;
          this.restartFn = null;
          f();
        }
        break;
      case "goal":
        this.updateCelebration(dt);
        break;
      default:
        this.updateLive(dt);
    }
    // árbitro acompanha de perto, sem atrapalhar
    this.ref.tx = clamp(this.ball.x + 9, 2, W - 2);
    this.ref.ty = clamp(this.ball.y + (this.ball.y < L / 2 ? 7 : -7), 2, L - 2);
    this.ref.hurry = 0.7;
    for (const b of this.bodies) steer(b, dt);
    separate(this.bodies);
    for (const b of this.bodies) {
      b.x = clamp(b.x, -3, W + 3);
      b.y = clamp(b.y, -3, L + 3);
    }
    if (this.mode === "live" && this.minute >= 90 && this.ballState !== "shot" && !this.chance) {
      this.mode = "ended";
      this.events.onEnd?.(this.score);
    }
  }

  private updateStamina(): void {
    for (const p of this.players) {
      const f = this.script.staminaFactor?.(p.info.id) ?? 1;
      p.stamina = f;
      p.body.maxSpeed = (T.speedBase + p.info.vel * T.speedPerPoint) * f;
    }
  }

  // ------------------------------------------------------------ jogo corrido
  private updateLive(dt: number): void {
    this.ball.step(dt);
    if (this.chance) {
      this.chance.t += dt;
      if (this.chance.kind !== null && this.chance.t > 9 && this.ballState !== "shot") this.endChance();
    }
    this.positionPlayers(dt);
    switch (this.ballState) {
      case "held": this.updateHeld(dt); break;
      case "pass": this.updatePass(); break;
      case "loose": this.updateLoose(); break;
      case "shot": this.updateShot(dt); break;
    }
    if (this.ballState !== "shot") this.ballVsBodies();
    this.checkOut();
  }

  /** Alvos sem a bola: formação que acompanha a bola, pressão, cobertura e infiltrações. */
  private positionPlayers(dt: number): void {
    const b = this.ball;
    const owner = this.holder ? this.holder.team : this.lastTouch ? this.lastTouch.team : 0;
    for (let t = 0; t < 2; t++) {
      const attacking = t === owner;
      const ballU = t === 0 ? (L - b.y) / L : b.y / L;
      let presser: Player | null = null;
      let cover: Player | null = null;
      if (!attacking && this.mode !== "restart") {
        let best = 1e9, second = 1e9;
        for (const p of this.team[t]) {
          if (p.keeper || p.stun > 0) continue;
          const d = dist(p.body.x, p.body.y, b.x, b.y);
          if (d < best) { second = best; cover = presser; best = d; presser = p; }
          else if (d < second) { second = d; cover = p; }
        }
      }
      for (const p of this.team[t]) {
        if (p === this.holder || p === this.passTarget || p === this.scorer) continue;
        const body = p.body;
        if (p.keeper) {
          if (this.ballState === "shot" && this.shotBy && this.shotBy.team !== t) continue; // o lance do chute move o goleiro
          const gy = ownGoalY(t) + dirOf(t) * 1.3;
          body.tx = W / 2 + clamp((b.x - W / 2) * 0.15, -2.6, 2.6);
          body.ty = gy;
          body.hurry = 0.6;
          p.anim = p.anim === "dive" || p.anim === "catch" ? p.anim : "ready";
          continue;
        }
        if (this.mode === "restart") {
          body.tx = p.homeX; body.ty = p.homeY; body.hurry = 0.8;
          continue;
        }
        if (p === presser && this.ballState !== "shot") {
          const h = this.holder;
          const gx = W / 2, gy = ownGoalY(t);
          if (h) {
            // fecha o condutor pelo lado do gol, a ~1 m
            const dx = gx - h.body.x, dy = gy - h.body.y, dd = Math.hypot(dx, dy) || 1;
            body.tx = h.body.x + (dx / dd) * 0.9; body.ty = h.body.y + (dy / dd) * 0.9;
          } else { body.tx = b.x; body.ty = b.y; }
          body.hurry = 1;
          continue;
        }
        if (p === cover && this.holder) {
          const h = this.holder;
          const gy = ownGoalY(t);
          body.tx = lerp(h.body.x, W / 2, 0.4); body.ty = lerp(h.body.y, gy, 0.3);
          body.hurry = 0.85;
          continue;
        }
        let u = p.slotU * 0.55 + ballU * 0.45 + (attacking ? 0.06 : -0.06);
        if (attacking && (p.role === "AC" || p.role === "PD" || p.role === "PE")) {
          u += 0.06 + 0.03 * Math.sin(this.time * 0.9 + p.idx);
        }
        if (!attacking && (p.role === "ZAG" || p.role === "LD" || p.role === "LE")) u = Math.min(u, ballU - 0.02);
        u = clamp(u, 0.04, 0.95);
        const sx = t === 0 ? p.slotX : 1 - p.slotX;
        const x = clamp(W * (0.06 + 0.88 * sx) + (b.x - W / 2) * 0.32, 2.5, W - 2.5);
        const y = t === 0 ? L - u * L : u * L;
        p.homeX = x; p.homeY = y;
        body.tx = x; body.ty = y;
        body.hurry = attacking ? 0.75 : 0.85;
      }
    }
    void dt;
  }

  // ------------------------------------------------------------ com a bola
  private updateHeld(dt: number): void {
    const h = this.holder;
    if (!h) { this.ballState = "loose"; return; }
    const b = this.ball;
    const body = h.body;
    if (h.keeper && this.chance === null && this.restartFn === null) {
      // goleiro com a bola: sai jogando
      h.decideT -= dt;
      if (h.decideT <= 0) this.aiPass(h, true);
      b.place(body.x + body.fx * 0.4, body.y + body.fy * 0.4);
      return;
    }
    if (this.penaltyMode) {
      body.tx = body.x; body.ty = body.y;
      b.vx = 0; b.vy = 0;
      if (this.pendingPen) this.tickPenalty(dt);
      else if (this.mode === "live" && this.isUserControlled(h)) this.enterDecision();
      return;
    }
    if (this.userDribble > 0) this.userDribble -= dt;
    const dir = dirOf(h.team);
    const gx = W / 2, gy = oppGoalY(h.team);
    // conduz rumo ao gol, desviando de quem está na frente
    let tx = lerp(body.x, gx, 0.25), ty = body.y + dir * 8;
    const near = this.nearestOpponent(h);
    if (near && near.d < 3.2 && (near.p.body.y - body.y) * dir > 0) tx += (body.x < near.p.body.x ? -3 : 3);
    if (Math.abs(body.y - gy) < 13) { ty = body.y + dir * 2; tx = lerp(body.x, gx, 0.5); }
    body.tx = clamp(tx, 1.5, W - 1.5);
    body.ty = clamp(ty, 1, L - 1);
    body.hurry = 0.95;
    // condução com toques de verdade: a bola vai à frente e o jogador alcança
    const db = dist(b.x, b.y, body.x, body.y);
    if (db < 0.8 && !b.inAir() && h.kick <= 0) {
      const sp = Math.min(body.speed * 1.35 + 1.2, 9.5);
      const ax = body.x + body.fx * 1.25, ay = body.y + body.fy * 1.25;
      const dx = ax - b.x, dy = ay - b.y, dd = Math.hypot(dx, dy) || 1;
      b.vx = (dx / dd) * sp; b.vy = (dy / dd) * sp;
      h.kick = 0.18;
      this.lastTouch = h;
    } else if (db > 2.6) {
      this.ballState = "loose";
      this.holder = null;
      return;
    }
    this.tryTackle(h);
    if (this.ballState !== "held" || this.holder !== h) return;
    // chance: perto do gol rival
    const dGoal = Math.abs(body.y - gy);
    // quanto mais tempo sem chance, mais longe do gol ela pode começar (o jogo não fica travado no meio)
    if (this.script.chanceAt) {
      if (!this.chance && this.pendingChance[h.team] !== null && (dGoal < 50 || this.pendingT[h.team] > 4)) this.startChance(h.team);
    } else {
      const zone = T.chanceZone + Math.min(Math.max(this.sinceChance[h.team] - 20, 0) * 0.8, 15);
      if (!this.chance && dGoal < zone && this.chanceCd[h.team] <= 0) this.startChance(h.team);
    }
    if (this.mode !== "live") return;
    if (this.isUserControlled(h)) {
      if (this.chance && this.chance.side === h.team && this.userDribble <= 0) this.enterDecision();
      return;
    }
    // carreira de jogador: com chance aberta, o companheiro costuma tocar para você
    if (this.controlledId >= 0 && h.team === this.userSide && this.chance && h.decideT <= 0) {
      const me = this.team[h.team].find((p) => p.info.id === this.controlledId);
      if (me && me !== h && this.rng.chance(0.6)) { this.doPass(h, me, false); return; }
    }
    h.decideT -= dt;
    if (h.decideT > 0) return;
    h.decideT = this.rng.range(0.45, 1.0) * (near && near.d < 2 ? 0.5 : 1);
    const ch = this.chance && this.chance.side === h.team ? this.chance : null;
    if (ch && ch.kind !== null) {
      if (ch.kind === "penalty") return; // espera o bote dentro da área
      if (dGoal < 28 || ch.t > 2.2) { this.aiShot(h, ch.kind); return; }
      if (ch.kind === "offside" && ch.t > 0.8) { this.aiPass(h, false, true); return; }
    }
    // sem chance aberta a máquina não chuta: troca passes e avança
    if (near && near.d < 2.2 && this.rng.chance(0.7)) { this.aiPass(h, false); return; }
    if (this.rng.chance(0.55)) this.aiPass(h, false);
  }

  private isUserControlled(p: Player): boolean {
    if (p.team !== this.userSide) return false;
    if (this.controlledId >= 0) return p.info.id === this.controlledId;
    return true;
  }

  private nearestOpponent(h: Player): { p: Player; d: number } | null {
    let best: Player | null = null, bd = 1e9;
    for (const o of this.team[1 - h.team]) {
      const d = dist(o.body.x, o.body.y, h.body.x, h.body.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best ? { p: best, d: bd } : null;
  }

  /** Bote do marcador mais próximo: limpo, falta ou erro (fica para trás um instante). */
  private tryTackle(h: Player): void {
    const ch = this.chance;
    for (const d of this.team[1 - h.team]) {
      if (d.keeper || d.stun > 0 || d.tackleCd > 0) continue;
      const dd = dist(d.body.x, d.body.y, h.body.x, h.body.y);
      if (dd > T.tackleReach + 0.3) continue;
      d.tackleCd = 0.8;
      let pWin = T.tackleBase + (d.info.des - (h.info.vel + h.info.pas) / 2) / 150;
      // por trás, protegendo a bola, é mais difícil (e vira falta mais fácil)
      const behind = (d.body.x - h.body.x) * h.body.fx + (d.body.y - h.body.y) * h.body.fy < 0;
      let pFoul = T.foulChance + (behind ? 0.22 : 0);
      if (behind) pWin *= 0.6;
      if (ch && ch.side === h.team) {
        if (ch.kind === null) { pWin *= 0.8; }
        else if (ch.kind === "lost") { pWin = 1; pFoul = 0; }
        else if (ch.kind === "penalty") {
          if (this.inBox(h.body.x, h.body.y, h.team)) { this.foul(d, h, true); return; }
          d.stun = 0.6; continue;
        } else { d.stun = 0.7; continue; }
      }
      if (this.pendingChance[d.team] !== null && this.pendingT[d.team] > 3) { pWin = 1; pFoul = 0; }
      if (this.rng.chance(pFoul) && !(ch && ch.kind === "lost")) { this.foul(d, h, false); return; }
      if (this.rng.chance(clamp(pWin, 0.08, 1))) {
        d.anim = "slide"; d.animT = 0;
        h.stun = 0.5;
        if (this.rng.chance(0.25)) { h.anim = "fall"; h.animT = 0; }
        this.giveBall(d);
        this.text(`Desarme de ${d.info.name}!`);
        return;
      }
      d.stun = 0.9; // errou o bote
      d.anim = "slide"; d.animT = 0;
    }
  }

  private foul(d: Player, h: Player, forcePen: boolean): void {
    d.anim = "slide"; d.animT = 0;
    h.anim = "fall"; h.animT = 0;
    if (this.rng.chance(T.yellowChance)) this.text(`Cartão amarelo para ${d.info.name}`);
    const inBox = forcePen || this.inBox(h.body.x, h.body.y, h.team);
    if (inBox) {
      this.say("PÊNALTI!");
      this.setupPenalty(h.team, h);
    } else {
      this.say("FALTA!");
      const x = h.body.x, y = h.body.y;
      this.restart(() => this.freeKick(h.team, h, x, y));
    }
  }

  inBox(x: number, y: number, attTeam: number): boolean {
    const gy = oppGoalY(attTeam);
    return Math.abs(x - W / 2) < BOX_HALF && Math.abs(y - gy) < BOX_DEPTH;
  }

  // ------------------------------------------------------------ passes
  /** Máquina escolhe o melhor companheiro: avanço, espaço livre e linha de passe limpa. */
  private aiPass(h: Player, long: boolean, forceForward = false): void {
    let best: Player | null = null, bs = -1e9;
    const dir = dirOf(h.team);
    for (const r of this.team[h.team]) {
      if (r === h || r.keeper) continue;
      const d = dist(r.body.x, r.body.y, h.body.x, h.body.y);
      if (d < 5 || d > (long ? 45 : 32)) continue;
      const gain = (r.body.y - h.body.y) * dir;
      if (forceForward && gain < 4) continue;
      let open = 8, lane = 8;
      for (const o of this.team[1 - h.team]) {
        open = Math.min(open, dist(o.body.x, o.body.y, r.body.x, r.body.y));
        lane = Math.min(lane, segDist(o.body.x, o.body.y, h.body.x, h.body.y, r.body.x, r.body.y));
      }
      const s = gain * 1.4 + open * 1.1 + lane * 1.6 - Math.abs(d - 15) * 0.15 + this.rng.range(0, 2);
      if (s > bs) { bs = s; best = r; }
    }
    if (!best) return;
    this.doPass(h, best, long || dist(best.body.x, best.body.y, h.body.x, h.body.y) > 30);
  }

  /** Passe rasteiro ou alto para `to`, com erro conforme o passe do jogador, a pressão e o cansaço. */
  doPass(from: Player, to: Player, lofted: boolean): void {
    const b = this.ball;
    const d0 = dist(to.body.x, to.body.y, b.x, b.y);
    const lead = Math.min(d0 / 16, 1) * 0.7;
    let ax = to.body.x + to.body.vx * lead, ay = to.body.y + to.body.vy * lead;
    // impedimento é julgado no momento do passe
    this.passOffside = this.isOffside(to);
    if (this.chance && this.chance.side === from.team && this.chance.kind === "offside") this.passOffside = true;
    else if (this.chance && this.chance.side === from.team && this.chance.kind !== null) this.passOffside = false;
    let err = T.passErrBase + (100 - from.info.pas) * T.passErrPerPoint;
    const near = this.nearestOpponent(from);
    if (near && near.d < T.pressureDist) err += T.passErrPressure * (1 - near.d / T.pressureDist);
    if (lofted) err *= 1.3;
    err /= from.stamina;
    if (this.chance && this.chance.kind !== null && this.chance.side === from.team) err *= 0.3;
    const ang = (this.rng.normal(err) * Math.PI) / 180;
    let dx = ax - b.x, dy = ay - b.y;
    const c = Math.cos(ang), s = Math.sin(ang);
    [dx, dy] = [dx * c - dy * s, dx * s + dy * c];
    const dd = Math.hypot(dx, dy) || 1;
    ax = b.x + dx; ay = b.y + dy;
    if (lofted) {
      const apex = this.inBox(to.body.x, to.body.y, from.team) ? T.crossApex : T.loftApex;
      b.vz = Math.sqrt(2 * T.gravity * apex);
      const tf = (2 * b.vz) / T.gravity;
      const hs = (dd / tf) * 1.08;
      b.vx = (dx / dd) * hs; b.vy = (dy / dd) * hs;
      b.z = 0.05;
    } else {
      const sp = clamp(Ball.groundSpeedFor(dd, T.passArrive), T.passMin, T.passMax);
      b.vx = (dx / dd) * sp; b.vy = (dy / dd) * sp;
      b.z = 0; b.vz = 0;
    }
    b.cx = 0; b.cy = 0;
    this.passAimX = ax; this.passAimY = ay;
    this.ballState = "pass";
    this.passTarget = to;
    this.holder = null;
    this.lastTouch = from;
    this.lastPasser = from;
    from.kick = 0.3; from.anim = "kick"; from.animT = 0;
    for (const o of this.team[1 - from.team]) o.tried = false;
    if (this.mode !== "live") this.goLive();
  }

  isOffside(r: Player): boolean {
    const t = r.team;
    const dir = dirOf(t);
    // posição relativa ao gol atacado: maior = mais adiantado
    const adv = (y: number): number => (t === 0 ? L - y : y);
    if (adv(r.body.y) <= L / 2) return false;
    if (adv(r.body.y) <= adv(this.ball.y)) return false;
    let first = -1e9, second = -1e9;
    for (const o of this.team[1 - t]) {
      const a = adv(o.body.y);
      if (a > first) { second = first; first = a; } else if (a > second) second = a;
    }
    void dir;
    return adv(r.body.y) > second + 0.3;
  }

  private updatePass(): void {
    const r = this.passTarget;
    const b = this.ball;
    if (!r) { this.ballState = "loose"; return; }
    // recebedor ataca a bola: vai ao encontro dela
    const meet = b.inAir() ? 0.6 : 0.35;
    r.body.tx = lerp(this.passAimX, b.x + b.vx * meet, 0.5);
    r.body.ty = lerp(this.passAimY, b.y + b.vy * meet, 0.5);
    r.body.hurry = 1;
    // corte de quem está no caminho
    const ch = this.chance;
    for (const o of this.team[1 - r.team]) {
      if (o.keeper || o.tried || o.stun > 0) continue;
      const d = dist(o.body.x, o.body.y, b.x, b.y);
      if (d < 4 && b.z < 0.9) { o.body.tx = b.x + b.vx * 0.2; o.body.ty = b.y + b.vy * 0.2; o.body.hurry = 1; }
      if (d < T.cutReach + o.body.radius && b.z < 0.9) {
        o.tried = true;
        if (ch && ch.side === r.team && ch.kind !== null && ch.kind !== "lost") continue;
        let pc = T.cutBase + (o.info.des - (this.lastTouch ? this.lastTouch.info.pas : 70)) / 150 - b.speed() / 60;
        if (ch && ch.side === r.team && ch.kind === "lost") pc = 1;
        if (this.rng.chance(clamp(pc, 0.08, 1))) {
          this.giveBall(o);
          this.text(`Passe cortado por ${o.info.name}!`);
          return;
        }
      }
    }
    const dr = dist(r.body.x, r.body.y, b.x, b.y);
    if (dr < 1.0 && b.z < 2.0) {
      if (this.passOffside) {
        this.say("IMPEDIMENTO!");
        this.result("offside", r, false);
        const x = r.body.x, y = r.body.y;
        const defTeam = 1 - r.team;
        this.endChance();
        this.restart(() => this.freeKick(defTeam, null, x, y));
        return;
      }
      if (b.z > 1.0 && !this.rng.chance(0.82 + (r.info.pas - 75) / 200)) {
        b.vx *= -0.3; b.vy *= -0.3; b.vz = 1.5;
        this.ballState = "loose"; this.passTarget = null;
        return;
      }
      // domínio: erro maior com bola rápida e passe fraco
      const err = (0.15 + 0.035 * b.speed()) * (1 - r.info.pas / 160);
      b.place(r.body.x + r.body.fx * 0.5 + this.rng.normal(err), r.body.y + r.body.fy * 0.5 + this.rng.normal(err));
      b.vx = r.body.vx * 0.9; b.vy = r.body.vy * 0.9;
      this.giveBall(r);
      return;
    }
    if (!b.inAir() && (b.speed() < 0.6 || ((b.x - r.body.x) * b.vx + (b.y - r.body.y) * b.vy > 0 && dr > 4))) {
      this.ballState = "loose";
      this.passTarget = null;
    }
  }

  private updateLoose(): void {
    const b = this.ball;
    // o mais perto de cada time vai na bola
    for (let t = 0; t < 2; t++) {
      let best: Player | null = null, bd = 1e9;
      for (const p of this.team[t]) {
        if (p.stun > 0) continue;
        const d = dist(p.body.x, p.body.y, b.x, b.y);
        if (d < bd) { bd = d; best = p; }
      }
      if (!best) continue;
      best.body.tx = b.x + b.vx * 0.25; best.body.ty = b.y + b.vy * 0.25; best.body.hurry = 1;
      if (bd < 0.9 && b.z < 0.8 && b.speed() < 12) {
        this.giveBall(best);
        return;
      }
    }
  }

  private giveBall(p: Player): void {
    const changed = this.holder?.team !== p.team && this.lastTouch?.team !== p.team;
    this.holder = p;
    this.lastTouch = p;
    this.ballState = "held";
    this.passTarget = null;
    p.decideT = this.rng.range(0.25, 0.6);
    if (this.chance && this.chance.side !== p.team) this.endChance();
    else if (changed && this.chance) this.endChance();
  }

  // ------------------------------------------------------------ chances
  private startChance(side: number): void {
    const user = side === this.userSide;
    this.sinceChance[side] = 0;
    const ref = this.pendingChance[side] ?? undefined;
    this.pendingChance[side] = null;
    this.chanceResult = null;
    this.chance = { side, kind: user ? null : this.script.outcome(side, this.minute, this.rng, ref), t: 0, ref };
    if (!user && this.chance.kind === "penalty") {
      // vai para dentro da área procurar o contato
      const h = this.holder;
      if (h) { h.decideT = 99; }
    }
  }

  endChance(): void {
    if (!this.chance) return;
    if (this.chance.ref !== undefined && this.script.resolve) {
      const r = this.chanceResult ?? { goal: false, kind: "lost", pid: this.lastTouch?.info.id ?? 0 };
      this.script.resolve(this.chance.ref, r);
    }
    this.chanceResult = null;
    this.chanceCd[this.chance.side] = T.chanceCooldown;
    this.chance = null;
    this.penaltyMode = false;
    if (this.mode === "slowmo" || this.mode === "decide") this.goLive();
  }

  private enterDecision(): void {
    if (this.mode !== "live") return;
    this.mode = "slowmo";
    this.modeT = 0;
    this.hint = "";
  }

  private goLive(): void {
    this.mode = "live";
    this.modeT = 0;
    this.timeScale = 1;
    this.hint = "";
  }

  /** Toque do usuário na decisão. Devolve true se virou uma ação. */
  tap(wx: number, wy: number, held: number): boolean {
    if (this.mode !== "decide" || !this.holder || this.penaltyMode) return false;
    const h = this.holder;
    let best: Player | null = null, bd = 2.2;
    for (const p of this.team[h.team]) {
      if (p === h) continue;
      const d = dist(p.body.x, p.body.y, wx, wy);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) {
      this.doPass(h, best, held >= T.holdLofted);
      return true;
    }
    if (dist(h.body.x, h.body.y, wx, wy) < 2.2) {
      // toque no próprio jogador: conduz mais um pouco
      this.goLive();
      this.userDribble = 1.2;
      return true;
    }
    return false;
  }

  /**
   * Arraste a partir da bola: direção = mira, tamanho = força, curva do traço = efeito.
   * (sx,sy)→(ex,ey) em metros; bend em metros (desvio do meio do traço); lenPx = tamanho na tela.
   */
  swipe(sx: number, sy: number, ex: number, ey: number, bendM: number, lenPx: number): boolean {
    if (this.mode !== "decide" || !this.holder) return false;
    const h = this.holder;
    const dir = dirOf(h.team);
    const dx = ex - sx, dy = ey - sy;
    if (dy * dir <= 0.05) return false; // tem que ir rumo ao gol
    const b = this.ball;
    const gy = oppGoalY(h.team);
    const k = (gy - b.y) / dy;
    const aimX = b.x + dx * k;
    const power = clamp(lenPx / T.swipeFullPx, 0.2, 1);
    const curl = clamp(bendM * 1.6, -T.swipeCurveMax, T.swipeCurveMax);
    this.doShot(h, aimX, 0.4 + power * 1.2, power, curl);
    return true;
  }

  private aiShot(h: Player, kind: ScriptKind): void {
    const gx = W / 2;
    const k = this.team[1 - h.team][0];
    const sgn = k.body.x > gx ? -1 : 1;
    let tx = gx + sgn * this.rng.range(1.4, 2.8);
    let height = this.rng.range(0.3, 1.5);
    if (kind === "goal") tx = gx + sgn * this.rng.range(1.8, 2.8);
    else if (kind === "save") tx = k.body.x + this.rng.range(-0.6, 0.6);
    else if (kind === "out") {
      if (this.rng.chance(0.4)) { height = 3.4; tx = gx + sgn * this.rng.range(0.5, 2.5); }
      else tx = gx + sgn * this.rng.range(4.4, 6.5);
    }
    this.doShot(h, tx, height, 0.65, this.rng.range(-1, 1) * T.shotCurve, kind);
  }

  /** Chute: mira x na linha do gol, altura h, força 0..1, efeito curl (m/s² lateral). */
  doShot(h: Player, aimX: number, height: number, power: number, curl: number, scripted: ScriptKind | null = null): void {
    const b = this.ball;
    const gy = oppGoalY(h.team);
    let spd = lerp(T.shotMin, T.shotMax, power) * (0.85 + h.info.chu / 650) * h.stamina;
    let err = T.shotErrBase + (100 - h.info.chu) * T.shotErrPerPoint + T.shotErrPower * power * power;
    if (this.penaltyMode) err *= 0.6;
    err /= h.stamina;
    if (scripted) err *= 0.25;
    let dx = aimX - b.x, dy = gy - b.y;
    let d = Math.hypot(dx, dy);
    let tt = d / spd;
    // a mira desconta a curva para terminar onde foi mirado
    dx -= 0.5 * curl * tt * tt;
    const ang = (this.rng.normal(err) * Math.PI) / 180;
    const c = Math.cos(ang), s = Math.sin(ang);
    [dx, dy] = [dx * c - dy * s, dx * s + dy * c];
    d = Math.hypot(dx, dy);
    tt = d / spd;
    const vz = (height - 0.05 + 0.5 * T.gravity * tt * tt) / tt;
    b.vx = (dx / d) * spd; b.vy = (dy / d) * spd; b.vz = vz; b.z = 0.05;
    b.cx = curl; b.cy = 0;
    if (this.rng.chance(0.1) && !scripted) b.vz += this.rng.normal(0.4 + power * 1.2);
    this.ballState = "shot";
    this.shotBy = h;
    this.holder = null;
    this.lastTouch = h;
    h.kick = 0.32; h.anim = "kick"; h.animT = 0;
    // plano do goleiro
    const k = this.team[1 - h.team][0];
    const cross = predictCrossing(b, k.body.y);
    const plan = this.shotPlan;
    plan.x = cross ? cross.x : b.x;
    plan.z = cross ? cross.z : 0;
    plan.react = T.keeperReactBase + (99 - k.info.ovr) * T.keeperReactPerPoint;
    plan.speed = T.keeperDiveBase + k.info.ovr * T.keeperDivePerPoint;
    plan.save = -1;
    if (this.penaltyMode) { plan.react = 0; plan.speed = 8; plan.x = W / 2 + [-2.8, 0, 2.8][this.rng.int(0, 2)]; }
    if (scripted === "goal") { plan.save = 0; plan.speed = 1.5; plan.react = 0.35; plan.x = W / 2 - (aimX - W / 2) * 0.6; }
    if (scripted === "save") { plan.save = 1; plan.speed = 12; plan.react = 0.04; }
    k.diveDir = Math.sign(plan.x - k.body.x);
    for (const o of this.team[1 - h.team]) o.tried = false;
    if (this.mode !== "live") this.goLive();
    this.hint = "";
  }

  private updateShot(dt: number): void {
    const b = this.ball;
    const sh = this.shotBy!;
    const k = this.team[1 - sh.team][0];
    const plan = this.shotPlan;
    // goleiro se joga para onde a bola vai cruzar
    {
      plan.react -= dt;
      if (plan.react <= 0) {
        const tx = clamp(plan.x, W / 2 - GOAL_HALF - 0.6, W / 2 + GOAL_HALF + 0.6);
        k.body.tx = tx; k.body.ty = k.body.y;
        const gap = Math.abs(tx - k.body.x);
        k.body.maxSpeed = plan.speed;
        k.body.accel = 40; k.body.decel = 40;
        k.body.hurry = 1;
        if (gap > 0.6) { k.anim = "dive"; k.animT = 0; k.diveDir = Math.sign(tx - k.body.x); }
      }
    }
    // bloqueio de zagueiro no caminho
    if (dist(b.x, b.y, sh.body.x, sh.body.y) > 1.5) {
      for (const d of this.team[1 - sh.team]) {
        if (d.keeper || d.tried) continue;
        if (dist(d.body.x, d.body.y, b.x, b.y) < 0.6 && b.z < 1.7) {
          d.tried = true;
          const ch = this.chance;
          if (ch && ch.kind !== null && ch.kind !== "lost") continue;
          if (!this.rng.chance(0.45)) continue;
          b.vx = this.rng.range(-5, 5); b.vy = -b.vy * 0.3; b.vz = 2; b.cx = 0;
          this.text(`Travado por ${d.info.name}!`);
          this.result("lost", sh, false);
          this.afterShot();
          this.ballState = "loose";
          return;
        }
      }
    }
    // goleiro alcança?
    if (b.x < -0.5 || b.x > W + 0.5) {
      this.afterShot();
      const side = 1 - sh.team, x = clamp(b.x, 0.2, W - 0.2), y = clamp(b.y, 1, L - 1);
      this.restart(() => this.throwIn(side, x, y));
      return;
    }
    if (plan.save !== 2 && Math.abs(b.y - k.body.y) < 0.5) {
      const lat = Math.abs(b.x - k.body.x);
      let saved = lat <= T.keeperReach + k.body.radius && b.z <= T.keeperReachHigh;
      if (saved && b.z > 1.7 && lat > 0.6) saved = this.rng.chance(0.55);
      if (plan.save === 0) saved = false;
      if (plan.save === 1) saved = true;
      plan.save = 2; // já julgado
      if (saved) {
        this.resetKeeper(k);
        if (b.speed() < 22 && b.z < 1.8 && this.rng.chance(0.6)) {
          k.anim = "catch"; k.animT = 0;
          this.text(`Defesa de ${k.info.name}!`);
          this.result("save", sh, false);
          this.afterShot();
          b.place(k.body.x, k.body.y);
          this.holder = k; this.lastTouch = k; this.ballState = "held";
          k.decideT = 1.2;
          return;
        }
        this.text(`${k.info.name} espalma!`);
        this.result("save", sh, false);
        b.vx = this.rng.range(-8, 8); b.vy = -b.vy * 0.35; b.vz = 2.5; b.cx = 0;
        this.lastTouch = k;
        this.afterShot();
        this.ballState = "loose";
        return;
      }
    }
    const gy = oppGoalY(sh.team);
    if ((b.y - gy) * dirOf(sh.team) >= 0) {
      const ax = Math.abs(b.x - W / 2);
      if (ax < GOAL_HALF - 0.11 && b.z < CROSSBAR - 0.11) { this.goal(sh); return; }
      if (ax < GOAL_HALF + 0.12 && b.z < CROSSBAR + 0.12) {
        this.text(ax > GOAL_HALF - 0.11 ? "Na trave!" : "No travessão!");
        this.result("out", sh, false);
        b.vy = -b.vy * 0.5; b.vx *= 0.5; b.y = gy - dirOf(sh.team) * 0.2;
        this.afterShot();
        this.ballState = "loose";
        return;
      }
      this.text(b.z >= CROSSBAR ? "Por cima do gol!" : "Pra fora!");
      this.result("out", sh, false);
      this.afterShot();
      this.resetKeeper(k);
      const def = 1 - sh.team;
      this.restart(() => this.goalKick(def));
      return;
    }
    if (b.speed() < 1 && !b.inAir()) { this.afterShot(); this.ballState = "loose"; }
  }

  private resetKeeper(k: Player): void {
    k.body.maxSpeed = T.speedBase + k.info.vel * T.speedPerPoint;
    k.body.accel = T.accel; k.body.decel = T.decel;
  }

  private afterShot(): void {
    if (this.shotBy) this.resetKeeper(this.team[1 - this.shotBy.team][0]);
    this.shotBy = null;
    this.penaltyMode = false;
    this.endChance();
  }

  // ------------------------------------------------------------ bola e corpos
  /** A bola não atravessa ninguém: bate e desvia (quem tem a posse ou acabou de tocar passa). */
  private ballVsBodies(): void {
    const b = this.ball;
    if (b.z > 1.9) return;
    for (const p of this.players) {
      if (p === this.holder || p === this.passTarget || p.kick > 0.05 || p.keeper) continue;
      const rr = p.body.radius + T.ballRadius;
      const dx = b.x - p.body.x, dy = b.y - p.body.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 1e-4;
      const nx = dx / d, ny = dy / d;
      const vn = (b.vx - p.body.vx) * nx + (b.vy - p.body.vy) * ny;
      if (vn < 0) {
        b.vx -= (1 + T.bodyRestitution) * vn * nx;
        b.vy -= (1 + T.bodyRestitution) * vn * ny;
        b.cx = 0; b.cy = 0;
      }
      b.x = p.body.x + nx * rr; b.y = p.body.y + ny * rr;
      if (this.ballState === "loose" && b.speed() < 6) this.giveBall(p);
    }
  }

  private checkOut(): void {
    const b = this.ball;
    if (this.ballState === "shot") return;
    if (b.x < -0.1 || b.x > W + 0.1) {
      const side = this.lastTouch ? 1 - this.lastTouch.team : 0;
      const x = clamp(b.x, 0.2, W - 0.2), y = clamp(b.y, 1, L - 1);
      this.endChance();
      this.restart(() => this.throwIn(side, x, y));
      return;
    }
    if (b.y < -0.1 || b.y > L + 0.1) {
      const top = b.y < 0;
      const defTeam = top ? 0 : 1; // quem defende esse gol
      const last = this.lastTouch ? this.lastTouch.team : 1 - defTeam;
      this.endChance();
      if (last === defTeam) {
        const att = 1 - defTeam;
        const cx = b.x < W / 2 ? 0.5 : W - 0.5;
        this.restart(() => this.corner(att, cx, top ? 0.5 : L - 0.5));
      } else this.restart(() => this.goalKick(defTeam));
    }
  }

  // ------------------------------------------------------------ bolas paradas
  private restart(fn: () => void): void {
    this.mode = "restart";
    this.modeT = 0;
    this.restartFn = fn;
    this.holder = null;
    this.ballState = "held";
    this.desat = 0;
  }

  private placeHolder(p: Player, x: number, y: number): void {
    p.body.x = x; p.body.y = y; p.body.vx = 0; p.body.vy = 0;
    p.body.fx = 0; p.body.fy = dirOf(p.team);
    this.ball.place(x + p.body.fx * 0.4, y + p.body.fy * 0.6);
    this.holder = p; this.lastTouch = p; this.ballState = "held";
    p.decideT = 0.5;
    this.mode = "live"; this.modeT = 0;
  }

  kickoff(side: number, first = false): void {
    for (const p of this.players) {
      const t = p.team;
      const sx = t === 0 ? p.slotX : 1 - p.slotX;
      const u = Math.min(p.slotU * 0.5, 0.46);
      p.homeX = W * (0.06 + 0.88 * sx);
      p.homeY = t === 0 ? L - u * L : u * L;
      if (first) { p.body.x = p.homeX; p.body.y = p.homeY; p.body.fy = dirOf(t); }
      p.body.tx = p.homeX; p.body.ty = p.homeY;
      p.anim = "run";
      p.body.frozen = false;
    }
    if (first) { this.ref.x = W / 2 + 8; this.ref.y = L / 2 + 4; }
    this.scorer = null;
    this.ball.place(W / 2, L / 2);
    this.mode = "restart"; this.modeT = 0;
    this.restartFn = () => {
      const s = this.team[side].find((p) => p.role === "AC") ?? this.team[side][9];
      this.placeHolder(s, W / 2, L / 2 + dirOf(side) * -0.6);
    };
  }

  private goalKick(side: number): void {
    const k = this.team[side][0];
    this.placeHolder(k, W / 2, ownGoalY(side) + dirOf(side) * 5.5);
    k.decideT = 0.8;
  }

  private throwIn(side: number, x: number, y: number): void {
    let best = this.team[side][1], bd = 1e9;
    for (const p of this.team[side]) {
      if (p.keeper) continue;
      const d = dist(p.body.x, p.body.y, x, y);
      if (d < bd) { bd = d; best = p; }
    }
    this.placeHolder(best, x, y);
  }

  private corner(side: number, x: number, y: number): void {
    let best = this.team[side][9];
    let bd = 1e9;
    for (const p of this.team[side]) {
      if (p.keeper) continue;
      const d = dist(p.body.x, p.body.y, x, y);
      if (d < bd) { bd = d; best = p; }
    }
    this.placeHolder(best, x, y);
    best.decideT = 0.6;
    if (side !== this.userSide && this.chanceCd[side] <= 0) this.startChance(side);
  }

  private freeKick(side: number, taker: Player | null, x: number, y: number): void {
    let p = taker;
    if (!p) {
      let bd = 1e9;
      for (const q of this.team[side]) {
        const d = dist(q.body.x, q.body.y, x, y);
        if (d < bd) { bd = d; p = q; }
      }
    }
    for (const o of this.team[1 - side]) {
      const d = dist(o.body.x, o.body.y, x, y);
      if (d < 9.15) {
        const dx = o.body.x - x, dy = o.body.y - y, dd = d || 1;
        o.body.x = x + (dx / dd) * 9.3; o.body.y = y + (dy / dd) * 9.3;
      }
    }
    this.placeHolder(p!, clamp(x, 1, W - 1), clamp(y, 1, L - 1));
  }

  private setupPenalty(side: number, shooter: Player): void {
    const gy = oppGoalY(side);
    const dir = dirOf(side);
    this.endChance();
    this.mode = "restart"; this.modeT = 0;
    for (const p of this.players) {
      if (p === shooter) continue;
      if (p.keeper && p.team !== side) { p.homeX = W / 2; p.homeY = gy - dir * 0.4; continue; }
      const i = p.idx + p.team * 11;
      p.homeX = W / 2 - 18 + (i % 10) * 4;
      p.homeY = gy - dir * (BOX_DEPTH + 3 + (i % 3));
    }
    this.restartFn = () => {
      this.placeHolder(shooter, W / 2, gy - dir * (PEN_SPOT + 0.6));
      this.ball.place(W / 2, gy - dir * PEN_SPOT);
      this.penaltyMode = true;
      this.chance = { side, kind: side === this.userSide ? null : this.rng.chance(0.76) ? "goal" : "save", t: 0 };
      if (side === this.userSide && this.isUserControlled(shooter)) this.enterDecision();
      else this.restartFn = null;
      if (side !== this.userSide || !this.isUserControlled(shooter)) {
        const kind = this.chance.kind ?? "goal";
        shooter.decideT = 0.8;
        this.pendingPen = { shooter, kind };
      }
    };
  }
  private pendingPen: { shooter: Player; kind: ScriptKind } | null = null;

  // ------------------------------------------------------------ gol e comemoração
  private goal(sh: Player): void {
    this.score[sh.team] += 1;
    this.events.onGoal?.(sh.team, sh.info.name, this.minute);
    this.say(this.penaltyMode ? "GOOOL DE PÊNALTI!" : "GOOOL!");
    this.result("goal", sh, true);
    this.afterShot();
    this.ball.vx *= 0.15; this.ball.vy *= 0.15; this.ball.vz = 0; this.ball.cx = 0;
    this.mode = "goal"; this.modeT = 0;
    this.scorer = sh;
    this.slide = this.rng.chance(T.slideChance);
    const b = sh.body;
    // corre para o lado mais perto, de costas para o gol
    const side = b.x < W / 2 ? -1 : 1;
    b.tx = clamp(b.x + side * 9, 3, W - 3);
    b.ty = clamp(b.y - dirOf(sh.team) * 6, 3, L - 3);
    b.hurry = 1;
    for (const p of this.players) {
      if (p === sh) continue;
      p.anim = p.team === sh.team ? "cheer" : "sad";
      p.animT = 0;
    }
  }

  private updateCelebration(dt: number): void {
    this.ball.step(dt);
    const sh = this.scorer!;
    const b = sh.body;
    if (sh.anim !== "kneel" && sh.anim !== "cheer") {
      const left = dist(b.x, b.y, b.tx, b.ty);
      if (left < 3.5 || this.modeT > 1.6) {
        if (this.slide) {
          // desliza de joelhos: só o atrito da grama freia
          sh.anim = "kneel"; sh.animT = 0;
          b.decel = 6.5;
          b.tx = b.x + b.vx * 0.9; b.ty = b.y + b.vy * 0.9;
        } else { sh.anim = "cheer"; sh.animT = 0; }
      }
    } else if (sh.anim === "kneel" && b.speed < 0.3) b.frozen = true;
    // companheiros fecham a roda em volta do autor
    let k = 0;
    for (const p of this.team[sh.team]) {
      if (p === sh || p.keeper) continue;
      const a = (k++ / 9) * Math.PI * 2;
      p.body.tx = b.x + Math.cos(a) * 1.4; p.body.ty = b.y + Math.sin(a) * 1.4;
      p.body.hurry = 1;
    }
    for (const p of this.team[1 - sh.team]) { p.body.tx = p.body.x; p.body.ty = p.body.y; }
    if (this.modeT > T.celebrateTime) {
      b.decel = T.decel;
      b.frozen = false;
      this.kickoff(1 - sh.team);
    }
  }

  /** Guarda o resultado do lance para a carreira (registrado ao fechar a chance). */
  private result(kind: string, p: Player, goal: boolean): void {
    const lp = this.lastPasser;
    this.chanceResult = {
      goal, kind, pid: p.info.id,
      apid: goal && lp && lp !== p && lp.team === p.team && !this.penaltyMode ? lp.info.id : undefined,
      pen: this.penaltyMode,
    };
  }

  // ------------------------------------------------------------ textos
  private text(s: string): void {
    this.events.onText?.(s);
    this.banner = s;
    this.bannerT = 1.4;
  }
  private say(s: string): void {
    this.text(s);
  }

  /** Pênalti da máquina: chuta depois de uma pausa. Chamado no passo (fica fora do switch por simplicidade). */
  tickPenalty(dt: number): void {
    const pp = this.pendingPen;
    if (!pp || this.mode !== "live") return;
    pp.shooter.decideT -= dt;
    if (pp.shooter.decideT <= 0) {
      this.pendingPen = null;
      this.aiShot(pp.shooter, pp.kind);
    }
  }
}

// ------------------------------------------------------------ util
export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
export function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}
export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay;
  const l2 = vx * vx + vy * vy || 1;
  const k = clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1);
  return Math.hypot(px - (ax + vx * k), py - (ay + vy * k));
}
