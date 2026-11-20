/** Números da partida (portados de assets/data/match_tuning.json do jogo original). Metros e segundos. */
export const T = {
  step: 1 / 60,
  // corpo
  playerRadius: 0.42,
  keeperRadius: 0.5,
  refRadius: 0.38,
  massBase: 72,
  accel: 8.0,
  decel: 12.0,
  turnStill: (720 * Math.PI) / 180,
  turnRun: (240 * Math.PI) / 180,
  speedBase: 4.6, // + vel * speedPerPoint (vel 50 → 7.1 m/s, vel 90 → 9.1 m/s)
  speedPerPoint: 0.05,
  stride: 1.55, // radianos de passada por metro
  // bola
  ballRadius: 0.11,
  gravity: 9.8,
  bounce: 0.45,
  bounceLoss: 0.16,
  rolling: 1.8,
  groundDrag: 0.018,
  airDrag: 0.009,
  bodyRestitution: 0.35,
  // passe
  passMin: 12,
  passMax: 27,
  passArrive: 7,
  loftApex: 4.2,
  crossApex: 3.4,
  passErrBase: 1.5,
  passErrPerPoint: 0.12,
  passErrPressure: 4.0,
  pressureDist: 3.0,
  cutReach: 0.85,
  cutBase: 0.4,
  // chute
  shotMin: 16,
  shotMax: 31,
  shotErrBase: 1.2,
  shotErrPerPoint: 0.11,
  shotErrPower: 3.0,
  shotCurve: 1.6,
  swipeCurveMax: 5.0,
  swipeFullPx: 260,
  // goleiro
  keeperReactBase: 0.12,
  keeperReactPerPoint: 0.004,
  keeperDiveBase: 3.2,
  keeperDivePerPoint: 0.035,
  keeperReach: 0.78,
  keeperReachHigh: 2.55,
  // disputa
  tackleReach: 1.15,
  tackleBase: 0.22,
  foulChance: 0.2,
  yellowChance: 0.19,
  // ritmo
  matchSeconds: 270, // 90 minutos em 4,5 minutos reais
  chanceZone: 40, // m do gol: começa a chance
  chanceCooldown: 7, // s reais entre chances do mesmo time
  slowmo: 0.3,
  holdLofted: 0.35,
  // comemoração
  celebrateTime: 4.0,
  slideChance: 0.6,
};
