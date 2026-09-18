import { useCallback, useEffect, useRef, useState } from "react";
import {
  createTable,
  drawCoinValue,
  dropCoin,
  step,
  type PusherConfig,
  type PusherState,
  type Rng,
} from "./simulation";

/** シミュレーションを進める刻み幅。フレームレートに挙動を左右させないため固定する */
const FIXED_DT = 1 / 60;
/** 一度のフレームで取り戻す上限（秒）。タブを離れていた間をまとめて進めない */
const MAX_CATCHUP = 0.25;
/** 得点の吹き出しが残る秒数 */
const BURST_LIFE = 0.9;

/** 落ちた瞬間に出す吹き出し。見た目だけの存在で、シミュレーションには影響しない */
export type Burst = {
  id: number;
  kind: "scored" | "swallowed";
  value: number;
  x: number;
  life: number;
};

type View = { table: PusherState; bursts: Burst[] };

export type UsePusherTableOptions = {
  rng?: Rng;
  initialCoins?: number;
  config?: PusherConfig;
};

/**
 * プッシャー台を動かし続けるフック。
 *
 * シミュレーション（純粋関数）と画面のあいだにある I/O の層はここだけで、
 * 時刻・乱数・アニメーションフレームを扱うのもここに閉じている。
 */
export function usePusherTable(options: UsePusherTableOptions = {}) {
  const { rng = Math.random, initialCoins, config } = options;

  // 乱数源・初期枚数・設定は立ち上げのときに一度だけ読む。
  // 途中で差し替えると台が組み直しになるので、変えたいときは key を変えて作り直す。
  const rngRef = useRef(rng);

  const [view, setView] = useState<View>(() => ({
    table: createTable({ rng, initialCoins, config }),
    bursts: [],
  }));
  const viewRef = useRef(view);

  const commit = useCallback((next: View) => {
    viewRef.current = next;
    setView(next);
  }, []);

  useEffect(() => {
    let previous: number | null = null;
    let carry = 0;

    function tick(now: number) {
      frame = requestAnimationFrame(tick);

      if (previous === null) {
        previous = now;
        return;
      }

      const elapsed = Math.min((now - previous) / 1000, MAX_CATCHUP);
      previous = now;
      carry += elapsed;

      let table = viewRef.current.table;
      const fresh: Burst[] = [];

      while (carry >= FIXED_DT) {
        const result = step(table, FIXED_DT);
        table = result.state;
        for (const event of result.events) {
          if (event.type === "landed") continue;
          fresh.push({
            id: event.id,
            kind: event.type,
            value: event.value,
            x: event.x,
            life: BURST_LIFE,
          });
        }
        carry -= FIXED_DT;
      }

      const bursts = viewRef.current.bursts
        .map((burst) => ({ ...burst, life: burst.life - elapsed }))
        .filter((burst) => burst.life > 0)
        .concat(fresh);

      commit({ table, bursts });
    }

    let frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [commit]);

  const drop = useCallback(
    (x: number) => {
      // 何が落ちるかを先に決めてから、確定した内容をシミュレーションへ渡す。
      // 本番ではこの1行がサーバーの返り値に置き換わる。
      const rng = rngRef.current;
      const command = { x, value: drawCoinValue(rng), spin: rng() * 360 };
      commit({ ...viewRef.current, table: dropCoin(viewRef.current.table, command) });
    },
    [commit]
  );

  return { table: view.table, bursts: view.bursts, drop };
}
