import { describe, expect, it } from "vitest";
import { DEFAULT_BALANCE } from "../game/balance.js";
import { createRng } from "../game/rng.js";
import type { GameState } from "../game/setup.js";
import { playCpuTurns } from "./cpu.js";
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

/** 手番プレイヤーの id */
function currentId(game: GameState): string {
  return game.players[game.currentPlayerIndex]?.id ?? "";
}

describe("playCpuTurns", () => {
  it("手番が人間ならそのまま返す", () => {
    const room = startedRoom([false, false, false]);

    expect(playCpuTurns(room, createRng(1), NOW)).toEqual(room);
  });

  it("手番が CPU なら人間の手番まで進める", () => {
    const room = startedRoom([false, true, true]);
    const afterHuman = { ...room, game: { ...room.game!, currentPlayerIndex: 1 } };

    const next = playCpuTurns(afterHuman, createRng(1), NOW);

    expect(currentId(next.game!)).toBe("p1");
  });

  it("CPU が得点を積む", () => {
    const room = startedRoom([false, true, true]);
    const afterHuman = { ...room, game: { ...room.game!, currentPlayerIndex: 1 } };

    const next = playCpuTurns(afterHuman, createRng(1), NOW);

    // 横穴を踏まなければ得点が入る。2人ぶん回すのでどちらかは入る
    expect(next.game!.players.slice(1).some((p) => p.points > 0)).toBe(true);
  });

  it("CPU の手札が減る", () => {
    const room = startedRoom([false, true, true]);
    const afterHuman = { ...room, game: { ...room.game!, currentPlayerIndex: 1 } };

    const next = playCpuTurns(afterHuman, createRng(1), NOW);

    expect(next.game!.players[1]!.hand.length).toBeLessThan(room.game!.players[1]!.hand.length);
  });

  it("全員 CPU ならゲームが終わるまで進む", () => {
    const room = startedRoom([true, true, true]);

    const next = playCpuTurns(room, createRng(1), NOW);

    expect(next.game?.phase).toBe("finished");
    expect(next.game?.round).toBeGreaterThan(DEFAULT_BALANCE.maxRounds);
  });

  it("全員 CPU でも勝者が決まる得点になる", () => {
    const next = playCpuTurns(startedRoom([true, true, true, true]), createRng(2), NOW);

    expect(next.game!.players.some((p) => p.points > 0)).toBe(true);
  });

  it("ゲームが始まっていなければそのまま返す", () => {
    const lobby = joinRoom(createRoom("ABCDEF", NOW), { name: "A", token: "t1", isCpu: true }, NOW);

    expect(playCpuTurns(lobby, createRng(1), NOW)).toEqual(lobby);
  });

  it("ゲームが終わっていればそのまま返す", () => {
    const room = startedRoom([true, true, true]);
    const finished = { ...room, game: { ...room.game!, phase: "finished" as const } };

    expect(playCpuTurns(finished, createRng(1), NOW)).toEqual(finished);
  });

  it("更新時刻を進める", () => {
    const room = startedRoom([true, true, true]);

    expect(playCpuTurns(room, createRng(1), NOW + 9).updatedAt).toBe(NOW + 9);
  });

  it("元のルームを変更しない", () => {
    const room = startedRoom([true, true, true]);
    const before = room.game!.players[0]!.hand.length;

    playCpuTurns(room, createRng(1), NOW);

    expect(room.game!.players[0]!.hand).toHaveLength(before);
  });

  it("投入できる札がない CPU の手番は、何も投入せずに次へ回る", () => {
    const room = startedRoom([false, true, true]);
    const game = room.game;
    if (game === null) throw new Error("ゲームが開始していない");

    // 2人目の CPU の手札を空にする
    const empty: Room = {
      ...room,
      game: {
        ...game,
        currentPlayerIndex: 1,
        players: game.players.map((p, i) => (i === 1 ? { ...p, hand: [] } : p)),
      },
    };

    const next = playCpuTurns(empty, createRng(1), NOW);

    // p2 は何も打たずに手番を終え、p3（CPU）も打ったあと人間へ戻る。
    // ラウンド終了のドローで得点が入ることはあるので、得点は見ない
    expect(currentId(next.game as GameState)).toBe("p1");
  });
});
