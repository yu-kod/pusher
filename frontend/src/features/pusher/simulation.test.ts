import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  createTable,
  pusherReach,
  drawCoinValue,
  dropCoin,
  pusherFace,
  step,
  type Coin,
  type PusherState,
} from "./simulation";

/** 出目を固定した Rng。エンジンに乱数を持ち込まないための注入用 */
function fixedRng(...values: number[]) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] ?? 0;
}

function buildState(coins: Coin[], overrides?: Partial<PusherState>): PusherState {
  return {
    config: DEFAULT_CONFIG,
    time: 0,
    coins,
    score: 0,
    jackpot: 0,
    purse: DEFAULT_CONFIG.initialPurse,
    dropped: 0,
    nextId: 100,
    ...overrides,
  };
}

/** 投入指示。何を落とすかは呼び出し側が先に決める */
function command(x: number, value: 1 | 2 | 3 = 1) {
  return { x, value, spin: 0 };
}

function buildCoin(overrides?: Partial<Coin>): Coin {
  return {
    id: 1,
    x: 50,
    y: 50,
    value: 1,
    spin: 0,
    phase: { kind: "field" },
    ...overrides,
  };
}

describe("pusherFace", () => {
  const { pusherHome, pusherStroke, pusherPeriod } = DEFAULT_CONFIG;

  it("周期の頭では一番奥に引っ込んでいる", () => {
    expect(pusherFace(0, DEFAULT_CONFIG)).toBeCloseTo(pusherHome);
  });

  it("周期の半分で一番手前まで出る", () => {
    expect(pusherFace(pusherPeriod / 2, DEFAULT_CONFIG)).toBeCloseTo(pusherHome + pusherStroke);
  });

  it("1周すると元の位置へ戻る", () => {
    expect(pusherFace(pusherPeriod, DEFAULT_CONFIG)).toBeCloseTo(pusherHome);
  });

  it("前半は手前へ進み続ける", () => {
    const a = pusherFace(pusherPeriod * 0.1, DEFAULT_CONFIG);
    const b = pusherFace(pusherPeriod * 0.3, DEFAULT_CONFIG);
    expect(b).toBeGreaterThan(a);
  });
});

describe("drawCoinValue", () => {
  it("小さい乱数では1コイン札が出る", () => {
    expect(drawCoinValue(() => 0)).toBe(1);
  });

  it("中ほどの乱数では2コイン札が出る", () => {
    expect(drawCoinValue(() => 0.6)).toBe(2);
  });

  it("大きい乱数では3コイン札が出る", () => {
    expect(drawCoinValue(() => 0.95)).toBe(3);
  });

  it("乱数が上限に張り付いても値を返す", () => {
    expect(drawCoinValue(() => 1)).toBe(3);
  });
});

describe("createTable", () => {
  it("最初から台にコインが積まれている", () => {
    const state = createTable({ rng: fixedRng(0.5), initialCoins: 12 });
    expect(state.coins).toHaveLength(12);
    expect(state.coins.every((coin) => coin.phase.kind === "field")).toBe(true);
  });

  it("積まれたコインは台の内側に収まっている", () => {
    const state = createTable({ rng: fixedRng(0.1, 0.9, 0.4, 0.7), initialCoins: 20 });
    const { coinRadius, width, depth } = state.config;
    for (const coin of state.coins) {
      expect(coin.x).toBeGreaterThanOrEqual(coinRadius);
      expect(coin.x).toBeLessThanOrEqual(width - coinRadius);
      expect(coin.y).toBeLessThan(depth);
    }
  });

  it("最初の山は板が届く位置から始まる", () => {
    const state = createTable({ rng: fixedRng(0.5) });
    const backmost = Math.min(...state.coins.map((coin) => coin.y));
    expect(backmost).toBeLessThanOrEqual(pusherReach(DEFAULT_CONFIG));
  });

  it("最初の山は落下口の縁に着いている", () => {
    const state = createTable({ rng: fixedRng(0.5) });
    const frontmost = Math.max(...state.coins.map((coin) => coin.y));
    expect(frontmost).toBeCloseTo(DEFAULT_CONFIG.depth - DEFAULT_CONFIG.coinRadius, 0);
  });

  it("最初の山の列は互いに触れている", () => {
    const state = createTable({ rng: fixedRng(0.5) });
    const rows = [...new Set(state.coins.map((coin) => Math.round(coin.y)))].sort((a, b) => a - b);
    const gaps = rows.slice(1).map((y, i) => y - (rows[i] as number));
    // 列の間隔が直径を超えると、押した力が前へ伝わらない
    expect(Math.max(...gaps)).toBeLessThanOrEqual(DEFAULT_CONFIG.coinRadius * 2 + 1);
  });

  it("投入口は板が届く範囲の内側にある", () => {
    expect(DEFAULT_CONFIG.spawnDepth).toBeLessThan(pusherReach(DEFAULT_CONFIG));
  });

  it("同じ乱数からは同じ台ができる", () => {
    const a = createTable({ rng: fixedRng(0.3, 0.7, 0.2), initialCoins: 8 });
    const b = createTable({ rng: fixedRng(0.3, 0.7, 0.2), initialCoins: 8 });
    expect(a.coins).toEqual(b.coins);
  });

  it("手持ちコインを持って始まる", () => {
    const state = createTable({ rng: fixedRng(0.5), initialCoins: 0 });
    expect(state.purse).toBe(DEFAULT_CONFIG.initialPurse);
  });
});

