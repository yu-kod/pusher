/**
 * ゲームエンジンが使う乱数。
 *
 * エンジンは I/O を持たない純粋関数なので、乱数は必ずこのインターフェース経由で
 * 引数として注入する（`Math.random()` は ESLint で禁止している）。
 *
 * シードを与えれば同じ乱数列が再現できるため、
 * - テストでは決定的な出目を並べられる
 * - 異常なゲームをログのシードから再現できる（#21）
 */
export type Rng = {
  /** 0 以上 maxExclusive 未満の整数を返す */
  nextInt(maxExclusive: number): number;
  /** 新しい配列を返す。引数は変更しない */
  shuffle<T>(items: readonly T[]): T[];
  /** 1〜6 を返す */
  rollD6(): number;
};

/** xorshift32 の状態が 0 だと以後ずっと 0 になるため、その場合に使う代替シード */
const FALLBACK_SEED = 0x9e3779b9;

const D6_FACES = 6;

/**
 * シードから決定的な乱数生成器を作る（xorshift32）。
 *
 * 暗号用途には使えない。ゲームの再現性のためだけに使う。
 */
export function createRng(seed: number): Rng {
  // 32bit 符号なしに畳み込む。0 は縮退するので避ける
  let state = seed >>> 0 || FALLBACK_SEED;

  function next(): number {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  }

  const rng: Rng = {
    nextInt(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        throw new RangeError(`maxExclusive は 1 以上の整数である必要がある: ${maxExclusive}`);
      }
      return next() % maxExclusive;
    },

    shuffle<T>(items: readonly T[]): T[] {
      const result = [...items];
      // Fisher-Yates
      for (let i = result.length - 1; i > 0; i--) {
        const j = rng.nextInt(i + 1);
        [result[i], result[j]] = [result[j] as T, result[i] as T];
      }
      return result;
    },

    rollD6(): number {
      return rng.nextInt(D6_FACES) + 1;
    },
  };

  return rng;
}
