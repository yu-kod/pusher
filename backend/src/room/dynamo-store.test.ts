import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it, vi, type Mock } from "vitest";
import { DEFAULT_BALANCE } from "../game/balance.js";
import {
  createDynamoRoomStore,
  ROOM_TTL_SECONDS,
  roomKey,
  type DynamoSend,
} from "./dynamo-store.js";
import { createRoom, joinRoom, startGame, type Room } from "./room.js";
import { createRng } from "../game/rng.js";
import { serializeRoom } from "./serialize.js";
import { RoomConflictError } from "./store.js";

const NOW = 1_700_000_000_000;
const TABLE = "pusher-table-app";

// 既定のクライアントを使う経路だけは、ネットワークへ出ないようクライアントを差し替える
const defaultClientSend = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/lib-dynamodb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aws-sdk/lib-dynamodb")>()),
  DynamoDBDocumentClient: { from: () => ({ send: defaultClientSend }) },
}));

function storeWith(send: Mock<DynamoSend>) {
  return createDynamoRoomStore({ tableName: TABLE, send, now: () => NOW });
}

function conditionalCheckFailed() {
  return new ConditionalCheckFailedException({ $metadata: {}, message: "条件を満たさない" });
}

describe("createDynamoRoomStore", () => {
  describe("get", () => {
    it("保存済みの項目をルームと版に戻す", async () => {
      const room = createRoom("ABCDEF", NOW);
      const send = vi.fn<DynamoSend>().mockResolvedValue({
        Item: { ...roomKey("ABCDEF"), body: serializeRoom(room), rev: 3 },
      });

      await expect(storeWith(send).get("ABCDEF")).resolves.toEqual({ room, rev: 3 });
    });

    it("整合性のある読み取りでテーブルとキーを指定する", async () => {
      const send = vi.fn<DynamoSend>().mockResolvedValue({});

      await storeWith(send).get("ABCDEF");

      const command = send.mock.calls[0]?.[0] as GetCommand;
      expect(command).toBeInstanceOf(GetCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE,
        Key: { PK: "ROOM#ABCDEF", SK: "ROOM" },
        // 作った直後の参加で「ルームが無い」にならないよう、結果整合の読み取りにしない
        ConsistentRead: true,
      });
    });

    it("項目が無ければ null を返す", async () => {
      const send = vi.fn<DynamoSend>().mockResolvedValue({});

      await expect(storeWith(send).get("NOPE12")).resolves.toBeNull();
    });

    it("調整値を復元するので、戻した状態で押し出しを解決できる", async () => {
      const lobby = ["A", "B", "C"].reduce<Room>(
        (room, name) => joinRoom(room, { name, token: `t-${name}`, isCpu: false }, NOW),
        createRoom("ABCDEF", NOW)
      );
      const playing = startGame(lobby, createRng(1), DEFAULT_BALANCE, NOW);
      const send = vi.fn<DynamoSend>().mockResolvedValue({
        Item: { ...roomKey("ABCDEF"), body: serializeRoom(playing), rev: 1 },
      });

      const stored = await storeWith(send).get("ABCDEF");

      expect(stored?.room.game?.config.pushCount).toBeTypeOf("function");
    });
  });

  describe("create", () => {
    it("同じコードが無いときだけ書く（版は 1 から）", async () => {
      const send = vi.fn<DynamoSend>().mockResolvedValue({});
      const room = createRoom("ABCDEF", NOW);

      await storeWith(send).create(room);

      const command = send.mock.calls[0]?.[0] as PutCommand;
      expect(command).toBeInstanceOf(PutCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE,
        ConditionExpression: "attribute_not_exists(PK)",
        Item: { PK: "ROOM#ABCDEF", SK: "ROOM", body: serializeRoom(room), rev: 1 },
      });
    });

    it("放置されたルームが消えるよう TTL を epoch 秒で入れる", async () => {
      const send = vi.fn<DynamoSend>().mockResolvedValue({});
      const store = createDynamoRoomStore({ tableName: TABLE, send, now: () => NOW + 1_500 });

      await store.create(createRoom("ABCDEF", NOW));

      const command = send.mock.calls[0]?.[0] as PutCommand;
      expect(command.input.Item?.["expiresAt"]).toBe(NOW / 1000 + 1 + ROOM_TTL_SECONDS);
    });

    it("now を渡さなければ現在時刻から TTL を決める", async () => {
      const send = vi.fn<DynamoSend>().mockResolvedValue({});
      const store = createDynamoRoomStore({ tableName: TABLE, send });

      await store.create(createRoom("ABCDEF", NOW));

      const command = send.mock.calls[0]?.[0] as PutCommand;
      const expected = Math.floor(Date.now() / 1000) + ROOM_TTL_SECONDS;
      expect(command.input.Item?.["expiresAt"]).toBeGreaterThanOrEqual(expected - 1);
      expect(command.input.Item?.["expiresAt"]).toBeLessThanOrEqual(expected + 1);
    });

    it("コードが衝突したら RoomConflictError", async () => {
      const send = vi.fn<DynamoSend>().mockRejectedValue(conditionalCheckFailed());

      await expect(storeWith(send).create(createRoom("ABCDEF", NOW))).rejects.toBeInstanceOf(
        RoomConflictError
      );
    });

    it("それ以外の失敗はそのまま投げる", async () => {
      const send = vi.fn<DynamoSend>().mockRejectedValue(new Error("テーブルが無い"));

      await expect(storeWith(send).create(createRoom("ABCDEF", NOW))).rejects.toThrow(
        "テーブルが無い"
      );
    });
  });

  describe("update", () => {
    it("読んだ版のままのときだけ書き、版を1つ進める", async () => {
      const send = vi.fn<DynamoSend>().mockResolvedValue({});
      const room = createRoom("ABCDEF", NOW);

      await storeWith(send).update(room, 4);

      const command = send.mock.calls[0]?.[0] as PutCommand;
      expect(command.input).toMatchObject({
        TableName: TABLE,
        ConditionExpression: "rev = :expectedRev",
        ExpressionAttributeValues: { ":expectedRev": 4 },
        Item: { PK: "ROOM#ABCDEF", body: serializeRoom(room), rev: 5 },
      });
    });

    it("先に別の更新が入っていたら RoomConflictError", async () => {
      const send = vi.fn<DynamoSend>().mockRejectedValue(conditionalCheckFailed());

      await expect(storeWith(send).update(createRoom("ABCDEF", NOW), 1)).rejects.toBeInstanceOf(
        RoomConflictError
      );
    });

    it("それ以外の失敗はそのまま投げる", async () => {
      const send = vi.fn<DynamoSend>().mockRejectedValue(new Error("落ちた"));

      await expect(storeWith(send).update(createRoom("ABCDEF", NOW), 1)).rejects.toThrow("落ちた");
    });
  });

  it("send を渡さなければ既定の DynamoDB クライアントを使う", async () => {
    defaultClientSend.mockResolvedValue({});

    await expect(createDynamoRoomStore({ tableName: TABLE }).get("ABCDEF")).resolves.toBeNull();

    expect(defaultClientSend).toHaveBeenCalledWith(expect.any(GetCommand));
  });

  it("delete はキーを指定して消す", async () => {
    const send = vi.fn<DynamoSend>().mockResolvedValue({});

    await storeWith(send).delete("ABCDEF");

    const command = send.mock.calls[0]?.[0] as DeleteCommand;
    expect(command).toBeInstanceOf(DeleteCommand);
    expect(command.input).toMatchObject({ TableName: TABLE, Key: roomKey("ABCDEF") });
  });
});
