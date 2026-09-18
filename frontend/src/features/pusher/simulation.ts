/**
 * プッシャー台のシミュレーション。
 *
 * 物理エンジンは使わず、決定論的な自前計算にしている。理由は3つ。
 *
 * 1. 勝敗はサーバー権威（ダイスとカード）で決まる。剛体物理を入れると、画面が出す
 *    結論とルールが出す結論がずれる。ここが決めてよいのは「どう見えるか」だけ
 * 2. 決定論なので、そのままテストできる（`docs/spec.md` のエンジンと同じ方針）
 * 3. 依存を増やさない
 *
 * **I/O を持たない。** 時刻も乱数も持たず、`dt` と `Rng` を引数で受け取る。
 * 入力はコマンド（`dropCoin`）、出力はイベント列（`PusherEvent`）にしてあるので、
 * あとでサーバー駆動に差し替えるときは呼び出し側だけを置き換えればよい。
 *
 * 座標系は台の左奥を原点とした正規化空間。y が大きいほど手前（プレイヤー側）で、
 * `depth` を越えたコインが落下口へ落ちる。
 */

/** [0, 1) を返す乱数源。エンジンは自前で乱数を作らない */
export type Rng = () => number;

/** カード1枚のコイン数（docs/spec.md §1）に対応する */
export type CoinValue = 1 | 2 | 3;

export type CoinPhase =
  /** 投入口から台へ落ちてくる途中。まだ台の上のコインとぶつからない */
  | { kind: "dropping"; remaining: number }
  /** 台の上。押し出しの対象になる */
  | { kind: "field" }
  /** 落下口を越えて受け皿へ落ちている途中 */
  | { kind: "payout"; remaining: number }
  /** 横穴に吸い込まれている途中 */
  | { kind: "sidehole"; remaining: number };

export type Coin = {
  id: number;
  x: number;
  y: number;
  value: CoinValue;
  /** 見た目の傾き（度）。挙動には影響しない */
  spin: number;
  phase: CoinPhase;
};

/**
 * 台の上で起きたこと。描画はこの列だけを見て演出を出す。
 * `x` は落ちた左右の位置で、受け皿のどこに得点を出すかに使う。
 */
export type PusherEvent =
  | { type: "landed"; id: number }
  | { type: "scored"; id: number; value: CoinValue; x: number }
  | { type: "swallowed"; id: number; value: CoinValue; x: number };

/**
 * 暫定の数値は全部ここに集める（コーディング規約 §0）。
 * 手触りの調整はこのオブジェクトだけを触れば済む。
 */
export type PusherConfig = {
  width: number;
  depth: number;
  coinRadius: number;
  /** プッシャー板の面が一番奥にあるときの y */
  pusherHome: number;
  /** 板が手前へ出る量 */
  pusherStroke: number;
  /** 往復1周期の秒数 */
  pusherPeriod: number;
  /** 投入したコインが着地する奥行き */
  spawnDepth: number;
  /** 左右の壁が開いている帯（この範囲だけ横穴になる） */
  sideHole: { from: number; to: number };
  /** 投入口から台へ落ちるまでの秒数 */
  dropDuration: number;
  /** 落下口・横穴へ落ちきるまでの秒数 */
  payoutDuration: number;
  /** 重なりを解く反復回数。多いほど詰まりに強いが重い */
  separationPasses: number;
  /** 手持ちコインの初期枚数 */
  initialPurse: number;
};

export const DEFAULT_CONFIG: PusherConfig = {
  width: 100,
  depth: 100,
  coinRadius: 6.2,
  pusherHome: 0,
  pusherStroke: 26,
  pusherPeriod: 3.2,
  // 実機と同じで、投入したコインはプッシャー板の上に落ちる。板が一番奥にあるとき
  // 板の上に乗る位置にしておくと、そこから1ストロークぶん丸ごと押し込まれる。
  // ここを板の届く限界の近くにすると、1枚あたりの押し込み量がほぼ0になる。
  spawnDepth: 8,
  sideHole: { from: 64, to: 80 },
  dropDuration: 0.42,
  payoutDuration: 0.55,
  separationPasses: 4,
  initialPurse: 20,
};

/** 板が一番手前まで出たとき、コインの中心が届く限界 */
export function pusherReach(config: PusherConfig): number {
  return config.pusherHome + config.pusherStroke + config.coinRadius;
}

