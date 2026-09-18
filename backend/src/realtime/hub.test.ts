import { describe, expect, it, vi } from "vitest";
import { DEFAULT_BALANCE } from "../game/balance.js";
import { createRng } from "../game/rng.js";
import { createRoom, joinRoom, startGame, type Room } from "../room/room.js";
import { createInMemoryRoomStore, type RoomStore } from "../room/store.js";
import { createRealtimeHub, type Send } from "./hub.js";
import { PROTOCOL_VERSION } from "./protocol.js";
import { createInMemoryConnectionRegistry } from "./registry.js";

const NOW = 1_700_000_000_000;
const CODE = "ABC234";

function lobby(): Room {
  const names = ["あかり", "ひなた", "みなと"];
  return names.reduce(
    (room, name, i) => joinRoom(room, { name, token: `t${i + 1}`, isCpu: false }, NOW),
    createRoom(CODE, NOW)
  );
}

function playing(): Room {
  return startGame(lobby(), createRng(1), DEFAULT_BALANCE, NOW + 1);
}

async function setup(room: Room | null = lobby()) {
  const store: RoomStore = createInMemoryRoomStore();
  if (room !== null) {
    await store.save(room);
  }
  const registry = createInMemoryConnectionRegistry();
  const send = vi.fn<Send>(() => Promise.resolve());
  const hub = createRealtimeHub({ store, registry, send });
  return { store, registry, send, hub };
}

const hello = (token?: string) =>
  JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, code: CODE, token });

describe("createRealtimeHub", () => {
  describe("hello", () => {
    it("トークンを出した接続を受理し、その人向けのスナップショットを送る", async () => {
      const { hub, send } = await setup();

      await hub.handleMessage("c1", hello("t1"));

      expect(send).toHaveBeenNthCalledWith(1, "c1", {
        t: "welcome",
        v: PROTOCOL_VERSION,
        code: CODE,
        playerId: "p1",
      });
      expect(send).toHaveBeenNthCalledWith(2, "c1", {
        t: "room",
        rev: NOW,
        room: expect.objectContaining({ code: CODE, phase: "lobby" }),
      });
    });

    it("トークンのない接続は観戦者として受理する", async () => {
      const { hub, send } = await setup();

      await hub.handleMessage("c1", hello());

      expect(send).toHaveBeenNthCalledWith(
        1,
        "c1",
        expect.objectContaining({ t: "welcome", playerId: null })
      );
    });

    it("受理した接続はそのルームの配信先になる", async () => {
      const { hub, registry } = await setup();

      await hub.handleMessage("c1", hello("t1"));

      await expect(registry.listByRoom(CODE)).resolves.toEqual([
        { connectionId: "c1", code: CODE, playerId: "p1" },
      ]);
    });

    it("知らないルームコードは error を返し、配信先にしない", async () => {
      const { hub, send, registry } = await setup(null);

      await hub.handleMessage("c1", hello("t1"));

      expect(send).toHaveBeenCalledWith("c1", {
        t: "error",
        code: "ROOM_NOT_FOUND",
        message: expect.any(String),
      });
      await expect(registry.listByRoom(CODE)).resolves.toEqual([]);
    });

    it("そのルームのものでないトークンは error を返し、配信先にしない", async () => {
      const { hub, send, registry } = await setup();

      await hub.handleMessage("c1", hello("よそのトークン"));

      expect(send).toHaveBeenCalledWith("c1", {
        t: "error",
        code: "FORBIDDEN",
        message: expect.any(String),
      });
      await expect(registry.listByRoom(CODE)).resolves.toEqual([]);
    });

    it("対応していないプロトコルバージョンは error を返す", async () => {
      const { hub, send } = await setup();

      await hub.handleMessage("c1", JSON.stringify({ t: "hello", v: 99, code: CODE }));

      expect(send).toHaveBeenCalledWith("c1", {
        t: "error",
        code: "UNSUPPORTED_VERSION",
        message: expect.any(String),
      });
    });

    it("読めないメッセージは error を返すだけで、接続は落とさない", async () => {
      const { hub, send } = await setup();

      await hub.handleMessage("c1", "{");

      expect(send).toHaveBeenCalledWith("c1", {
        t: "error",
        code: "BAD_MESSAGE",
        message: expect.any(String),
      });
    });
  });

  describe("ping", () => {
    it("pong を返す", async () => {
      const { hub, send } = await setup();

      await hub.handleMessage("c1", JSON.stringify({ t: "ping" }));

      expect(send).toHaveBeenCalledWith("c1", { t: "pong" });
    });
  });

  describe("publish", () => {
    it("同じルームの接続すべてへ配信する", async () => {
      const { hub, send } = await setup();
      await hub.handleMessage("c1", hello("t1"));
      await hub.handleMessage("c2", hello("t2"));
      send.mockClear();

      const updated = { ...lobby(), updatedAt: NOW + 5 };
      await hub.publish(updated);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenCalledWith("c1", expect.objectContaining({ t: "room", rev: NOW + 5 }));
      expect(send).toHaveBeenCalledWith("c2", expect.objectContaining({ t: "room", rev: NOW + 5 }));
    });

    it("接続ごとに、その人向けにマスクした状態を送る", async () => {
      const room = playing();
      const { hub, send } = await setup(room);
      await hub.handleMessage("c1", hello("t1"));
      await hub.handleMessage("c2", hello("t2"));
      send.mockClear();

      await hub.publish(room);

      const sentTo = (id: string) =>
        send.mock.calls.find(([connectionId]) => connectionId === id)?.[1];
      expect(sentTo("c1")).toMatchObject({ room: { game: { viewerId: "p1" } } });
      expect(sentTo("c2")).toMatchObject({ room: { game: { viewerId: "p2" } } });
    });

    it("観戦者には誰の手札も中身を送らない", async () => {
      const room = playing();
      const { hub, send } = await setup(room);
      await hub.handleMessage("c1", hello());
      send.mockClear();

      await hub.publish(room);

      const body = JSON.stringify(send.mock.calls[0]?.[1]);
      expect(body).not.toContain('"cards"');
    });

    it("別のルームの接続へは配信しない", async () => {
      const { hub, send, registry } = await setup();
      await registry.add({ connectionId: "other", code: "XYZ789", playerId: null });
      await hub.handleMessage("c1", hello("t1"));
      send.mockClear();

      await hub.publish(lobby());

      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith("c1", expect.anything());
    });

    it("すでに閉じている接続はレジストリから外し、他への配信は続ける", async () => {
      const { store, registry } = await setup();
      // 閉じた接続へ送ると API Gateway は 410 Gone を返す。ws なら送信時に例外が出る
      const send = vi.fn<Send>((connectionId) =>
        connectionId === "c1" ? Promise.reject(new Error("410 Gone")) : Promise.resolve()
      );
      const hub = createRealtimeHub({ store, registry, send });
      await registry.add({ connectionId: "c1", code: CODE, playerId: "p1" });
      await registry.add({ connectionId: "c2", code: CODE, playerId: "p2" });

      await expect(hub.publish(lobby())).resolves.toBeUndefined();

      expect(send).toHaveBeenCalledTimes(2);
      await expect(registry.listByRoom(CODE)).resolves.toEqual([
        { connectionId: "c2", code: CODE, playerId: "p2" },
      ]);
    });
  });

  describe("handleDisconnect", () => {
    it("切断した接続は配信先から外れる", async () => {
      const { hub, registry } = await setup();
      await hub.handleMessage("c1", hello("t1"));

      await hub.handleDisconnect("c1");

      await expect(registry.listByRoom(CODE)).resolves.toEqual([]);
    });
  });
});
