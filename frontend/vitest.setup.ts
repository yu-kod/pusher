import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// globals: false なので自動クリーンアップが登録されない。明示的に片付ける
afterEach(() => {
  cleanup();
});
