import { T } from "./tuning";

/** Corpo de um jogador/árbitro: posição, velocidade, alvo e limites de movimento. */
export class Body {
  x = 0; y = 0; vx = 0; vy = 0;
  tx = 0; ty = 0; // alvo
  hurry = 1; // 0..1 fração da velocidade máxima desejada
  maxSpeed = 7;
  accel = T.accel;
  decel = T.decel;
  radius = T.playerRadius;
  mass = T.massBase;
  fx = 0; fy = -1; // para onde olha
  phase = 0; // passada
  speed = 0;
  frozen = false; // não se move (comemoração de joelhos, bola parada...)
}

/** Move o corpo em direção ao alvo com aceleração, freada e giro limitados (sem trocas instantâneas). */
export function steer(b: Body, dt: number): void {
  if (b.frozen) {
    b.vx = 0; b.vy = 0; b.speed = 0;
    return;
  }
  const dx = b.tx - b.x;
  const dy = b.ty - b.y;
  const dist = Math.hypot(dx, dy);
  let want = 0;
  if (dist > 0.05) want = Math.min(b.maxSpeed * b.hurry, Math.sqrt(2 * b.decel * Math.max(dist - 0.05, 0)));
  let dvx = (dist > 1e-6 ? (dx / dist) * want : 0) - b.vx;
  let dvy = (dist > 1e-6 ? (dy / dist) * want : 0) - b.vy;
  const lim = (want > b.speed ? b.accel : b.decel) * dt;
  const dl = Math.hypot(dvx, dvy);
  if (dl > lim) {
    dvx *= lim / dl;
    dvy *= lim / dl;
  }
  let nvx = b.vx + dvx;
  let nvy = b.vy + dvy;
  // giro limitado: correndo, o jogador não vira na hora
  if (b.speed > 0.8) {
    const a0 = Math.atan2(b.vy, b.vx);
    const a1 = Math.atan2(nvy, nvx);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const k = Math.min(b.speed / 8, 1);
    const maxTurn = (T.turnStill + (T.turnRun - T.turnStill) * k) * dt;
    if (Math.abs(da) > maxTurn) {
      const m = Math.hypot(nvx, nvy);
      const a = a0 + Math.sign(da) * maxTurn;
      nvx = Math.cos(a) * m;
      nvy = Math.sin(a) * m;
    }
  }
  b.vx = nvx;
  b.vy = nvy;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.speed = Math.hypot(b.vx, b.vy);
  b.phase += b.speed * dt * T.stride;
  if (b.speed > 0.3) {
    b.fx = b.vx / b.speed;
    b.fy = b.vy / b.speed;
  }
}

/** Ninguém atravessa ninguém: afasta pares encostados (pelo peso) e corta a velocidade de choque. */
export function separate(bodies: Body[], iterations = 4): void {
  const n = bodies.length;
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < n; j++) {
        const b = bodies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        let d = Math.sqrt(d2);
        let nx: number, ny: number;
        if (d < 1e-6) {
          nx = 1; ny = 0; d = 0;
        } else {
          nx = dx / d; ny = dy / d;
        }
        const pen = rr - d;
        const wa = a.frozen ? 0 : b.frozen ? 1 : b.mass / (a.mass + b.mass);
        const wb = b.frozen ? 0 : a.frozen ? 1 : a.mass / (a.mass + b.mass);
        a.x -= nx * pen * wa; a.y -= ny * pen * wa;
        b.x += nx * pen * wb; b.y += ny * pen * wb;
        // impulso: remove a aproximação ao longo da normal
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          a.vx += nx * rv * wa; a.vy += ny * rv * wa;
          b.vx -= nx * rv * wb; b.vy -= ny * rv * wb;
        }
      }
    }
  }
}

/** Bola: arrasto no ar, rolamento e atrito na grama, quique com perda e efeito (curva) no ar. */
export class Ball {
  x = 34; y = 52.5; z = 0;
  vx = 0; vy = 0; vz = 0;
  cx = 0; cy = 0; // aceleração lateral do efeito (some no primeiro quique)
  spin = 0;

  place(x: number, y: number): void {
    this.x = x; this.y = y; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0; this.cx = 0; this.cy = 0;
  }
  speed(): number {
    return Math.hypot(this.vx, this.vy);
  }
  inAir(): boolean {
    return this.z > 0.001 || this.vz > 0.001;
  }
  step(dt: number): void {
    if (this.inAir()) {
      const s = Math.hypot(this.vx, this.vy, this.vz);
      const k = Math.max(0, 1 - T.airDrag * s * dt);
      this.vx = this.vx * k + this.cx * dt;
      this.vy = this.vy * k + this.cy * dt;
      this.vz = this.vz * k - T.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        this.z = 0;
        this.cx = 0; this.cy = 0;
        if (this.vz < -1.6) {
          this.vz = -this.vz * T.bounce;
          this.vx *= 1 - T.bounceLoss;
          this.vy *= 1 - T.bounceLoss;
        } else this.vz = 0;
      }
    } else {
      const s = Math.hypot(this.vx, this.vy);
      if (s > 0) {
        const dec = (T.rolling + T.groundDrag * s * s) * dt;
        const ns = Math.max(s - dec, 0);
        this.vx *= ns / s;
        this.vy *= ns / s;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
      }
    }
    this.spin += Math.hypot(this.vx, this.vy) * dt * 2.2;
  }
  /** Velocidade inicial de um passe rasteiro para chegar a `dist` com `arrive` m/s. */
  static groundSpeedFor(dist: number, arrive: number): number {
    // integra a freada (rolamento + arrasto) de trás para frente
    let v = arrive;
    let d = 0;
    const dt = 1 / 120;
    while (d < dist && v < 40) {
      v += (T.rolling + T.groundDrag * v * v) * dt;
      d += v * dt;
    }
    return v;
  }
}

/** Onde e quando a bola cruza a linha y = lineY (com o movimento atual). null se não cruza. */
export function predictCrossing(b: Ball, lineY: number): { x: number; z: number; t: number } | null {
  if ((lineY - b.y) * b.vy <= 0) return null;
  let x = b.x, y = b.y, z = b.z, vx = b.vx, vy = b.vy, vz = b.vz, cx = b.cx, cy = b.cy;
  const dt = 1 / 120;
  for (let t = 0; t < 4; t += dt) {
    const air = z > 0.001 || vz > 0.001;
    if (air) {
      const s = Math.hypot(vx, vy, vz);
      const k = Math.max(0, 1 - T.airDrag * s * dt);
      vx = vx * k + cx * dt; vy = vy * k + cy * dt; vz = vz * k - T.gravity * dt;
      z += vz * dt;
      if (z <= 0) {
        z = 0; cx = 0; cy = 0;
        if (vz < -1.6) { vz = -vz * T.bounce; vx *= 1 - T.bounceLoss; vy *= 1 - T.bounceLoss; } else vz = 0;
      }
    } else {
      const s = Math.hypot(vx, vy);
      if (s < 0.05) return null;
      const ns = Math.max(s - (T.rolling + T.groundDrag * s * s) * dt, 0);
      vx *= ns / s; vy *= ns / s;
    }
    const ny = y + vy * dt;
    if ((ny - lineY) * (y - lineY) <= 0) {
      const k = (lineY - y) / (ny - y || 1e-6);
      return { x: x + vx * dt * k, z, t };
    }
    x += vx * dt;
    y = ny;
  }
  return null;
}
