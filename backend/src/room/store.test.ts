import { describe, expect, it } from "vitest";
import { createRoom, joinRoom } from "./room.js";
import { createInMemoryRoomStore, RoomConflictError } from "./store.js";

const NOW = 1_700_000_000_000;

describe("createInMemoryRoomStore", () => {
  it("作成したルームを取り出せる", async () => {
    const store = createInMemoryRoomStore();
    const room = createRoom("ABCDEF", NOW);

    await store.create(room);

    await expect(store.get("ABCDEF")).resolves.toEqual({ room, rev: 1 });
  });

  it("知らないコードなら null を返す", async () => {
    await expect(createInMemoryRoomStore().get("NOPE12")).resolves.toBeNull();
  });

  it("同じコードで作り直そうとすると弾く", async () => {
    const store = createInMemoryRoomStore();
    await store.create(createRoom("ABCDEF", NOW));

    await expect(store.create(createRoom("ABCDEF", NOW))).rejects.toBeInstanceOf(RoomConflictError);
  });

  it("読んだ版を指定すれば更新できる", async () => {
    const store = createInMemoryRoomStore();
    const room = createRoom("ABCDEF", NOW);
    await store.create(room);
    const stored = await store.get("ABCDEF");

    await store.update(joinRoom(room, { name: "A", token: "t1", isCpu: false }, NOW), stored!.rev);

    await expect(store.get("ABCDEF")).resolves.toMatchObject({
      room: { players: [{ name: "A" }] },
      rev: 2,
    });
  });

  it("古い版を指定した更新は弾く（同時更新で先の結果を踏み潰さない）", async () => {
    const store = createInMemoryRoomStore();
    const room = createRoom("ABCDEF", NOW);
    await store.create(room);
    // 2人が同じ版を読んだ状態
    const first = await store.get("ABCDEF");
    const second = await store.get("ABCDEF");

    await store.update(joinRoom(room, { name: "A", token: "t1", isCpu: false }, NOW), first!.rev);

    await expect(
      store.update(joinRoom(room, { name: "B", token: "t2", isCpu: false }, NOW), second!.rev)
    ).rejects.toBeInstanceOf(RoomConflictError);
    await expect(store.get("ABCDEF")).resolves.toMatchObject({
      room: { players: [{ name: "A" }] },
    });
  });

  it("無いルームの更新は弾く", async () => {
    const store = createInMemoryRoomStore();

    await expect(store.update(createRoom("NOPE12", NOW), 1)).rejects.toBeInstanceOf(
      RoomConflictError
    );
  });

  it("削除できる", async () => {
    const store = createInMemoryRoomStore();
    await store.create(createRoom("ABCDEF", NOW));

    await store.delete("ABCDEF");

    await expect(store.get("ABCDEF")).resolves.toBeNull();
  });

  it("知らないコードを削除しても壊れない", async () => {
    await expect(createInMemoryRoomStore().delete("NOPE12")).resolves.toBeUndefined();
  });

  it("ストアごとに中身は独立している", async () => {
    const a = createInMemoryRoomStore();
    const b = createInMemoryRoomStore();

    await a.create(createRoom("ABCDEF", NOW));

    await expect(b.get("ABCDEF")).resolves.toBeNull();
  });

  it("取り出したルームを変更してもストアの中身は変わらない", async () => {
    const store = createInMemoryRoomStore();
    await store.create(createRoom("ABCDEF", NOW));

    const stored = await store.get("ABCDEF");
    stored?.room.players.push({ id: "p1", name: "A", token: "t1", isCpu: false });

    await expect(store.get("ABCDEF")).resolves.toMatchObject({ room: { players: [] } });
  });
});
