/** Formatação única de dinheiro (padrão brasileiro). Caixa/taxas em MILHÕES; salários em MIL por semana. */
export const MINUS = "−";

export function num(v: number, decimals: number): string {
  let s = v.toFixed(decimals);
  const [ip, dp] = s.split(".");
  let out = "";
  let cnt = 0;
  for (let i = ip.length - 1; i >= 0; i--) {
    out = ip[i] + out;
    cnt++;
    if (cnt % 3 === 0 && i > 0 && ip[i - 1] !== "-") out = "." + out;
  }
  return dp !== undefined ? out + "," + dp : out;
}

/** Valor em milhões: "$ 12,4 mi", "$ 850 mil", "−$ 3,3 mi". */
export function fmt(vMi: number): string {
  if (!isFinite(vMi)) return "$ —";
  let neg = vMi < 0;
  const a = Math.abs(vMi);
  let body: string;
  if (a < 0.0005) { body = "$ 0"; neg = false; }
  else if (a < 1) body = `$ ${num(Math.round(a * 1000), 0)} mil`;
  else if (a < 100) body = `$ ${num(a, 1)} mi`;
  else body = `$ ${num(Math.round(a), 0)} mi`;
  return neg ? MINUS + body : body;
}

export function signed(vMi: number): string {
  if (Math.abs(vMi) < 0.0005) return fmt(0);
  return (vMi > 0 ? "+ " : MINUS + " ") + fmt(Math.abs(vMi));
}

/** Salário em MIL por semana. */
export function wage(kWeek: number): string {
  const a = Math.abs(kWeek);
  if (a >= 1000) return `$ ${num(a / 1000, 2)} mi/sem`;
  if (a >= 100) return `$ ${num(Math.round(a), 0)} mil/sem`;
  return `$ ${num(a, 1)} mil/sem`;
}

export function wageShort(kWeek: number): string { return wage(kWeek).replace(/\/sem$/, ""); }
