// Ponto de entrada: canvas em tela cheia, com resolução nativa do aparelho.
const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d", { alpha: false })!;

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}
window.addEventListener("resize", resize);
resize();

function frame(): void {
  ctx.fillStyle = "#0b0d0c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#39e33f";
  ctx.font = `bold ${Math.round(canvas.height * 0.06)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("WORLD SOCCER — A NOVA ERA", canvas.width / 2, canvas.height / 2);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
