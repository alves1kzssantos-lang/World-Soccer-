// Ajudantes mínimos de DOM: h("div.card.glow", {onclick}, filhos...).
type Child = Node | string | number | null | undefined | false | Child[];
export type Props = Record<string, unknown> & { style?: Partial<CSSStyleDeclaration> | string };

export function h<K extends keyof HTMLElementTagNameMap = "div">(sel: string, props?: Props | null, ...kids: Child[]): HTMLElement {
  const [tag, ...cls] = sel.split(".");
  const el = document.createElement(tag || "div");
  if (cls.length) el.className = cls.join(" ");
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "style") {
        if (typeof v === "string") el.setAttribute("style", v);
        else Object.assign(el.style, v);
      } else if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2), v as EventListener);
      } else if (k === "html") {
        el.innerHTML = String(v);
      } else if (k === "class") {
        el.className += " " + String(v);
      } else {
        el.setAttribute(k, String(v));
      }
    }
  }
  append(el, kids);
  return el;
}

export function append(el: Node, kids: Child[]): void {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.appendChild(typeof k === "object" ? k : document.createTextNode(String(k)));
  }
}

export function clear(el: HTMLElement): void { while (el.firstChild) el.removeChild(el.firstChild); }
