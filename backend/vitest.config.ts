import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // index.ts はローカル起動のエントリポイント（listen するだけ）なので対象外
      exclude: ["src/index.ts", "src/lambda.ts", "src/test-utils/**"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
