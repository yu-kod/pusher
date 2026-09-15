/**
 * CPU プレイヤーの自動進行（#16）。
 *
 * 本ゲームでプレイヤーが考えるのは「投入したコインに対して獲得できるコインの
 * 期待値」ただ一点なので、CPU もシミュレーション（#49）と同じ期待値戦略を使う。
 * 戦略の実装は `sim/strategy.ts` と共有する。
 *
 * 人間と同じ情報しか見ない。レーンの奥の山と滞留の中身は使わず、枚数だけで判断する
 * （docs/spec.md §8）。
 */
import { autoEventChooser } from "../game/chooser.js";
import { endRound, endTurn } from "../game/progress.js";
import type { Rng } from "../game/rng.js";
import { resolveInsertionRound } from "../game/round.js";
import type { GameState } from "../game/setup.js";
import { expectedValueStrategy } from "../sim/strategy.js";
import type { Room } from "./room.js";

const strategy = expectedValueStrategy();

/** 1手番ぶんを自動で打つ。投入できる札がなければ何もせずに返す */
function playTurn(game: GameState, rng: Rng): GameState {
  let current = game;

  for (;;) {
    const insertions = strategy.chooseInsertions(current, rng);
    if (insertions.length === 0) {
      break;
    }

    const result = resolveInsertionRound(current, insertions, autoEventChooser, rng);
    current = result.state;

    if (!result.canContinue || !strategy.shouldContinue(current, rng)) {
      break;
    }
  }

  return current;
}

/** 手番を終えて次へ回す。ラウンドが終わればラウンド終了処理も行う（docs/spec.md §3） */
function finishTurn(game: GameState, rng: Rng): GameState {
  const turn = endTurn(game);
  return turn.roundEnded ? endRound(turn.state, rng, autoEventChooser).state : turn.state;
}

/**
 * 手番が CPU のあいだ、自動で進める。
 *
 * 人間の手番になるか、ゲームが終わったら止まる。全員が CPU ならゲーム終了まで進む。
 * 1手番ごとに必ず手番が移るので、このループは必ず終わる。
 */
export function playCpuTurns(room: Room, rng: Rng, now: number): Room {
  if (room.game === null || room.game.phase !== "playing") {
    return room;
  }

  let game = room.game;
  let moved = false;

  while (game.phase === "playing") {
    const player = game.players[game.currentPlayerIndex];
    const isCpu = room.players.some((p) => p.id === player?.id && p.isCpu);
    if (!isCpu) {
      break;
    }

    // 未確定得点の確定は endTurn が行う。
    // 「投入口増設」の追加手番は扱わない（#16 の範囲外。手番は必ず1回で移る）
    game = finishTurn(playTurn(game, rng), rng);
    moved = true;
  }

  return moved ? { ...room, game, updatedAt: now } : room;
}
