/**
 * ルーム1つぶんのティックを進める（`docs/realtime.md` §8-2）。
 *
 * 常駐プロセスを置かない代わりに、**通りかかったリクエストがここを1回呼ぶ。**
 * 締め切りが来ていれば解決し、演出が終わっていれば次のティックを開く。
 *
 * 1リクエストの中で「解決 → 次のティックが開く → CPU がまた宣言する」まで進む
 * ことがあるので、進まなくなるまで回す。新しく開いた拍で CPU が黙っていると、
 * 次の誰かのリクエストまで卓が止まって見える。
 *
 * 必ず止まる。公開の拍は必ず `now` より先に終わるので、1回の呼び出しで
 * 締め切りを2回またぐことはない。
 */
import type { Rng } from "../game/rng.js";
import { declareForCpus } from "./cpu.js";
import type { Room } from "./room.js";
import { advanceTick, type TickDeps } from "./tick-session.js";

export function runTick(room: Room, deps: TickDeps & { rng: Rng }, now: number): Room {
  let current = room;

  for (;;) {
    const next = once(current, deps, now);
    if (next === current) {
      return current;
    }
    current = next;
  }
}

/** CPU に宣言させ、進めるだけ進める。何も起きなければ受け取ったルームをそのまま返す */
function once(room: Room, deps: TickDeps & { rng: Rng }, now: number): Room {
  const declared = declareForCpus(room, deps.rng, now);
  const { game, tick } = declared;
  if (game === null || tick === null) {
    return declared;
  }

  const advanced = advanceTick(game, tick, deps, now);
  if (advanced.session === tick) {
    // 進まなかった。ここで新しいルームを作ると、誰かが状態を見るたびに rev が
    // 動いてしまい、スナップショットの新しさを比べられなくなる（§3）
    return declared;
  }

  return { ...declared, game: advanced.game, tick: advanced.session, updatedAt: now };
}
