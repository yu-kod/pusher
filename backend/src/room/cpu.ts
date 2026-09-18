/**
 * CPU プレイヤーの自動宣言（#16）。
 *
 * 本ゲームでプレイヤーが考えるのは「投入したコインに対して獲得できるコインの
 * 期待値」ただ一点なので、CPU もシミュレーション（#49）と同じ期待値戦略を使う。
 * 戦略の実装は `sim/strategy.ts` と共有する。
 *
 * 人間と同じ情報しか見ない。レーンの奥の山と滞留の中身は使わず、枚数だけで判断する
 * （docs/spec.md §8）。
 */
import type { Rng } from "../game/rng.js";
import type { GameState } from "../game/setup.js";
import { expectedValueStrategy } from "../sim/strategy.js";
import type { Room } from "./room.js";
import { recordDeclaration, type Declaration, type TickSession } from "./tick-session.js";

const strategy = expectedValueStrategy();

/**
 * CPU の宣言を1ティックぶん入れる（`docs/spec.md` §3 ①）。
 *
 * 人間と同じく、締め切りより前に伏せて出すだけ。解決は `advanceTick` が全員ぶんを
 * まとめて行うので、ここでは盤面を動かさない。
 *
 * 冪等キーは「何ティック目の誰か」で決まる。同じリクエストが何度通っても、
 * 同じ CPU が二重に宣言することはない（`docs/realtime.md` §8-4）。
 */
export function declareForCpus(room: Room, rng: Rng, now: number): Room {
  const { game, tick } = room;
  if (game === null || tick === null || tick.phase !== "declaring") {
    return room;
  }

  const cpuSeats = tick.active.filter((seat) =>
    room.players.some((p) => p.id === game.players[seat]?.id && p.isCpu)
  );
  const declared = cpuSeats.reduce(
    (session: TickSession, seat) =>
      recordDeclaration(game, session, {
        playerIndex: seat,
        key: `cpu-${tick.index}-${seat}`,
        declaration: chooseDeclaration(game, seat, rng),
      }),
    tick
  );

  return declared === tick ? room : { ...room, tick: declared, updatedAt: now };
}

/**
 * CPU が何を宣言するかを決める。
 *
 * 期待値が正の投入が無ければ降りる。手札が尽きているときもここに来る
 * （`chooseInsertions` が空を返す）。
 *
 * 1宣言は1レーン（`docs/spec.md` §3 手順1）なので、戦略が複数レーンを選ぶ設定
 * （`maxLanesPerRound` を上げたプリセット）では先頭の1本だけを使う。
 */
function chooseDeclaration(game: GameState, seat: number, rng: Rng): Declaration {
  const insertions = strategy.chooseInsertions({ ...game, currentPlayerIndex: seat }, rng);
  const first = insertions[0];

  return first === undefined
    ? { kind: "withdraw" }
    : { kind: "insert", laneIndex: first.laneIndex, handIndexes: [...first.handIndexes] };
}
