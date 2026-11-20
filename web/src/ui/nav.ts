// Pilha de navegação com transição suave entre telas.
import { h } from "./dom";

export type ScreenFn = (arg?: unknown) => HTMLElement;
interface Entry { name: string; arg?: unknown; el: HTMLElement }

export class Nav {
  private stack: Entry[] = [];
  private screens = new Map<string, ScreenFn>();
  constructor(private host: HTMLElement) {}

  register(name: string, fn: ScreenFn): void { this.screens.set(name, fn); }
  get current(): string { return this.stack[this.stack.length - 1]?.name ?? ""; }
  get depth(): number { return this.stack.length; }

  private build(name: string, arg?: unknown): HTMLElement {
    const fn = this.screens.get(name);
    if (!fn) throw new Error("tela desconhecida: " + name);
    const el = fn(arg);
    el.classList.add("ws-screen");
    return el;
  }

  private swap(next: HTMLElement, prev: HTMLElement | undefined, back: boolean): void {
    next.classList.add(back ? "back-enter" : "enter");
    this.host.appendChild(next);
    requestAnimationFrame(() => requestAnimationFrame(() => next.classList.remove("enter", "back-enter")));
    if (prev) {
      prev.classList.add(back ? "back-leave" : "leave");
      setTimeout(() => prev.remove(), 260);
    }
  }

  go(name: string, arg?: unknown): void {
    const prev = this.stack[this.stack.length - 1]?.el;
    const el = this.build(name, arg);
    this.stack.push({ name, arg, el });
    this.swap(el, prev, false);
  }

  replace(name: string, arg?: unknown): void {
    const prev = this.stack.pop()?.el;
    const el = this.build(name, arg);
    this.stack.push({ name, arg, el });
    this.swap(el, prev, false);
  }

  reset(name: string, arg?: unknown): void {
    const prev = this.stack[this.stack.length - 1]?.el;
    this.stack.forEach((e) => e.el !== prev && e.el.remove());
    const el = this.build(name, arg);
    this.stack = [{ name, arg, el }];
    this.swap(el, prev, false);
  }

  back(): void {
    if (this.stack.length < 2) return;
    const prev = this.stack.pop()!.el;
    const top = this.stack[this.stack.length - 1];
    top.el = this.build(top.name, top.arg);   // reconstrói com os dados atuais
    this.swap(top.el, prev, true);
  }

  refresh(): void {
    const top = this.stack[this.stack.length - 1];
    if (!top) return;
    const old = top.el;
    top.el = this.build(top.name, top.arg);
    this.host.replaceChild(top.el, old);
  }
}

/** Cabeçalho padrão das telas. */
export function header(nav: Nav, title: string, sub = "", right?: HTMLElement | null, left?: HTMLElement | null): HTMLElement {
  return h("div.ws-head", null,
    nav.depth > 1 ? h("button.btn.ghost", { onclick: () => nav.back(), style: "min-width:44px;padding:0 10px", "aria-label": "Voltar" }, "‹") : null,
    left ?? null,
    h("div.grow", null, h("div.t", null, title), sub ? h("div.s", null, sub) : null),
    right ?? null);
}
