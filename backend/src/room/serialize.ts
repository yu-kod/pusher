/**
 * ルームの保存形式。
 *
 * ## なぜ専用の変換が要るか
 *
 * `Balance.pushCount` は**関数**なので、`GameState` をそのまま `JSON.stringify`
 * すると黙って消える。復元した状態で押し出しを解決しようとすると
 * `state.config.pushCount is not a function` で落ちる。
 *
 * DynamoDB（#20）でも同じことが起きるため、保存時に調整値を外し、復元時に
 * 付け直す処理をここに集約する。**保存する状態に関数を含めない**。
 */
import type { Balance } from "../game/balance.js";
import type { GameState } from "../game/setup.js";
import type { Room } from "./room.js";

/** 保存する形。調整値だけが抜けている */
type StoredGame = Omit<GameState, "config">;
type StoredRoom = Omit<Room, "game"> & { game: StoredGame | null };

export function serializeRoom(room: Room): string {
  const { game, ...rest } = room;
  if (game === null) {
    return JSON.stringify({ ...rest, game: null } satisfies StoredRoom);
  }

  const { config: _config, ...storedGame } = game;
  return JSON.stringify({ ...rest, game: storedGame } satisfies StoredRoom);
}

/** 保存した JSON を、指定の調整値を付け直して復元する */
export function deserializeRoom(json: string, config: Balance): Room {
  const stored = JSON.parse(json) as StoredRoom;

  return {
    ...stored,
    game: stored.game === null ? null : { ...stored.game, config },
  };
}
