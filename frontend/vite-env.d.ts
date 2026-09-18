/// <reference types="vite/client" />

/**
 * ビルド時に渡す設定。
 *
 * `VITE_WS_URL` は本番の WebSocket エンドポイント（Terraform の `websocket_url`）。
 * 渡さなければ同じホストの `/ws` へ繋ぐ（`src/lib/roomSocket.ts`）。
 */
interface ImportMetaEnv {
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
