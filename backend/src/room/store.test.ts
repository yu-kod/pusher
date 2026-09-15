import { describe, expect, it } from "vitest";
import { createRoom, joinRoom } from "./room.js";
import { createInMemoryRoomStore } from "./store.js";

const NOW = 1_700_000_000_000;

describe("createInMemoryRoomStore", () => {
  it("保存したルームを取り出せる", async () => {
    const store = createInMemoryRoomStore();
    const room = createRoom("ABCDEF", NOW);

    await store.save(room);

    await expect(store.get("ABCDEF")).resolves.toEqual(room);
  });

  it("知らないコードなら null を返す", async () => {
    await expect(createInMemoryRoomStore().get("NOPE12")).resolves.toBeNull();
  });

  it("同じコードで保存し直すと上書きされる", async () => {
    const store = createInMemoryRoomStore();
    const room = createRoom("ABCDEF", NOW);
    await store.save(room);

    await store.save(joinRoom(room, { name: "A", token: "t1", isCpu: false }, NOW));

    await expect(store.get("ABCDEF")).resolves.toMatchObject({ players: [{ name: "A" }] });
  });

  it("削除できる", async () => {
    const store = createInMemoryRoomStore();
    await store.save(createRoom("ABCDEF", NOW));

    await store.delete("ABCDEF");

    await expect(store.get("ABCDEF")).resolves.toBeNull();
  });

  it("知らないコードを削除しても壊れない", async () => {
    await expect(createInMemoryRoomStore().delete("NOPE12")).resolves.toBeUndefined();
  });

  it("ストアごとに中身は独立している", async () => {
    const a = createInMemoryRoomStore();
    const b = createInMemoryRoomStore();

    await a.save(createRoom("ABCDEF", NOW));

    await expect(b.get("ABCDEF")).resolves.toBeNull();
  });

  it("取り出したルームを変更してもストアの中身は変わらない", async () => {
    const store = createInMemoryRoomStore();
    await store.save(createRoom("ABCDEF", NOW));

    const room = await store.get("ABCDEF");
    room?.players.push({ id: "p1", name: "A", token: "t1", isCpu: false });

    await expect(store.get("ABCDEF")).resolves.toMatchObject({ players: [] });
  });
});
