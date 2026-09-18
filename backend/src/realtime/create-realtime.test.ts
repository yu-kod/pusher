import type { PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import type { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it, vi } from "vitest";
import { createRoom, joinRoom } from "../room/room.js";
import { createInMemoryRoomStore } from "../room/store.js";
import { TABLE_NAME_ENV } from "../room/create-store.js";
import {
  createConnectionRegistry,
  createPublish,
  createStoreAndPublish,
  WS_ENDPOINT_ENV,
} from "./create-realtime.js";

const NOW = 1_700_000_000_000;
const TABLE = "pusher-table-app";
const ENDPOINT = "https://ws.example.com/prod";

const dynamoSend = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/lib-dynamodb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aws-sdk/lib-dynamodb")>()),
  DynamoDBDocumentClient: { from: () => ({ send: dynamoSend }) },
}));

const postSend = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/client-apigatewaymanagementapi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aws-sdk/client-apigatewaymanagementapi")>()),
  ApiGatewayManagementApiClient: class {
    send = postSend;
  },
}));

function room() {
  return joinRoom(createRoom("ABC234", NOW), { name: "Alice", token: "t-a", isCpu: false }, NOW);
}

describe("createConnectionRegistry", () => {
  it("テーブル名が無ければインメモリで動く", async () => {
    const registry = createConnectionRegistry({});

    await registry.add({ connectionId: "c1", code: "ABC234", playerId: null });

    expect(await registry.listByRoom("ABC234")).toHaveLength(1);
    expect(dynamoSend).not.toHaveBeenCalled();
  });

  it("テーブル名があれば DynamoDB を引く", async () => {
    dynamoSend.mockResolvedValue({});

    await createConnectionRegistry({ [TABLE_NAME_ENV]: TABLE }).listByRoom("ABC234");

    const command = dynamoSend.mock.calls[0]?.[0] as QueryCommand;
    expect(command.input.TableName).toBe(TABLE);
  });

  it("既定では process.env を見る", async () => {
    await expect(createConnectionRegistry().listByRoom("ABC234")).resolves.toEqual([]);
  });
});

describe("createPublish", () => {
  it("WebSocket のエンドポイントが無ければ配信しない（ポーリングだけで遊べる）", () => {
    expect(createPublish(createInMemoryRoomStore(), {})).toBeUndefined();
  });

  it("エンドポイントが空文字でも配信しない（未設定と同じ扱い）", () => {
    expect(createPublish(createInMemoryRoomStore(), { [WS_ENDPOINT_ENV]: "" })).toBeUndefined();
  });

  it("繋いでいる接続へマスク済みの状態を送る", async () => {
    dynamoSend.mockResolvedValue({
      Items: [{ GSI1SK: "CONN#c1", playerId: null }],
    });
    postSend.mockResolvedValue({});

    const publish = createPublish(createInMemoryRoomStore(), {
      [TABLE_NAME_ENV]: TABLE,
      [WS_ENDPOINT_ENV]: ENDPOINT,
    });
    await publish?.(room());

    const command = postSend.mock.calls[0]?.[0] as PostToConnectionCommand;
    expect(command.input.ConnectionId).toBe("c1");
    expect(JSON.parse(String(command.input.Data))).toMatchObject({
      t: "room",
      room: { code: "ABC234" },
    });
  });

  it("既定では process.env を見る", () => {
    expect(createPublish(createInMemoryRoomStore())).toBeUndefined();
  });
});

describe("createStoreAndPublish", () => {
  it("ルーム API と配信が同じストアを見る", async () => {
    dynamoSend.mockResolvedValue({ Items: [{ GSI1SK: "CONN#c1", playerId: null }] });
    postSend.mockResolvedValue({});

    const { store, publish } = createStoreAndPublish({
      [TABLE_NAME_ENV]: "",
      [WS_ENDPOINT_ENV]: ENDPOINT,
    });
    await store.create(room());
    await publish?.(room());

    await expect(store.get("ABC234")).resolves.not.toBeNull();
    expect(postSend).toHaveBeenCalled();
  });

  it("環境変数が無ければインメモリで、配信もしない", () => {
    expect(createStoreAndPublish({}).publish).toBeUndefined();
  });
});
