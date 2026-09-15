import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // index.ts / lambda.ts はエントリポイント、sim/main.ts は CLI の引数処理と
      // 標準出力なので対象外。シミュレーションの中身（strategy / runner）は対象
      exclude: ["src/index.ts", "src/lambda.ts", "src/sim/main.ts", "src/test-utils/**"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
