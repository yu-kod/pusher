import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearCredentials, loadCredentials, saveCredentials } from "./session";

beforeEach(() => {
  localStorage.clear();
});

describe("参加情報の保存", () => {
  it("保存して読み出せる", () => {
    saveCredentials("ABCDEF", { playerId: "p1", token: "t1" });

    expect(loadCredentials("ABCDEF")).toEqual({ playerId: "p1", token: "t1" });
  });

  it("保存していないルームなら null", () => {
    expect(loadCredentials("NOPE22")).toBeNull();
  });

  it("ルームごとに独立している", () => {
    saveCredentials("ABCDEF", { playerId: "p1", token: "t1" });
    saveCredentials("GHIJKL", { playerId: "p2", token: "t2" });

    expect(loadCredentials("ABCDEF")).toEqual({ playerId: "p1", token: "t1" });
    expect(loadCredentials("GHIJKL")).toEqual({ playerId: "p2", token: "t2" });
  });

  it("削除できる", () => {
    saveCredentials("ABCDEF", { playerId: "p1", token: "t1" });

    clearCredentials("ABCDEF");

    expect(loadCredentials("ABCDEF")).toBeNull();
  });

  it("壊れた値が入っていても null を返す", () => {
    localStorage.setItem("pusher-table:room:ABCDEF", "{壊れている");

    expect(loadCredentials("ABCDEF")).toBeNull();
  });

  it("形の違う値が入っていても null を返す", () => {
    localStorage.setItem("pusher-table:room:ABCDEF", JSON.stringify({ hello: "world" }));

    expect(loadCredentials("ABCDEF")).toBeNull();
  });

  it("オブジェクトでない値が入っていても null を返す", () => {
    localStorage.setItem("pusher-table:room:ABCDEF", JSON.stringify("文字列"));
    expect(loadCredentials("ABCDEF")).toBeNull();

    localStorage.setItem("pusher-table:room:ABCDEF", JSON.stringify(null));
    expect(loadCredentials("ABCDEF")).toBeNull();
  });

  it("localStorage が使えなくても落ちない", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("アクセスできない");
    });

    expect(loadCredentials("ABCDEF")).toBeNull();
  });

  it("保存に失敗しても落ちない", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("容量オーバー");
    });

    expect(() => saveCredentials("ABCDEF", { playerId: "p1", token: "t1" })).not.toThrow();
  });

  it("削除に失敗しても落ちない", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("アクセスできない");
    });

    expect(() => clearCredentials("ABCDEF")).not.toThrow();
  });
});
