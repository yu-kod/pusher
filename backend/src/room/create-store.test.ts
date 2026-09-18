import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it, vi } from "vitest";
import { createRoomStore, TABLE_NAME_ENV } from "./create-store.js";
import { createRoom } from "./room.js";

const send = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/lib-dynamodb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aws-sdk/lib-dynamodb")>()),
  DynamoDBDocumentClient: { from: () => ({ send }) },
}));

describe("createRoomStore", () => {
  it("テーブル名が無ければインメモリで動く", async () => {
    const store = createRoomStore({});

    await store.create(createRoom("ABCDEF", 0));

    await expect(store.get("ABCDEF")).resolves.toMatchObject({ rev: 1 });
    expect(send).not.toHaveBeenCalled();
  });

  it("テーブル名が空文字でもインメモリで動く（未設定と同じ扱い）", async () => {
    await expect(createRoomStore({ [TABLE_NAME_ENV]: "" }).get("ABCDEF")).resolves.toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("テーブル名があれば DynamoDB を読みに行く", async () => {
    send.mockResolvedValue({});

    await createRoomStore({ [TABLE_NAME_ENV]: "pusher-table-app" }).get("ABCDEF");

    const command = send.mock.calls[0]?.[0] as GetCommand;
    expect(command.input.TableName).toBe("pusher-table-app");
  });

  it("既定では process.env を見る", async () => {
    await expect(createRoomStore().get("ABCDEF")).resolves.toBeNull();
  });
});