describe("dropCoin", () => {
  it("投入した位置にコインが落ちてくる", () => {
    const next = dropCoin(buildState([]), command(30));
    expect(next.coins).toHaveLength(1);
    expect(next.coins[0]?.x).toBe(30);
    expect(next.coins[0]?.phase.kind).toBe("dropping");
  });

  it("投入位置は台の幅に収める", () => {
    const left = dropCoin(buildState([]), command(-50));
    const right = dropCoin(buildState([]), command(999));
    expect(left.coins[0]?.x).toBe(DEFAULT_CONFIG.coinRadius);
    expect(right.coins[0]?.x).toBe(DEFAULT_CONFIG.width - DEFAULT_CONFIG.coinRadius);
  });

  it("投入すると手持ちが1枚減り、投入枚数が増える", () => {
    const next = dropCoin(buildState([], { purse: 3, dropped: 7 }), command(50));
    expect(next.purse).toBe(2);
    expect(next.dropped).toBe(8);
  });

  it("手持ちが尽きたら投入できない", () => {
    const state = buildState([], { purse: 0 });
    expect(dropCoin(state, command(50))).toBe(state);
  });

  it("投入されたコインには一意な id が振られる", () => {
    const first = dropCoin(buildState([]), command(20));
    const second = dropCoin(first, command(60));
    expect(second.coins[0]?.id).not.toBe(second.coins[1]?.id);
  });
});

describe("step — 落下してくるコイン", () => {
  it("落ちきると台の上のコインになる", () => {
    const coin = buildCoin({ phase: { kind: "dropping", remaining: 0.1 } });
    const { state, events } = step(buildState([coin]), 0.2);
    expect(state.coins[0]?.phase.kind).toBe("field");
    expect(events).toContainEqual({ type: "landed", id: 1 });
  });

  it("落ちきるまでは台の上のコインとして扱わない", () => {
    const coin = buildCoin({ phase: { kind: "dropping", remaining: 0.3 } });
    const { state, events } = step(buildState([coin]), 0.1);
    expect(state.coins[0]?.phase.kind).toBe("dropping");
    expect((state.coins[0]?.phase as { remaining: number }).remaining).toBeCloseTo(0.2);
    expect(events).toHaveLength(0);
  });
});

describe("step — プッシャーの押し出し", () => {
  it("板が出てくるとコインが手前へ押される", () => {
    const coin = buildCoin({ y: DEFAULT_CONFIG.coinRadius });
    const { state } = step(buildState([coin]), DEFAULT_CONFIG.pusherPeriod / 2);
    expect(state.coins[0]?.y).toBeCloseTo(
      DEFAULT_CONFIG.pusherHome + DEFAULT_CONFIG.pusherStroke + DEFAULT_CONFIG.coinRadius
    );
  });

  it("板の前にあるコインは触れない", () => {
    const coin = buildCoin({ y: 70 });
    const { state } = step(buildState([coin]), DEFAULT_CONFIG.pusherPeriod / 2);
    expect(state.coins[0]?.y).toBe(70);
  });

  it("押されたコインが前のコインを押す", () => {
    const back = buildCoin({ id: 1, x: 50, y: DEFAULT_CONFIG.coinRadius });
    const front = buildCoin({ id: 2, x: 50, y: DEFAULT_CONFIG.coinRadius + 1 });
    const { state } = step(buildState([back, front]), DEFAULT_CONFIG.pusherPeriod / 2);
    const moved = state.coins.find((coin) => coin.id === 2);
    expect(moved?.y).toBeGreaterThan(DEFAULT_CONFIG.coinRadius + 1);
  });

  it("完全に重なったコインも離れる", () => {
    const a = buildCoin({ id: 1, x: 50, y: 50 });
    const b = buildCoin({ id: 2, x: 50, y: 50 });
    const { state } = step(buildState([a, b]), 0.016);
    const [first, second] = state.coins;
    const distance = Math.hypot(
      (second?.x ?? 0) - (first?.x ?? 0),
      (second?.y ?? 0) - (first?.y ?? 0)
    );
    expect(distance).toBeGreaterThan(0);
  });
});

