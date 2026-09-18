/**
 * ボール札（docs/turn-structure.md §4-3）。
 *
 * レーンの奥の山に1枚だけ混ざる、位置の見えるカード。あと何枚押し込めば落ちるかが
 * 全員に見えるので、**同じレーンを狙う理由**になる。
 */
import { describe, expect, it } from "vitest";
import { coin, faceDown } from "../test-utils/cards.js";
import { DEFAULT_BALANCE, withPreset } from "./balance.js";
import { ball, isBallCard, type Card, type DeckCard } from "./deck.js";
import { collectFallenCards, pendingPointsOf, resolvePush } from "./push.js";
import { collectAndResolveFall } from "./resolve.js";
import { autoEventChooser } from "./chooser.js";
import { createRng } from "./rng.js";
import { ballIndexOf, restockBalls } from "./ball.js";
import { setupGame, type GameState } from "./setup.js";

function buildState(stock: Card[], pending: DeckCard[]): GameState {
  const base = setupGame(["A", "B", "C"], createRng(1), withPreset("pushFull", "ballCards"));
  return {
    ...base,
    lanes: base.lanes.map((lane, i) =>
      i === 0 ? { ...lane, stock, pending: faceDown(pending) } : { ...lane, stock: [], pending: [] }
    ),
    players: base.players.map((p) => ({ ...p, hand: [] })),
  };
}

describe("ボール札の置き方", () => {
  it("既定では置かれない（v0.2 のまま）", () => {
    const state = setupGame(["A", "B", "C"], createRng(1), DEFAULT_BALANCE);

    expect(state.lanes.every((lane) => lane.stock.every((c) => !isBallCard(c)))).toBe(true);
  });

  it("ballCards を有効にすると、各レーンにちょうど1枚ずつ入る", () => {
    const state = setupGame(["A", "B", "C"], createRng(1), withPreset("ballCards"));

    for (const lane of state.lanes) {
      expect(lane.stock.filter(isBallCard)).toHaveLength(1);
    }
  });

  it("いちばん奥に入るので、レーンの厚みぶん押し込まないと落ちない", () => {
    const state = setupGame(["A", "B", "C"], createRng(1), withPreset("ballCards"));

    for (const lane of state.lanes) {
      expect(ballIndexOf(lane)).toBe(DEFAULT_BALANCE.initialLaneCards);
    }
  });

  it("ボール札のぶんレーンが1枚厚くなる", () => {
    const state = setupGame(["A", "B", "C"], createRng(1), withPreset("ballCards"));

    expect(state.lanes[0]?.stock).toHaveLength(DEFAULT_BALANCE.initialLaneCards + 1);
  });

  it("ボール札が無いレーンの位置は null", () => {
    expect(ballIndexOf({ stock: [coin(1)], pending: [], hasExtraSlot: false })).toBeNull();
  });
});

