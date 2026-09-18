/**
 * ローカル開発用の WebSocket サーバー（docs/realtime.md §6）。
 *
 * `hub.ts` はソケットを知らない。ここがその唯一の接点で、
 * 「1つの接続へ送る」を Node の `ws` で埋める。
 *
 * 本番（API Gateway WebSocket API）では同じ hub に別の `send` を渡す。
 * hub とレジストリを共有しているので、差し替えてもルールは変わらない。
 */
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { ServerType } from "@hono/node-server";
import { WebSocketServer, type WebSocket } from "ws";
import type { Room } from "../room/room.js";
import type { RoomStore } from "../room/store.js";
import { createRealtimeHub } from "./hub.js";
import type { ServerMessage } from "./protocol.js";
import { createInMemoryConnectionRegistry } from "./registry.js";

/** フロントの dev サーバー（vite.config.ts）がここへプロキシする */
const PATH = "/ws";

export type NodeRealtime = {
  /** ルーム API の `publish` に渡す */
  publish: (room: Room) => Promise<void>;
  /** すでに listen している HTTP サーバーへ WebSocket の受け口を足す */
  attach: (server: ServerType) => WebSocketServer;
};

export function createNodeRealtime(store: RoomStore): NodeRealtime {
  const sockets = new Map<string, WebSocket>();
  const registry = createInMemoryConnectionRegistry();

  const send = (connectionId: string, message: ServerMessage): Promise<void> => {
    const socket = sockets.get(connectionId);
    if (socket === undefined) {
      // すでに閉じた接続。hub がレジストリから外す
      return Promise.reject(new Error(`接続がない: ${connectionId}`));
    }
    socket.send(JSON.stringify(message));
    return Promise.resolve();
  };

  const hub = createRealtimeHub({ store, registry, send });

  return {
    publish: hub.publish,

    attach(server) {
      // serve() の戻りは HTTP/2 も含む型だが、ローカル開発で使うのは HTTP/1 のみ
      const wss = new WebSocketServer({ server: server as Server, path: PATH });

      wss.on("connection", (socket) => {
        // 接続 ID はサーバーが振る。本番では API Gateway の connectionId がこれに当たる
        const connectionId = randomUUID();
        sockets.set(connectionId, socket);

        socket.on("message", (data) => {
          void hub.handleMessage(connectionId, String(data));
        });

        socket.on("close", () => {
          sockets.delete(connectionId);
          void hub.handleDisconnect(connectionId);
        });
      });

      return wss;
    },
  };
}
