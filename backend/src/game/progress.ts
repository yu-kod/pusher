/**
 * 手番とラウンドの進行（docs/spec.md §3）。
 *
 * 投入ラウンドの中身は round.ts が担う。ここはその外側——手番を閉じて次へ回し、
 * ラウンドとゲームを終わらせるところ。
 */
import { isCoinCard, isEventCard, type Card } from "./deck.js";
import { settleJackpotAtGameEnd } from "./jackpot.js";
import { bankPendingPoints } from "./push.js";
import { resolveDrawnEvent, type EventChooser, type ResolvedEvent } from "./resolve.js";
import type { Rng } from "./rng.js";
import type { GameState, Player } from "./setup.js";

export type EndTurnResult = {
  state: GameState;
  /** 全員が1回ずつ手番を終えたか（docs/spec.md §3） */
  roundEnded: boolean;
};

/**
 * 手番を終えて次のプレイヤーへ回す（docs/spec.md §3）。
 *
 * 「やめる」を選んだ場合も、横穴で強制終了した場合も同じ経路を通る。
 * 横穴のときは未確定得点がすでにジャックポットへ移っている（§5）ので、
 * ここで加算されるのは 0 になる。
 */
export function endTurn(state: GameState): EndTurnResult {
  const banked = bankPendingPoints(state);
  const nextIndex = (banked.currentPlayerIndex + 1) % banked.players.length;

  return {
    state: { ...banked, currentPlayerIndex: nextIndex },
    // 先頭へ戻ったなら全員が1回ずつ手番を終えている
    roundEnded: nextIndex === 0,
  };
}

export type EndRoundResult = {
  state: GameState;
  /**
   * 山札も捨て札も尽きて、必要な枚数を引けなかったか（docs/spec.md §3）。
   *
   * true ならこの時点でゲーム終了になる。
   */
  deckExhausted: boolean;
  /** このラウンドでゲームが終わったか。true なら state.phase は "finished" */
  gameOver: boolean;
  /** ドローで引いて即座に解決したイベント（§6） */
  events: ResolvedEvent[];
};

/**
 * ラウンド終了処理を行う（docs/spec.md §3）。
 *
 * - 各プレイヤーが山札から `config.roundDrawCount` 枚ドローする。手札に上限はない
 * - 引いたイベントカードはその場で解決して捨て札にする。手札には入れない（§6）
 * - 各レーンへ `config.roundLaneRefillCount` 枚補充する（既定は 0。§4-3）
 * - ラウンド番号を1つ進める
 *
 * 山札が尽きたら捨て札をシャッフルして山札とする。それでも足りなければ
 * あるぶんだけ引き、`deckExhausted` で知らせる（docs/spec.md のルール解釈メモ）。
 *
 * 最終ラウンドを終えたか、山札も捨て札も尽きたらゲーム終了。未払い出しの
 * ジャックポットを処理し、`phase` を "finished" にする（§5）。
 */
export function endRound(
  state: GameState,
  rng: Pick<Rng, "shuffle" | "rollD6">,
  chooser: EventChooser
): EndRoundResult {
  let drawPile = state.drawPile;
  let discardPile = state.discardPile;
  let deckExhausted = false;

  const drawCards = (count: number): Card[] => {
    const taken: Card[] = [];

    while (taken.length < count) {
      if (drawPile.length === 0) {
        if (discardPile.length === 0) {
          // 山札も捨て札も尽きた。あるぶんだけ引いて終わる
          deckExhausted = true;
          return taken;
        }
        drawPile = rng.shuffle(discardPile);
        discardPile = [];
      }

      const take = Math.min(count - taken.length, drawPile.length);
      taken.push(...drawPile.slice(0, take));
      drawPile = drawPile.slice(take);
    }

    return taken;
  };

  // イベントカードは手札に入れず、あとでその場で解決する（§6）
  const drawn = state.players.map((player) => {
    const cards = drawCards(state.config.roundDrawCount);
    return {
      player: { ...player, hand: [...player.hand, ...cards.filter(isCoinCard)] },
      events: cards.filter(isEventCard),
    };
  });

  const lanes = state.lanes.map((lane) => ({
    ...lane,
    stock: [...lane.stock, ...drawCards(state.config.roundLaneRefillCount)],
  }));

  let next: GameState = {
    ...state,
    players: drawn.map((d) => d.player),
    lanes,
    drawPile,
    discardPile,
    round: state.round + 1,
  };

  // 引いたイベントを、引いた本人のものとして解決する（docs/spec.md のルール解釈メモ）。
  // 手番中ではないので、得点は未確定得点にせずその場で確定させる
  const events: ResolvedEvent[] = [];
  drawn.forEach((d, drawerIndex) => {
    if (d.events.length === 0) {
      return;
    }

    let drawer: GameState = { ...next, currentPlayerIndex: drawerIndex };
    for (const card of d.events) {
      const resolved = resolveDrawnEvent(drawer, card.event, chooser, rng);
      drawer = resolved.state;
      events.push(...resolved.events);
    }

    next = { ...bankPendingPoints(drawer), currentPlayerIndex: next.currentPlayerIndex };
  });

  // §3 ゲーム終了 — 12ラウンド経過、または山札も捨て札も尽きた時点
  const gameOver = deckExhausted || next.round > state.config.maxRounds;
  if (!gameOver) {
    return { state: next, deckExhausted, gameOver, events };
  }

  // §5 未払い出しのジャックポットの最終処理
  return {
    state: { ...settleJackpotAtGameEnd(next), phase: "finished" },
    deckExhausted,
    gameOver,
    events,
  };
}

/**
 * 勝者を決める（docs/spec.md §3）。
 *
 * 得点が最も多いプレイヤーの勝ち。同点なら **手札が多いほう** が勝つ
 * （少ない弾薬で同じ点数を得たため）。
 *
 * 得点も手札枚数も並んだ場合は引き分けとし、複数人を返す
 * （docs/spec.md のルール解釈メモ）。
 */
export function determineWinners(state: GameState): Player[] {
  const best = (players: readonly Player[], score: (player: Player) => number): Player[] => {
    const top = Math.max(...players.map(score));
    return players.filter((player) => score(player) === top);
  };

  // まず得点、並んだ人のあいだで手札枚数
  return best(
    best(state.players, (player) => player.points),
    (player) => player.hand.length
  );
}
