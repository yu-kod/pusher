import { DeleteCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it, vi, type Mock } from "vitest";
import {
  connectionKey,
  CONNECTION_TTL_SECONDS,
  createDynamoConnectionRegistry,
  type DynamoRegistrySend,
} from "./dynamo-registry.js";

const NOW = 1_700_000_000_000;
const TABLE = "pusher-table-app";

// 既定のクライアントを使う経路だけは、ネットワークへ出ないようクライアントを差し替える
const defaultClientSend = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/lib-dynamodb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aws-sdk/lib-dynamodb")>()),
  DynamoDBDocumentClient: { from: () => ({ send: defaultClientSend }) },
}));

function registryWith(send: Mock<DynamoRegistrySend>) {
  return createDynamoConnectionRegistry({ tableName: TABLE, send, now: () => NOW });
}

describe("createDynamoConnectionRegistry", () => {
  describe("add", () => {
    it("接続をルームから逆引きできる形で書く", async () => {
      const send = vi.fn<DynamoRegistrySend>().mockResolvedValue({});

      await registryWith(send).add({ connectionId: "c1", code: "ABC234", playerId: "p1" });

      const command = send.mock.calls[0]?.[0] as PutCommand;
      expect(command).toBeInstanceOf(PutCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE,
        Item: {
          PK: "CONN#c1",
          SK: "CONN",
          GSI1PK: "ROOM#ABC234",
          GSI1SK: "CONN#c1",
          playerId: "p1",
        },
      });
    });

    it("TTL は epoch 秒で入れる", async () => {
      const send = vi.fn<DynamoRegistrySend>().mockResolvedValue({});

      await registryWith(send).add({ connectionId: "c1", code: "ABC234", playerId: null });

      const command = send.mock.calls[0]?.[0] as PutCommand;
      expect(command.input.Item?.expiresAt).toBe(NOW / 1000 + CONNECTION_TTL_SECONDS);
    });

    it("観戦者は playerId を持たない", async () => {
      const send = vi.fn<DynamoRegistrySend>().mockResolvedValue({});

      await registryWith(send).add({ connectionId: "c1", code: "ABC234", playerId: null });

      const command = send.mock.calls[0]?.[0] as PutCommand;
      expect(command.input.Item?.playerId).toBeNull();
    });

    it("トークンは保存しない", async () => {
      const send = vi.fn<DynamoRegistrySend>().mockResolvedValue({});

      await registryWith(send).add({ connectionId: "c1", code: "ABC234", playerId: "p1" });

      const command = send.mock.calls[0]?.[0] as PutCommand;
      expect(JSON.stringify(command.input.Item)).not.toContain("token");
    });
  });

  describe("remove", () => {
    it("接続 ID のキーで消す", async () => {
      const send = vi.fn<DynamoRegistrySend>().mockResolvedValue({});

      await registryWith(send).remove("c1");

      const command = send.mock.calls[0]?.[0] as DeleteCommand;
      expect(command).toBeInstanceOf(DeleteCommand);
      expect(command.input).toMatchObject({ TableName: TABLE, Key: connectionKey("c1") });
    });
  });

  describe("listByRoom", () => {
    it("GSI1 をルームで引く", async () => {
      const send = vi.fn<DynamoRegistrySend>().mockResolvedValue({});

      await registryWith(send).listByRoom("ABC234");

      const command = send.mock.calls[0]?.[0] as QueryCommand;
      expect(command).toBeInstanceOf(QueryCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :room",
        ExpressionAttributeValues: { ":room": "ROOM#ABC234" },
      });
    });

    it("引いた項目を接続に戻す", async () => {
      const send = vi.fn<DynamoRegistrySend>().mockResolvedValue({
        Items: [
          { GSI1PK: "ROOM#ABC234", GSI1SK: "CONN#c1", playerId: "p1" },
          { GSI1PK: "ROOM#ABC234", GSI1SK: "CONN#c2", playerId: null },
        ],
      });

      await expect(registryWith(send).listByRoom("ABC234")).resolves.toEqual([
        { connectionId: "c1", code: "ABC234", playerId: "p1" },
        { connectionId: "c2", code: "ABC234", playerId: null },
      ]);
    });

    it("接続が無ければ空を返す", async () => {
      const send = vi.fn<DynamoRegistrySend>().mockResolvedValue({});

      await expect(registryWith(send).listByRoom("ABC234")).resolves.toEqual([]);
    });

    it("playerId の無い項目は観戦者として扱う", async () => {
      const send = vi
        .fn<DynamoRegistrySend>()
        .mockResolvedValue({ Items: [{ GSI1SK: "CONN#c1" }] });

      await expect(registryWith(send).listByRoom("ABC234")).resolves.toEqual([
        { connectionId: "c1", code: "ABC234", playerId: null },
      ]);
    });
  });

  it("send と now を省くと、既定のクライアントと現在時刻を使う", async () => {
    defaultClientSend.mockResolvedValue({});

    await createDynamoConnectionRegistry({ tableName: TABLE }).add({
      connectionId: "c1",
      code: "ABC234",
      playerId: null,
    });

    const command = defaultClientSend.mock.calls[0]?.[0] as PutCommand;
    expect(command.input.Item?.expiresAt).toBeGreaterThan(Date.now() / 1000);
  });
});