/**
 * 最初の山を置く場所。板が届く限界から落下口の手前までを、互い違いに敷き詰める。
 *
 * 実機と同じで、板が押せるのは届く範囲にあるコインだけ。山が板の届かない所まで
 * 進むと、新しく入れたコインが後ろから押すまで何も落ちなくなる。この「詰まり」が
 * 押し引きの手触りそのものなので、最初から板が届く位置に山を置いておく。
 */
export function pileSlots(config: PusherConfig): { x: number; y: number }[] {
  const step = config.coinRadius * 2;
  const front = config.depth - config.coinRadius;

  // 一番手前の列を落下口の縁にぴたりと着けたい。列は互いに触れている必要があるので、
  // 間隔は直径のまま、縁から奥へ数えて板が届くところまでを埋める。
  const rows = Math.floor((front - pusherReach(config)) / step) + 2;
  const slots: { x: number; y: number }[] = [];

  for (let row = 0; row < rows; row += 1) {
    const y = front - row * step;
    const offset = row % 2 === 0 ? 0 : step / 2;
    for (let x = config.coinRadius + offset; x <= config.width - config.coinRadius; x += step) {
      slots.push({ x, y });
    }
  }

  return slots;
}

export type PusherState = {
  config: PusherConfig;
  /** 経過時間（秒）。プッシャー板の位置はここから決まる */
  time: number;
  coins: Coin[];
  score: number;
  jackpot: number;
  purse: number;
  dropped: number;
  nextId: number;
};

/**
 * 経過時間から板の面の位置を出す。
 *
 * 余弦なので周期性は式そのものが持っており、折り返しの分岐がいらない。
 */
export function pusherFace(time: number, config: PusherConfig): number {
  const cycle = (1 - Math.cos((2 * Math.PI * time) / config.pusherPeriod)) / 2;
  return config.pusherHome + cycle * config.pusherStroke;
}

/** メインデッキの構成（docs/spec.md §1）をそのままコインの重みに使う */
const COIN_DECK: readonly { value: CoinValue; count: number }[] = [
  { value: 1, count: 35 },
  { value: 2, count: 30 },
  { value: 3, count: 11 },
];

const DECK_TOTAL = COIN_DECK.reduce((sum, entry) => sum + entry.count, 0);

export function drawCoinValue(rng: Rng): CoinValue {
  let remaining = rng() * DECK_TOTAL;
  for (const entry of COIN_DECK) {
    remaining -= entry.count;
    if (remaining < 0) return entry.value;
  }
  // rng() が 1 を返す実装に備えた保険
  return 3;
}

