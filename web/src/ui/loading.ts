// Tela de carregamento animada: banner pulsando, bola quicando, barra neon com brilho e dicas.
import { h } from "./dom";

export const TIPS = [
  "Toque num companheiro para passe rasteiro; segure para passe alto.",
  "Deslize o dedo a partir da bola rumo ao gol para chutar: o tamanho do gesto é a força.",
  "Curve o gesto do chute para dar efeito na bola.",
  "A linha tracejada é a do impedimento: passe para quem está atrás dela.",
  "Contratos vencendo aparecem em vermelho. Renove antes que saiam de graça.",
  "Empreste os garotos que não jogam: com minutos, eles evoluem mais rápido.",
  "Jogador cansado corre menos e erra mais. Revezar o elenco faz diferença.",
  "Na coletiva, o tom da resposta mexe com diretoria, torcida e elenco.",
  "Packs da loja usam o dinheiro do clube: confira o teto salarial antes de abrir.",
  "No intervalo a substituição não gasta parada: aproveite para mexer no time.",
  "Goleiro adiantado? Um chute no canto alto costuma resolver.",
  "Cruzamento na área vira cabeceio: segure o dedo no atacante.",
];

export class Loading {
  readonly el: HTMLElement;
  private fill: HTMLElement;
  private label: HTMLElement;
  private tip: HTMLElement;
  private timer = 0;
  private shownAt = performance.now();

  constructor(base = "./", message = "Preparando o jogo…") {
    this.fill = h("i", { style: "width:3%" });
    this.label = h("div.small.row", null, message);
    this.tip = h("div.small.muted", { style: "text-align:center;max-width:70vw;min-height:2.6em" });
    this.el = h("div.loading", null,
      h("img", { src: base + "art/banner.webp", alt: "World Soccer — A Nova Era" }),
      h("div.ball"),
      h("div.lb", null, this.label, h("div.bar", { style: "margin-top:6px" }, this.fill)),
      h("div.small.neon", { style: "letter-spacing:.12em;font-weight:700" }, "DICA"), this.tip);
    let i = Math.floor(Math.random() * TIPS.length);
    const next = () => { this.tip.textContent = TIPS[i++ % TIPS.length]; };
    next();
    this.timer = window.setInterval(next, 2600);
  }

  progress(k: number, message?: string): void {
    this.fill.style.width = `${Math.max(3, Math.min(100, k * 100))}%`;
    if (message) this.label.textContent = message;
  }

  /** Some suavemente (mínimo de minMs na tela para a animação ser vista). */
  async close(minMs = 900): Promise<void> {
    this.progress(1, "Tudo pronto!");
    const left = minMs - (performance.now() - this.shownAt);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
    this.el.classList.add("out");
    clearInterval(this.timer);
    await new Promise((r) => setTimeout(r, 380));
    this.el.remove();
  }
}
