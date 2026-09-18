import { describe, expect, it } from "vitest";
import { DEFAULT_BALANCE } from "../game/balance.js";
import { createRng } from "../game/rng.js";
import { roomBody } from "./body.js";
import { createRoom, joinRoom, startGame, type Room } from "./room.js";
import { recordDeclaration } from "./tick-session.js";

const NOW = 1_700_000_000_000;

function playing(): Room {
  const lobby = ["A", "B", "C"].reduce(
    (room, name, i) => joinRoom(room, { name, token: `t${i + 1}`, isCpu: false }, NOW),
    createRoom("ABCDEF", NOW)
  );
  return startGame(lobby, createRng(1), DEFAULT_BALANCE, NOW);
}

/** 1 が中央レーンを狙って宣言した状態 */
function declared(): Room {
  const room = playing();
  const game = room.game;
  const tick = room.tick;
  if (game === null || tick === null) throw new Error("開始しているはず");

  return {
    ...room,
    tick: recordDeclaration(game, tick, {
      playerIndex: 1,
      key: "k1",
      declaration: { kind: "insert", laneIndex: 1, handIndexes: [0] },
    }),
  };
}

describe("roomBody — ティック", () => {
  it("ゲーム中はティックを載せる", () => {
    expect(roomBody(playing(), "p1").tick).toMatchObject({ index: 0, phase: "declaring" });
  });

  it("ロビーのあいだは載せない", () => {
    expect(roomBody(createRoom("ABCDEF", NOW), "p1").tick).toBeNull();
  });

  it("他人の宣言の中身はレスポンスのどこにも出ない（docs/realtime.md §8-3）", () => {
    const body = roomBody(declared(), "p1");

    expect(JSON.stringify(body)).not.toContain('"laneIndex":1');
    expect(body.tick?.players.find((p) => p.id === "p2")).toMatchObject({
      declared: true,
      declaration: null,
    });
  });

  it("自分の宣言は見える", () => {
    const body = roomBody(declared(), "p2");

    expect(body.tick?.players.find((p) => p.id === "p2")?.declaration).toEqual({
      kind: "insert",
      laneIndex: 1,
      handIndexes: [0],
    });
  });
});
