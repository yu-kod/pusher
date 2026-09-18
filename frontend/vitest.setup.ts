import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom に ResizeObserver は無い。寸法を測る側のテストは各自で差し替える
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// globals: false なので自動クリーンアップが登録されない。明示的に片付ける
afterEach(() => {
  cleanup();
});
