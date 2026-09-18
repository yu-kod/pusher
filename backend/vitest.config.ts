import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // index.ts / lambda.ts / ws.ts はエントリポイント、sim/main.ts は CLI の
      // 引数処理と標準出力なので対象外。シミュレーションの中身（strategy / runner）は対象。
      //
      // realtime/node-server.ts はソケットと hub を繋ぐだけのアダプタで、
      // 残るのは「すでに閉じた接続へ送ろうとした」の防御だけ。実際に WebSocket を
      // 張る結合テスト（node-server.test.ts）で振る舞いは押さえてある
      exclude: [
        "src/index.ts",
        "src/lambda.ts",
        "src/ws.ts",
        "src/sim/main.ts",
        "src/realtime/node-server.ts",
        "src/test-utils/**",
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
