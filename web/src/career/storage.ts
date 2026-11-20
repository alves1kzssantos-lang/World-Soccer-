/** Onde ficam os saves (um texto JSON por espaço de carreira). */
export interface SaveStore {
  read(slot: number): string | null;
  write(slot: number, text: string): void;
  remove(slot: number): void;
}

/** Saves no navegador / app (localStorage), com cópia de segurança do save anterior. */
export class LocalSaveStore implements SaveStore {
  constructor(private prefix = "wsne_carreira_") {}
  private key(slot: number): string { return `${this.prefix}${slot}`; }
  read(slot: number): string | null {
    try {
      const main = localStorage.getItem(this.key(slot));
      if (main && main.startsWith("{")) return main;
      const bak = localStorage.getItem(this.key(slot) + "_bak");
      return bak && bak.startsWith("{") ? bak : null;
    } catch { return null; }
  }
  write(slot: number, text: string): void {
    try {
      const prev = localStorage.getItem(this.key(slot));
      if (prev) localStorage.setItem(this.key(slot) + "_bak", prev);
      localStorage.setItem(this.key(slot), text);
    } catch { /* armazenamento cheio ou bloqueado: o jogo continua sem gravar */ }
  }
  remove(slot: number): void {
    try { localStorage.removeItem(this.key(slot)); localStorage.removeItem(this.key(slot) + "_bak"); } catch { /* ignora */ }
  }
}

/** Saves em memória (testes). */
export class MemorySaveStore implements SaveStore {
  readonly data = new Map<number, string>();
  read(slot: number): string | null { return this.data.get(slot) ?? null; }
  write(slot: number, text: string): void { this.data.set(slot, text); }
  remove(slot: number): void { this.data.delete(slot); }
}
