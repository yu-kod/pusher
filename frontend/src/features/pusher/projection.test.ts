import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, type Coin } from "./simulation";
import { STAGE, placeCoin, project } from "./projection";

function buildCoin(overrides?: Partial<Coin>): Coin {
  return { id: 1, x: 50, y: 50, value: 1, spin: 0, phase: { kind: "field" }, ...overrides };
}

describe("project", () => {
  it("台の中央は画面の中央に来る", () => {
    const back = project(50, 0, DEFAULT_CONFIG);
    const front = project(50, DEFAULT_CONFIG.depth, DEFAULT_CONFIG);
    expect(back.x).toBeCloseTo(STAGE.width / 2);
    expect(front.x).toBeCloseTo(STAGE.width / 2);
  });

  it("奥ほど横幅が狭くなる", () => {
    const back = project(0, 0, DEFAULT_CONFIG);
    const front = project(0, DEFAULT_CONFIG.depth, DEFAULT_CONFIG);
    expect(back.x).toBeGreaterThan(front.x);
  });

  it("奥ほど小さく描く", () => {
    const back = project(50, 0, DEFAULT_CONFIG);
    const front = project(50, DEFAULT_CONFIG.depth, DEFAULT_CONFIG);
    expect(back.scale).toBeLessThan(front.scale);
  });

  it("手前ほど画面の下に来る", () => {
    const back = project(50, 0, DEFAULT_CONFIG);
    const front = project(50, DEFAULT_CONFIG.depth, DEFAULT_CONFIG);
    expect(back.y).toBeCloseTo(STAGE.backY);
    expect(front.y).toBeCloseTo(STAGE.frontY);
  });
});

describe("placeCoin", () => {
  it("台の上のコインはそのままの位置に出る", () => {
    const placed = placeCoin(buildCoin(), DEFAULT_CONFIG);
    const base = project(50, 50, DEFAULT_CONFIG);
    expect(placed.x).toBeCloseTo(base.x);
    expect(placed.y).toBeCloseTo(base.y);
    expect(placed.opacity).toBe(1);
  });

  it("投入直後のコインは上から降りてくる", () => {
    const coin = buildCoin({ phase: { kind: "dropping", remaining: DEFAULT_CONFIG.dropDuration } });
    const placed = placeCoin(coin, DEFAULT_CONFIG);
    const landed = placeCoin(buildCoin({ ...coin, phase: { kind: "field" } }), DEFAULT_CONFIG);
    expect(placed.y).toBeLessThan(landed.y);
    expect(placed.scale).toBeGreaterThan(landed.scale);
  });

  it("落下口へ落ちるコインは下へ抜けて消えていく", () => {
    const coin = buildCoin({ phase: { kind: "payout", remaining: 0.01 } });
    const placed = placeCoin(coin, DEFAULT_CONFIG);
    const base = project(50, 50, DEFAULT_CONFIG);
    expect(placed.y).toBeGreaterThan(base.y);
    expect(placed.opacity).toBeLessThan(0.2);
  });

  it("左の横穴へ落ちるコインは左へ逃げる", () => {
    const coin = buildCoin({ x: 0, phase: { kind: "sidehole", remaining: 0.01 } });
    const placed = placeCoin(coin, DEFAULT_CONFIG);
    const base = project(0, 50, DEFAULT_CONFIG);
    expect(placed.x).toBeLessThan(base.x);
  });

  it("右の横穴へ落ちるコインは右へ逃げる", () => {
    const coin = buildCoin({
      x: DEFAULT_CONFIG.width,
      phase: { kind: "sidehole", remaining: 0.01 },
    });
    const placed = placeCoin(coin, DEFAULT_CONFIG);
    const base = project(DEFAULT_CONFIG.width, 50, DEFAULT_CONFIG);
    expect(placed.x).toBeGreaterThan(base.x);
  });
});
