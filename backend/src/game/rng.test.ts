import { describe, expect, it } from "vitest";
import { createRng } from "./rng.js";

describe("createRng", () => {
  describe("再現性", () => {
    it("同じシードなら同じ乱数列を返す", () => {
      const a = createRng(12345);
      const b = createRng(12345);

      const seqA = Array.from({ length: 20 }, () => a.rollD6());
      const seqB = Array.from({ length: 20 }, () => b.rollD6());

      expect(seqA).toEqual(seqB);
    });

    it("シードが違えば異なる乱数列になる", () => {
      const a = createRng(1);
      const b = createRng(2);

      const seqA = Array.from({ length: 20 }, () => a.rollD6());
      const seqB = Array.from({ length: 20 }, () => b.rollD6());

      expect(seqA).not.toEqual(seqB);
    });

    it("シード 0 でも縮退せず乱数列を返す", () => {
      const rng = createRng(0);

      const seq = Array.from({ length: 20 }, () => rng.rollD6());

      expect(new Set(seq).size).toBeGreaterThan(1);
    });
  });

  describe("rollD6", () => {
    it("1〜6 の範囲を返す", () => {
      const rng = createRng(42);

      for (let i = 0; i < 1000; i++) {
        const roll = rng.rollD6();
        expect(roll).toBeGreaterThanOrEqual(1);
        expect(roll).toBeLessThanOrEqual(6);
      }
    });

    it("出目の分布が概ね一様になる", () => {
      const rng = createRng(2026);
      const trials = 60000;
      const counts = new Map<number, number>();

      for (let i = 0; i < trials; i++) {
        const roll = rng.rollD6();
        counts.set(roll, (counts.get(roll) ?? 0) + 1);
      }

      // 6種類すべてが出ること
      expect(counts.size).toBe(6);
      // 各目が期待値 10000 の ±5% に収まること
      for (const [, count] of counts) {
        expect(count).toBeGreaterThan(trials / 6 - trials / 6 / 20);
        expect(count).toBeLessThan(trials / 6 + trials / 6 / 20);
      }
    });
  });

  describe("nextInt", () => {
    it("0 以上 maxExclusive 未満を返す", () => {
      const rng = createRng(7);

      for (let i = 0; i < 1000; i++) {
        const value = rng.nextInt(10);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(10);
      }
    });

    it("maxExclusive が 1 なら常に 0 を返す", () => {
      const rng = createRng(7);

      expect(Array.from({ length: 10 }, () => rng.nextInt(1))).toEqual(new Array(10).fill(0));
    });

    it("maxExclusive が 0 以下なら例外を投げる", () => {
      const rng = createRng(7);

      expect(() => rng.nextInt(0)).toThrow(RangeError);
      expect(() => rng.nextInt(-1)).toThrow(RangeError);
    });

    it("maxExclusive が整数でなければ例外を投げる", () => {
      const rng = createRng(7);

      expect(() => rng.nextInt(2.5)).toThrow(RangeError);
    });
  });

  describe("shuffle", () => {
    it("元の配列を変更しない", () => {
      const rng = createRng(99);
      const original = [1, 2, 3, 4, 5];

      rng.shuffle(original);

      expect(original).toEqual([1, 2, 3, 4, 5]);
    });

    it("要素をすべて保持する", () => {
      const rng = createRng(99);
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      const shuffled = rng.shuffle(items);

      expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
    });

    it("同じシードなら同じ順序になる", () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      expect(createRng(5).shuffle(items)).toEqual(createRng(5).shuffle(items));
    });

    it("並び順が変わる", () => {
      const rng = createRng(5);
      const items = Array.from({ length: 50 }, (_, i) => i);

      expect(rng.shuffle(items)).not.toEqual(items);
    });

    it("空配列を渡しても空配列を返す", () => {
      const rng = createRng(5);

      expect(rng.shuffle([])).toEqual([]);
    });
  });
});
