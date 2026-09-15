/**
 * 落下カードの解決（docs/spec.md §6「基本の扱い」）。
 *
 * 押し出しやイベントで落ちたカードを点数にし、その中にイベントカードがあれば
 *
 *   1. 効果を即座に解決する
 *   2. 捨て札にする
 *   3. そのレーンからもう1枚落とす（この点数も獲得する）
 *
 * を適用する。3 で落ちたカードもイベントなら §6 を再適用する
 * （docs/spec.md のルール解釈メモ「イベントは連鎖する」）。
 * 連鎖はレーンの中身を1枚ずつ消費するので必ず終わる。
 */
import { isEventCard, type Card, type EventKind } from "./deck.js";
import { resolveAvalanche, resolveExtraSlot, resolveLottery, resolveOpenLane } from "./events.js";
import { collectFallenCards } from "./push.js";
import type { Rng } from "./rng.js";
import type { GameState } from "./setup.js";

/**
 * イベントの解決に必要な選択（docs/spec.md のルール解釈メモ）。
 *
 * エンジンは I/O を持たないので、プレイヤーの選択は引数で受け取る。
 * いつ誰に選ばせるかは手番の進行と API の責務。
 */
export type EventChooser = {
  /** 「横穴開放」「投入口増設」の対象レーンを選ぶ */
  chooseLane(state: GameState, event: EventKind): number;
  /** 「横穴開放」で公開した滞留から1枚選ぶ。滞留が空のレーンでは呼ばれない */
  choosePending(state: GameState, laneIndex: number): number;
};

export type ResolvedEvent = {
  event: EventKind;
  /** 「投入口増設」は引いた人が即座にもう1手番行える（§6 / ルール解釈メモ） */
  extraTurn: boolean;
};

export type ResolveResult = {
  state: GameState;
  /** 解決したイベント。連鎖した順に並ぶ */
  events: ResolvedEvent[];
};

/** レーンの末端からもう1枚落とす（§6-3）。レーンが空なら何も落ちない */
function dropOneMore(state: GameState, laneIndex: number): { state: GameState; fallen: Card[] } {
  const fallen = state.lanes.flatMap((lane, index) =>
    index === laneIndex ? lane.stock.slice(0, 1) : []
  );
  const lanes = state.lanes.map((lane, index) =>
    index === laneIndex ? { ...lane, stock: lane.stock.slice(1) } : lane
  );

  return { state: { ...state, lanes }, fallen };
}

/** イベントの効果そのものを適用する（§6）。「もう1枚落とす」はここでは行わない */
function applyEvent(
  state: GameState,
  event: EventKind,
  chooser: EventChooser,
  rng: Pick<Rng, "rollD6">
): ResolveResult {
  switch (event) {
    case "avalanche": {
      const avalanche = resolveAvalanche(state);
      // 各レーンの落下カードにも §6 を適用する（ルール解釈メモ）
      return avalanche.lanes.reduce<ResolveResult>(
        (acc, { laneIndex, fallenCards }) => {
          const resolved = collectAndResolveFall(acc.state, laneIndex, fallenCards, chooser, rng);
          return { state: resolved.state, events: [...acc.events, ...resolved.events] };
        },
        { state: avalanche.state, events: [] }
      );
    }

    case "openLane": {
      const laneIndex = chooser.chooseLane(state, event);
      const pending = state.lanes.flatMap((lane, index) =>
        index === laneIndex ? lane.pending : []
      );
      // 滞留が空なら選ぶものがない。resolveOpenLane も何もせずに返す
      const pickIndex = pending.length === 0 ? 0 : chooser.choosePending(state, laneIndex);
      return { state: resolveOpenLane(state, laneIndex, pickIndex).state, events: [] };
    }

    case "extraSlot":
      return { state: resolveExtraSlot(state, chooser.chooseLane(state, event)), events: [] };

    case "lottery":
      return { state: resolveLottery(state, rng).state, events: [] };
  }
}

/**
 * 落ちたカードを点数にし、含まれるイベントを §6 のとおり解決する。
 *
 * `laneIndex` は落下元のレーン。§6-3 の「もう1枚落とす」に使う。
 */
export function collectAndResolveFall(
  state: GameState,
  laneIndex: number,
  fallenCards: readonly Card[],
  chooser: EventChooser,
  rng: Pick<Rng, "rollD6">
): ResolveResult {
  // コインカードは点数へ、イベントカードは捨て札へ（§4-2 §6-2）
  let current = collectFallenCards(state, fallenCards);
  const events: ResolvedEvent[] = [];

  for (const card of fallenCards.filter(isEventCard)) {
    // §6-1 効果を即座に解決する
    const applied = applyEvent(current, card.event, chooser, rng);
    current = applied.state;
    events.push({ event: card.event, extraTurn: card.event === "extraSlot" }, ...applied.events);

    // §6-3 そのレーンからもう1枚落とす。それもイベントなら連鎖する
    const dropped = dropOneMore(current, laneIndex);
    const chained = collectAndResolveFall(dropped.state, laneIndex, dropped.fallen, chooser, rng);
    current = chained.state;
    events.push(...chained.events);
  }

  return { state: current, events };
}

/**
 * ラウンド終了時のドローで引いたイベントを解決する（docs/spec.md §6）。
 *
 * 効果を解決してカードを捨て札にする。落下元のレーンが存在しないため
 * 「もう1枚落とす」は行わない。
 *
 * 「投入口増設」でも **追加手番は発生しない**。ラウンドの区切りをまたぐため、
 * 誰の手番の前に差し込むのかが決められない（docs/spec.md のルール解釈メモ）。
 *
 * 効果の受益者は手番プレイヤーではなく引いた本人なので、呼び出し側が
 * `currentPlayerIndex` を引いた人に合わせてから渡す。
 */
export function resolveDrawnEvent(
  state: GameState,
  event: EventKind,
  chooser: EventChooser,
  rng: Pick<Rng, "rollD6">
): ResolveResult {
  const applied = applyEvent(state, event, chooser, rng);

  return {
    state: {
      ...applied.state,
      discardPile: [...applied.state.discardPile, { kind: "event", event }],
    },
    events: [{ event, extraTurn: false }, ...applied.events],
  };
}
