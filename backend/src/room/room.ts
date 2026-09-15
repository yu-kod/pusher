/**
 * ルーム（卓）のドメイン。
 *
 * アカウントを作らせないので、ルームコードの共有だけで 3〜4人が集まれるようにする。
 * ゲームの状態そのものは `game/` のエンジンが持ち、ここはその外側——誰が卓にいるか、
 * まだロビーか、始まっているか——を扱う。
 *
 * ゲームエンジンと同じく I/O を持たない。時刻も乱数も引数で受け取る。
 */
import type { Balance } from "../game/balance.js";
import type { Rng } from "../game/rng.js";
import { setupGame, type GameState, type PlayerId } from "../game/setup.js";

/**
 * ルームコードに使う文字。
 *
 * 読み上げや手入力で取り違えやすい 0/O と 1/I を除いてある。
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

/** 3〜4人用（docs/spec.md 冒頭） */
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 4;

export type RoomCode = string;

export type RoomPhase = "lobby" | "playing";

export type RoomPlayer = {
  /** 参加順に p1, p2, ... を振る。setupGame が作る id と一致させる */
  id: PlayerId;
  name: string;
  /**
   * 本人確認用のトークン。
   *
   * アカウントがないので、参加時に発行したこの値を以後の操作で提示させる。
   * 他人の手番を勝手に進めたり、他人の手札を覗いたりできないようにするため、
   * **クライアントへ返すビューには含めない**。
   */
  token: string;
  isCpu: boolean;
};

export type Room = {
  code: RoomCode;
  phase: RoomPhase;
  players: RoomPlayer[];
  /** ゲーム開始後のみ入る */
  game: GameState | null;
  createdAt: number;
  updatedAt: number;
};

/** ルームコードを1つ作る（衝突の確認は呼び出し側の責務） */
export function generateRoomCode(rng: Pick<Rng, "nextInt">): RoomCode {
  return Array.from({ length: CODE_LENGTH }, () =>
    CODE_ALPHABET.charAt(rng.nextInt(CODE_ALPHABET.length))
  ).join("");
}

export function createRoom(code: RoomCode, now: number): Room {
  return { code, phase: "lobby", players: [], game: null, createdAt: now, updatedAt: now };
}

export type JoinRequest = {
  name: string;
  token: string;
  isCpu: boolean;
};

/** ロビーにプレイヤーを加える */
export function joinRoom(room: Room, request: JoinRequest, now: number): Room {
  if (room.phase !== "lobby") {
    throw new Error("ゲームが開始しているルームには参加できない");
  }
  if (room.players.length >= MAX_PLAYERS) {
    throw new Error(`ルームが満員（${MAX_PLAYERS}人まで）`);
  }
  if (room.players.some((p) => p.name === request.name)) {
    throw new Error(`同じ表示名のプレイヤーがすでにいる: ${request.name}`);
  }

  const player: RoomPlayer = {
    id: `p${room.players.length + 1}`,
    name: request.name,
    token: request.token,
    isCpu: request.isCpu,
  };

  return { ...room, players: [...room.players, player], updatedAt: now };
}

/**
 * ゲームを開始する（docs/spec.md §2）。
 *
 * シードから作った Rng をそのまま渡す。参加順がそのまま手番順になり、
 * `setupGame` が振る id（p1, p2, ...）は joinRoom が振った id と一致する。
 */
export function startGame(room: Room, rng: Rng, config: Balance, now: number): Room {
  if (room.phase !== "lobby") {
    throw new Error("すでに開始しているルームは開始できない");
  }
  if (room.players.length < MIN_PLAYERS || room.players.length > MAX_PLAYERS) {
    throw new RangeError(`${MIN_PLAYERS}〜4人で開始する必要がある: ${room.players.length} 人`);
  }

  return {
    ...room,
    phase: "playing",
    game: setupGame(
      room.players.map((p) => p.name),
      rng,
      config
    ),
    updatedAt: now,
  };
}
