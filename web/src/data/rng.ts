/** Gerador aleatório com semente (xorshift128+ simplificado em 32 bits). Mesma API usada no Godot. */
export class Rng {
  private a = 0; private b = 0; private c = 0; private d = 0;
  constructor(seed: number = Date.now()) { this.setSeed(seed); }
  setSeed(seed: number): void {
    let s = (seed >>> 0) || 0x9e3779b9;
    const sm = () => { s = (s + 0x9e3779b9) >>> 0; let z = s; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b); z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35); return (z ^ (z >>> 16)) >>> 0; };
    this.a = sm(); this.b = sm(); this.c = sm(); this.d = sm();
  }
  /** Inteiro de 32 bits sem sinal (sfc32). */
  next(): number {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) >>> 0;
    return t;
  }
  /** 0 <= x < 1 */
  randf(): number { return this.next() / 4294967296; }
  randfRange(lo: number, hi: number): number { return lo + (hi - lo) * this.randf(); }
  /** Inteiro de lo a hi, inclusive (como randi_range do Godot). */
  randiRange(lo: number, hi: number): number {
    if (hi < lo) [lo, hi] = [hi, lo];
    return lo + Math.floor(this.randf() * (hi - lo + 1));
  }
  /** Normal com média e desvio. */
  randfn(mean = 0, dev = 1): number {
    let u = 0; while (u <= 1e-12) u = this.randf();
    const v = this.randf();
    return mean + dev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  pick<T>(arr: readonly T[]): T { return arr[this.randiRange(0, arr.length - 1)]; }
  shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) { const j = this.randiRange(0, i); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  }
}

/** Hash estável de valores (para sementes derivadas, como hash([...]) no Godot). */
export function hashOf(...vals: (number | string)[]): number {
  let h = 2166136261 >>> 0;
  for (const v of vals) {
    const s = String(v);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= 0x2c; h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export const snapped = (v: number, step: number): number => Math.round(v / step) * step;
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
