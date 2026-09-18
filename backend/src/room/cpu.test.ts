import { describe, expect, it } from "vitest";
import { DEFAULT_BALANCE } from "../game/balance.js";
import { createRng } from "../game/rng.js";
import { declareForCpus } from "./cpu.js";
import { createRoom, joinRoom, startGame, type Room } from "./room.js";

const NOW = 1_700_000_000_000;

/** isCpu を指定してルームを作り、ゲームを開始する */
function startedRoom(cpuFlags: readonly boolean[]): Room {
  const lobby = cpuFlags.reduce(
    (room, isCpu, i) => joinRoom(room, { name: `P${i + 1}`, token: `t${i + 1}`, isCpu }, NOW),
    createRoom("ABCDEF", NOW)
  );
  return startGame(lobby, createRng(1), DEFAULT_BALANCE, NOW);
}

const seatsDeclared = (room: Room) => room.tick?.declarations.map((d) => d.playerIndex).sort();

describe("declareForCpus", () => {
  it("CPU のぶんだけ宣言する", () => {
    const room = startedRoom([false, true, true]);

    expect(seatsDeclared(declareForCpus(room, createRng(1), NOW))).toEqual([1, 2]);
  });

  it("全員が人間なら何もしない", () => {
    const room = startedRoom([false, false, false]);

    expect(declareForCpus(room, createRng(1), NOW)).toBe(room);
  });

  it("二重に宣言しない", () => {
    const once = declareForCpus(startedRoom([false, true, true]), createRng(1), NOW);

    expect(seatsDeclared(declareForCpus(once, createRng(1), NOW))).toEqual([1, 2]);
  });

  it("投入できる札がなければ降りると宣言する（docs/spec.md §3）", () => {
    const room = startedRoom([false, true, true]);
    const game = room.game;
    if (game === null) throw new Error("開始しているはず");
    const empty: Room = {
      ...room,
      game: { ...game, players: game.players.map((p, i) => (i === 1 ? { ...p, hand: [] } : p)) },
    };

    const next = declareForCpus(empty, createRng(1), NOW);

    expect(next.tick?.declarations.find((d) => d.playerIndex === 1)?.declaration).toEqual({
      kind: "withdraw",
    });
  });

  it("そのラウンドから降りた CPU には宣言させない", () => {
    const room = startedRoom([false, true, true]);
    const tick = room.tick;
    if (tick === null) throw new Error("開始しているはず");

    const next = declareForCpus({ ...room, tick: { ...tick, active: [0, 1] } }, createRng(1), NOW);

    expect(seatsDeclared(next)).toEqual([1]);
  });

  it("宣言の拍でなければ何もしない", () => {
    const room = startedRoom([false, true, true]);
    const tick = room.tick;
    if (tick === null) throw new Error("開始しているはず");
    const revealing: Room = { ...room, tick: { ...tick, phase: "revealing" } };

    expect(declareForCpus(revealing, createRng(1), NOW)).toBe(revealing);
  });

  it("ロビーでは何もしない", () => {
    const lobby = createRoom("ABCDEF", NOW);

    expect(declareForCpus(lobby, createRng(1), NOW)).toBe(lobby);
  });
});
