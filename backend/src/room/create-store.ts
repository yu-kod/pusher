/**
 * 環境に応じた保存先を選ぶ。
 *
 * テーブル名の環境変数があれば DynamoDB、無ければインメモリ。
 * ローカル開発と結合テストは環境変数を置かないのでインメモリのまま動く。
 */
import { createDynamoRoomStore } from "./dynamo-store.js";
import { createInMemoryRoomStore, type RoomStore } from "./store.js";

/** Terraform が Lambda へ渡す（infra/dynamodb.tf） */
export const TABLE_NAME_ENV = "APP_TABLE_NAME";

export function createRoomStore(env: Record<string, string | undefined> = process.env): RoomStore {
  const tableName = env[TABLE_NAME_ENV];
  if (tableName === undefined || tableName === "") {
    return createInMemoryRoomStore();
  }
  return createDynamoRoomStore({ tableName });
}
