import { describe, expect, it } from "vitest";
import { DEFAULT_BALANCE, withPreset } from "../game/balance.js";
import { createRng } from "../game/rng.js";
import { createRoom, joinRoom, startGame } from "./room.js";
import { deserializeRoom, serializeRoom } from "./serialize.js";

const NOW = 1_700_000_000_000;

function startedRoom() {
  const lobby = ["A", "B", "C"].reduce(
    (room, name, i) => joinRoom(room, { name, token: `t${i + 1}`, isCpu: false }, NOW),
    createRoom("ABCDEF", NOW)
  );
  return startGame(lobby, createRng(1), DEFAULT_BALANCE, NOW);
}

describe("ルームの保存と復元", () => {
  it("往復しても同じルームになる", () => {
    const room = startedRoom();

    expect(deserializeRoom(serializeRoom(room), DEFAULT_BALANCE)).toEqual(room);
  });

  it("ロビーのままでも往復できる", () => {
    const room = createRoom("ABCDEF", NOW);

    expect(deserializeRoom(serializeRoom(room), DEFAULT_BALANCE)).toEqual(room);
  });

  it("復元後も pushCount が関数として動く", () => {
    const restored = deserializeRoom(serializeRoom(startedRoom()), DEFAULT_BALANCE);

    expect(restored.game?.config.pushCount(3)).toBe(DEFAULT_BALANCE.pushCount(3));
  });

  it("保存した JSON に関数は含まれない", () => {
    const json = serializeRoom(startedRoom());

    expect(json).not.toContain("pushCount");
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("復元時に渡した調整値が入る", () => {
    const restored = deserializeRoom(serializeRoom(startedRoom()), withPreset("pushFull"));

    expect(restored.game?.config.pushCount(3)).toBe(3);
  });

  it("保存してもカードの中身は失われない", () => {
    const room = startedRoom();

    const restored = deserializeRoom(serializeRoom(room), DEFAULT_BALANCE);

    expect(restored.game?.lanes[0]?.stock).toEqual(room.game?.lanes[0]?.stock);
    expect(restored.game?.players[0]?.hand).toEqual(room.game?.players[0]?.hand);
  });
});
