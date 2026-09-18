import { describe, expect, it } from "vitest";
import { createInMemoryConnectionRegistry } from "./registry.js";

describe("createInMemoryConnectionRegistry", () => {
  it("ルームに紐づけた接続を取り出せる", async () => {
    const registry = createInMemoryConnectionRegistry();
    await registry.add({ connectionId: "c1", code: "ABC234", playerId: "p1" });

    expect(await registry.listByRoom("ABC234")).toEqual([
      { connectionId: "c1", code: "ABC234", playerId: "p1" },
    ]);
  });

  it("接続のないルームは空を返す", async () => {
    const registry = createInMemoryConnectionRegistry();

    expect(await registry.listByRoom("ABC234")).toEqual([]);
  });

  it("同じプレイヤーが複数のタブから繋いでも別々の接続として扱う", async () => {
    const registry = createInMemoryConnectionRegistry();
    await registry.add({ connectionId: "c1", code: "ABC234", playerId: "p1" });
    await registry.add({ connectionId: "c2", code: "ABC234", playerId: "p1" });

    expect(await registry.listByRoom("ABC234")).toHaveLength(2);
  });

  it("観戦者は playerId を持たない", async () => {
    const registry = createInMemoryConnectionRegistry();
    await registry.add({ connectionId: "c1", code: "ABC234", playerId: null });

    expect(await registry.listByRoom("ABC234")).toEqual([
      { connectionId: "c1", code: "ABC234", playerId: null },
    ]);
  });

  it("繋ぎ直しで同じ接続 ID が来たら上書きする", async () => {
    const registry = createInMemoryConnectionRegistry();
    await registry.add({ connectionId: "c1", code: "ABC234", playerId: null });
    await registry.add({ connectionId: "c1", code: "ABC234", playerId: "p2" });

    expect(await registry.listByRoom("ABC234")).toEqual([
      { connectionId: "c1", code: "ABC234", playerId: "p2" },
    ]);
  });

  it("別のルームへ繋ぎ直したら元のルームからは消える", async () => {
    const registry = createInMemoryConnectionRegistry();
    await registry.add({ connectionId: "c1", code: "ABC234", playerId: "p1" });
    await registry.add({ connectionId: "c1", code: "XYZ789", playerId: "p1" });

    expect(await registry.listByRoom("ABC234")).toEqual([]);
    expect(await registry.listByRoom("XYZ789")).toHaveLength(1);
  });

  it("切断した接続は配信先から外れる", async () => {
    const registry = createInMemoryConnectionRegistry();
    await registry.add({ connectionId: "c1", code: "ABC234", playerId: "p1" });
    await registry.remove("c1");

    expect(await registry.listByRoom("ABC234")).toEqual([]);
  });

  it("知らない接続 ID を消しても何も起きない", async () => {
    const registry = createInMemoryConnectionRegistry();

    await expect(registry.remove("c1")).resolves.toBeUndefined();
  });
});
