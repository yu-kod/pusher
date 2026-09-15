import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // ゲームエンジンは I/O を持たない純粋関数。乱数は引数で注入する（#5）
    files: ["src/game/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message:
            "ゲームエンジンで Math.random() は使わない。Rng を引数で注入すること（docs/spec.md / CLAUDE.md）。",
        },
      ],
    },
  },
  {
    ignores: ["dist/", "coverage/"],
  }
);