describe("ボール札が落ちる", () => {
  it("末端まで来たら落ちる", () => {
    // 末端が ball → 1枚押し込めば落ちる
    const state = buildState([ball(), coin(1), coin(1)], [coin(1), coin(1)]);

    const result = resolvePush(state, 0, 1);

    expect(result.fallenCards.filter(isBallCard)).toHaveLength(1);
  });

  it("落ちるまでの枚数が位置そのものになる", () => {
    // 添字2にボール → 3枚押し込むまで落ちない
    const state = buildState([coin(1), coin(1), ball(), coin(1)], [coin(1), coin(1), coin(1)]);

    expect(resolvePush(state, 0, 2).fallenCards.filter(isBallCard)).toHaveLength(0);
    expect(resolvePush(state, 0, 3).fallenCards.filter(isBallCard)).toHaveLength(1);
  });

  it("落ちたら、そのレーンの奥に新しいボール札が入る（§4-3）", () => {
    const state = buildState([ball(), coin(1), coin(1)], [coin(1), coin(1)]);

    const lane = resolvePush(state, 0, 1).state.lanes[0];

    expect(lane?.stock.filter(isBallCard)).toHaveLength(1);
    expect(ballIndexOf(lane!)).toBe(lane!.stock.length - 1);
  });

  it("入れ直してもレーンの厚みは変わらない（docs/spec.md §4-3）", () => {
    // 押し込んだ1枚はレーンに残り、出ていったのはボール札。そこへ新しいボール札を
    // 入れるとレーンが1枚厚くなってしまうので、いちばん奥の1枚を山札へ戻す。
    // レーンの厚みが一定でないと、ゲームが進むほどレーンが重くなっていく
    const state = buildState([ball(), coin(1), coin(1)], [coin(1), coin(1)]);

    const before = state.lanes[0]?.stock.length ?? 0;

    expect(resolvePush(state, 0, 1).state.lanes[0]?.stock).toHaveLength(before);
  });

  it("入れ直しで押し出された1枚は山札へ戻る（カードは消えない）", () => {
    const state = buildState([ball(), coin(2), coin(3)], [coin(1), coin(1)]);

    const after = resolvePush(state, 0, 1).state;

    expect(after.drawPile).toHaveLength(state.drawPile.length + 1);
  });

  it("コイン札だけが落ちたラウンドは厚みが変わらない（§4-3 の既定）", () => {
    const state = buildState([coin(1), coin(1), ball()], [coin(1), coin(1)]);

    const before = state.lanes[0]?.stock.length ?? 0;

    expect(resolvePush(state, 0, 1).state.lanes[0]?.stock).toHaveLength(before);
  });

  it("ボール札が落ちなければ増えない", () => {
    const state = buildState([coin(1), coin(1), ball()], [coin(1), coin(1)]);

    expect(resolvePush(state, 0, 1).state.lanes[0]?.stock.filter(isBallCard)).toHaveLength(1);
  });
});

describe("ボール札の得点", () => {
  it("大きな点が未確定得点に入る（§4-3）", () => {
    const state = buildState([], []);

    const after = collectFallenCards(state, [ball()]);

    expect(pendingPointsOf(after)).toBe(DEFAULT_BALANCE.ballPoints);
  });

  it("コイン札と一緒に落ちたら両方入る", () => {
    const state = buildState([], []);

    const after = collectFallenCards(state, [coin(3), ball()]);

    expect(pendingPointsOf(after)).toBe(3 + DEFAULT_BALANCE.ballPoints);
  });

  it("山札にも捨て札にも戻らない（レーンへ入れ直すため）", () => {
    const state = buildState([], []);

    const after = collectFallenCards(state, [ball()]);

    expect(after.drawPile.filter(isBallCard)).toHaveLength(0);
    expect(after.discardPile.filter(isBallCard)).toHaveLength(0);
  });
});

describe("ボール札はレーンから消えない", () => {
  it("「もう1枚落とす」でボール札が落ちても入れ直される（docs/spec.md §6-3）", () => {
    // 「もう1枚落とす」は押し込みを伴わずに末端から1枚抜く。ここで入れ直さないと、
    // そのレーンは二度とボール札を持たない（イベントを踏んだレーンほど不利になる）
    const state = buildState([{ kind: "event", event: "extraSlot" }, ball(), coin(1)], []);

    const after = collectAndResolveFall(
      state,
      0,
      [{ kind: "event", event: "extraSlot" }],
      autoEventChooser,
      { rollD6: () => 1 }
    );

    expect(after.state.lanes[0]?.stock.filter(isBallCard)).toHaveLength(1);
  });
});

describe("restockBalls", () => {
  it("戻せるカードが無ければ、ボール札を入れるだけ", () => {
    // レーンが削られてボール札しか残っていない状態。山札へ戻す1枚が取れない
    const result = restockBalls([], [ball()]);

    expect(result.stock).toHaveLength(1);
    expect(result.returned).toEqual([]);
  });

  it("落ちたのがコイン札だけなら何もしない", () => {
    const stock = [coin(1), coin(2)];

    const result = restockBalls(stock, [coin(3)]);

    expect(result.stock).toEqual(stock);
    expect(result.returned).toEqual([]);
  });

  it("戻すのはいちばん奥のカードで、ボール札は選ばない", () => {
    const result = restockBalls([coin(1), ball(), coin(3)], [ball()]);

    expect(result.returned).toEqual([coin(3)]);
    expect(result.stock.filter(isBallCard)).toHaveLength(2);
  });
});
