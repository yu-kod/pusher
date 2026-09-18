import { describe, expect, it, vi } from "vitest";
import { createRoom, joinRoom, type Room } from "../room/room.js";
import { createInMemoryRoomStore, type RoomStore } from "../room/store.js";
import type { ServerMessage } from "./protocol.js";
import { createInMemoryConnectionRegistry } from "./registry.js";
import { createWsHandler, type WebSocketEvent } from "./ws-handler.js";

const NOW = 1_700_000_000_000;

function roomWithAlice(): Room {
  return joinRoom(
    createRoom("ABC234", NOW),
    { name: "Alice", token: "t-alice", isCpu: false },
    NOW
  );
}

async function storeWith(room: Room): Promise<RoomStore> {
  const store = createInMemoryRoomStore();
  await store.create(room);
  return store;
}

function event(
  routeKey: string,
  overrides: Partial<WebSocketEvent["requestContext"]> & { body?: string } = {}
): WebSocketEvent {
  const { body, ...context } = overrides;
  return {
    requestContext: {
      routeKey,
      connectionId: "c1",
      domainName: "ws.example.com",
      stage: "prod",
      ...context,
    },
    body,
  };
}

/** 送った先と中身を覚えるだけの `sendFor` */
function recorder() {
  const sent: { endpoint: string; connectionId: string; message: ServerMessage }[] = [];
  return {
    sent,
    sendFor: (endpoint: string) => (connectionId: string, message: ServerMessage) => {
      sent.push({ endpoint, connectionId, message });
      return Promise.resolve();
    },
  };
}

describe("createWsHandler", () => {
  it("$connect は何も書かずに受け入れる", async () => {
    const registry = createInMemoryConnectionRegistry();
    const handler = createWsHandler({
      store: await storeWith(roomWithAlice()),
      registry,
      sendFor: recorder().sendFor,
    });

    await expect(handler(event("$connect"))).resolves.toEqual({ statusCode: 200 });
    expect(await registry.listByRoom("ABC234")).toEqual([]);
  });

  it("$default の hello でルームに紐づけ、welcome と状態を返す", async () => {
    const registry = createInMemoryConnectionRegistry();
    const sink = recorder();
    const handler = createWsHandler({
      store: await storeWith(roomWithAlice()),
      registry,
      sendFor: sink.sendFor,
    });

    await handler(
      event("$default", { body: JSON.stringify({ t: "hello", v: 1, code: "ABC234" }) })
    );

    expect(sink.sent.map((s) => s.message.t)).toEqual(["welcome", "room"]);
    expect(await registry.listByRoom("ABC234")).toHaveLength(1);
  });

  it("接続を受けたドメインとステージから管理 API のエンドポイントを組み立てる", async () => {
    const sink = recorder();
    const handler = createWsHandler({
      store: await storeWith(roomWithAlice()),
      registry: createInMemoryConnectionRegistry(),
      sendFor: sink.sendFor,
    });

    await handler(event("$default", { body: JSON.stringify({ t: "ping" }) }));

    expect(sink.sent[0]?.endpoint).toBe("https://ws.example.com/prod");
  });

  it("本文が無くても落ちず、読めないメッセージとして返す", async () => {
    const sink = recorder();
    const handler = createWsHandler({
      store: await storeWith(roomWithAlice()),
      registry: createInMemoryConnectionRegistry(),
      sendFor: sink.sendFor,
    });

    await expect(handler(event("$default"))).resolves.toEqual({ statusCode: 200 });
    expect(sink.sent[0]?.message).toMatchObject({ t: "error", code: "BAD_MESSAGE" });
  });

  it("$disconnect でレジストリから消す", async () => {
    const registry = createInMemoryConnectionRegistry();
    await registry.add({ connectionId: "c1", code: "ABC234", playerId: null });
    const handler = createWsHandler({
      store: await storeWith(roomWithAlice()),
      registry,
      sendFor: recorder().sendFor,
    });

    await expect(handler(event("$disconnect"))).resolves.toEqual({ statusCode: 200 });
    expect(await registry.listByRoom("ABC234")).toEqual([]);
  });

  it("送信に失敗しても 200 を返す（接続を切らせない）", async () => {
    const handler = createWsHandler({
      store: await storeWith(roomWithAlice()),
      registry: createInMemoryConnectionRegistry(),
      sendFor: () => vi.fn().mockRejectedValue(new Error("410 Gone")),
    });

    await expect(handler(event("$default", { body: "{}" }))).resolves.toEqual({ statusCode: 200 });
  });
});