describe("step — 壁と横穴", () => {
  it("横穴以外の場所では壁がコインを止める", () => {
    const pushed = buildCoin({ id: 1, x: 1, y: 20 });
    const { state } = step(buildState([pushed]), 0.016);
    expect(state.coins[0]?.x).toBe(DEFAULT_CONFIG.coinRadius);
  });

  it("横穴の位置まで押し出されたコインはジャックポットへ入る", () => {
    const y = (DEFAULT_CONFIG.sideHole.from + DEFAULT_CONFIG.sideHole.to) / 2;
    const coin = buildCoin({ id: 1, x: -1, y, value: 3 });
    const { state, events } = step(buildState([coin]), 0.016);
    expect(state.coins[0]?.phase.kind).toBe("sidehole");
    expect(events).toHaveLength(0);

    const settled = step(state, DEFAULT_CONFIG.payoutDuration);
    expect(settled.state.coins).toHaveLength(0);
    expect(settled.state.jackpot).toBe(3);
    expect(settled.events).toContainEqual({ type: "swallowed", id: 1, value: 3, x: -1 });
  });

  it("右側の横穴からも落ちる", () => {
    const y = (DEFAULT_CONFIG.sideHole.from + DEFAULT_CONFIG.sideHole.to) / 2;
    const coin = buildCoin({ id: 1, x: DEFAULT_CONFIG.width + 1, y });
    const { state } = step(buildState([coin]), 0.016);
    expect(state.coins[0]?.phase.kind).toBe("sidehole");
  });

  it("横穴の帯では壁がないので端まで行ける", () => {
    const y = (DEFAULT_CONFIG.sideHole.from + DEFAULT_CONFIG.sideHole.to) / 2;
    const coin = buildCoin({ id: 1, x: 1, y });
    const { state } = step(buildState([coin]), 0.016);
    expect(state.coins[0]?.x).toBe(1);
  });
});

describe("step — 落下口", () => {
  it("落下口を越えたコインは得点になる", () => {
    const coin = buildCoin({ id: 1, y: DEFAULT_CONFIG.depth + 1, value: 2 });
    const { state, events } = step(buildState([coin]), 0.016);
    expect(state.coins[0]?.phase.kind).toBe("payout");
    expect(events).toHaveLength(0);

    const settled = step(state, DEFAULT_CONFIG.payoutDuration);
    expect(settled.state.coins).toHaveLength(0);
    expect(settled.state.score).toBe(2);
    expect(settled.state.purse).toBe(DEFAULT_CONFIG.initialPurse + 2);
    expect(settled.events).toContainEqual({ type: "scored", id: 1, value: 2, x: 50 });
  });

  it("落下中のコインは押し出しの対象にならない", () => {
    const coin = buildCoin({
      id: 1,
      y: DEFAULT_CONFIG.coinRadius,
      phase: { kind: "payout", remaining: 1 },
    });
    // 板が一番手前まで出ている瞬間でも、落下中のコインは動かない
    const extended = buildState([coin], { time: DEFAULT_CONFIG.pusherPeriod / 2 });
    const { state } = step(extended, 0.001);
    expect(state.coins[0]?.y).toBe(DEFAULT_CONFIG.coinRadius);
  });
});

describe("step — 時間", () => {
  it("経過時間を積む", () => {
    const { state } = step(buildState([]), 0.5);
    expect(state.time).toBe(0.5);
  });

  it("元の状態を破壊しない", () => {
    const state = buildState([buildCoin({ y: DEFAULT_CONFIG.coinRadius })]);
    step(state, DEFAULT_CONFIG.pusherPeriod / 2);
    expect(state.coins[0]?.y).toBe(DEFAULT_CONFIG.coinRadius);
  });
});