/** その奥行きで左右の壁がどこにあるか。横穴の帯では壁が開いている */
function wallsAt(y: number, config: PusherConfig): { min: number; max: number } {
  const inHole = y >= config.sideHole.from && y <= config.sideHole.to;
  return inHole
    ? { min: -config.coinRadius, max: config.width + config.coinRadius }
    : { min: config.coinRadius, max: config.width - config.coinRadius };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** 山を自然に見せるためのばらつき。重なりを作らない程度にとどめる */
const PILE_JITTER = 0.5;

export function createTable(options: {
  rng: Rng;
  /** 省略すると台を埋める枚数になる */
  initialCoins?: number;
  config?: PusherConfig;
}): PusherState {
  const config = options.config ?? DEFAULT_CONFIG;
  const { rng } = options;
  const slots = pileSlots(config);
  const used = slots.slice(0, options.initialCoins ?? slots.length);

  const coins: Coin[] = used.map((slot, i) => ({
    id: i + 1,
    x: clamp(
      slot.x + (rng() - 0.5) * PILE_JITTER * 2,
      config.coinRadius,
      config.width - config.coinRadius
    ),
    y: slot.y + (rng() - 0.5) * PILE_JITTER * 2,
    value: drawCoinValue(rng),
    spin: rng() * 360,
    phase: { kind: "field" },
  }));

  return {
    config,
    time: 0,
    coins,
    score: 0,
    jackpot: 0,
    purse: config.initialPurse,
    dropped: 0,
    nextId: coins.length + 1,
  };
}

/**
 * 1枚投入する指示。**何を落とすかは、ここへ来る前にもう決まっている。**
 *
 * 本番ではこれをサーバーが返した確定結果から組み立てる。画面はそれを再生するだけで、
 * 何が落ちるかをクライアントが決めることはない。試作では呼び出し側が `Rng` から作る。
 */
export type DropCommand = { x: number; value: CoinValue; spin: number };

/**
 * コインを1枚投入する。プレイヤーが決められるのは左右の位置だけで、
 * 奥行きは実機と同じく投入口の位置に固定されている。
 */
export function dropCoin(state: PusherState, command: DropCommand): PusherState {
  if (state.purse <= 0) return state;

  const { config } = state;
  const coin: Coin = {
    id: state.nextId,
    x: clamp(command.x, config.coinRadius, config.width - config.coinRadius),
    y: config.spawnDepth,
    value: command.value,
    spin: command.spin,
    phase: { kind: "dropping", remaining: config.dropDuration },
  };

  return {
    ...state,
    coins: [...state.coins, coin],
    purse: state.purse - 1,
    dropped: state.dropped + 1,
    nextId: state.nextId + 1,
  };
}

/** 重なった2枚を、めり込んだぶんだけ半分ずつ押し返す */
function separate(a: Coin, b: Coin, diameter: number): void {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let distance = Math.hypot(dx, dy);

  if (distance >= diameter) return;

  if (distance === 0) {
    // 完全に重なったときの逃げる向き。決定論を保つために固定する
    dx = 0;
    dy = 1;
    distance = 1;
  }

  const push = (diameter - distance) / 2;
  const nx = (dx / distance) * push;
  const ny = (dy / distance) * push;
  a.x -= nx;
  a.y -= ny;
  b.x += nx;
  b.y += ny;
}

/** 板と壁から、行ってはいけない場所へ入ったコインを戻す */
function applyBounds(coin: Coin, face: number, config: PusherConfig): void {
  const front = face + config.coinRadius;
  if (coin.y < front) coin.y = front;
  const walls = wallsAt(coin.y, config);
  coin.x = clamp(coin.x, walls.min, walls.max);
}

export function step(
  state: PusherState,
  dt: number
): { state: PusherState; events: PusherEvent[] } {
  const { config } = state;
  const events: PusherEvent[] = [];
  const time = state.time + dt;
  const face = pusherFace(time, config);

  let score = state.score;
  let jackpot = state.jackpot;
  let purse = state.purse;

  // 1. 途中の演出を進める。落ちきったコインはここで消える
  const coins: Coin[] = [];
  for (const coin of state.coins) {
    const phase = coin.phase;

    if (phase.kind === "dropping") {
      const remaining = phase.remaining - dt;
      if (remaining <= 0) {
        events.push({ type: "landed", id: coin.id });
        coins.push({ ...coin, phase: { kind: "field" } });
      } else {
        coins.push({ ...coin, phase: { kind: "dropping", remaining } });
      }
      continue;
    }

    if (phase.kind === "payout" || phase.kind === "sidehole") {
      const remaining = phase.remaining - dt;
      if (remaining <= 0) {
        if (phase.kind === "payout") {
          score += coin.value;
          purse += coin.value;
          events.push({ type: "scored", id: coin.id, value: coin.value, x: coin.x });
        } else {
          jackpot += coin.value;
          events.push({ type: "swallowed", id: coin.id, value: coin.value, x: coin.x });
        }
        continue;
      }
      coins.push({ ...coin, phase: { kind: phase.kind, remaining } });
      continue;
    }

    coins.push({ ...coin });
  }

  // 2. 台の上のコインだけを、板と隣のコインで押す
  const onField = coins.filter((coin) => coin.phase.kind === "field");
  const diameter = config.coinRadius * 2;

  for (const coin of onField) applyBounds(coin, face, config);

  for (let pass = 0; pass < config.separationPasses; pass += 1) {
    for (let i = 0; i < onField.length; i += 1) {
      for (let j = i + 1; j < onField.length; j += 1) {
        separate(onField[i] as Coin, onField[j] as Coin, diameter);
      }
    }
    for (const coin of onField) applyBounds(coin, face, config);
  }

  // 3. 落ちる先へ入ったかを判定する
  for (const coin of onField) {
    if (coin.y > config.depth) {
      coin.phase = { kind: "payout", remaining: config.payoutDuration };
    } else if (coin.x < 0 || coin.x > config.width) {
      coin.phase = { kind: "sidehole", remaining: config.payoutDuration };
    }
  }

  return { state: { ...state, time, coins, score, jackpot, purse }, events };
}
