import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, parseClientMessage } from "./protocol.js";

describe("parseClientMessage", () => {
  it("hello をルームコードとトークン付きで受け取る", () => {
    const raw = JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, code: "ABC234", token: "tk" });

    expect(parseClientMessage(raw)).toEqual({
      t: "hello",
      v: PROTOCOL_VERSION,
      code: "ABC234",
      token: "tk",
    });
  });

  it("トークンのない hello は観戦者として受け取る", () => {
    const raw = JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, code: "ABC234" });

    expect(parseClientMessage(raw)).toEqual({ t: "hello", v: PROTOCOL_VERSION, code: "ABC234" });
  });

  it("ping を受け取る", () => {
    expect(parseClientMessage(JSON.stringify({ t: "ping" }))).toEqual({ t: "ping" });
  });

  it("JSON として壊れていれば null を返す", () => {
    expect(parseClientMessage("{")).toBeNull();
  });

  it("オブジェクトでない JSON は null を返す", () => {
    expect(parseClientMessage("123")).toBeNull();
    expect(parseClientMessage("null")).toBeNull();
  });

  it("知らない種類のメッセージは null を返す", () => {
    expect(parseClientMessage(JSON.stringify({ t: "attack" }))).toBeNull();
  });

  it("バージョンのない hello は 0 として扱い、サーバー側で弾けるようにする", () => {
    expect(parseClientMessage(JSON.stringify({ t: "hello", code: "ABC234" }))).toEqual({
      t: "hello",
      v: 0,
      code: "ABC234",
    });
  });

  it("ルームコードのない hello は null を返す", () => {
    expect(parseClientMessage(JSON.stringify({ t: "hello", v: PROTOCOL_VERSION }))).toBeNull();
  });
});
