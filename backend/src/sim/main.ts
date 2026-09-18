/**
 * シミュレーションの実行エントリ（#49）。
 *
 *   npm run sim                          既定値で 2000 ゲーム
 *   npm run sim -- --games 5000          回数を変える
 *   npm run sim -- --preset pushFull     プリセットを重ねる（複数可）
 *   npm run sim -- --strategy random     戦略を変える
 *   npm run sim -- --players 3 --seed 7
 *
 * 出力する数値の意味と目標値は docs/spec.md §7 を参照。
 */
import { BALANCE_PRESETS, DEFAULT_BALANCE, withPreset, type PresetName } from "../game/balance.js";
import { createRng } from "../game/rng.js";
import { simulateMany, type Summary } from "./runner.js";
import { expectedValueStrategy, randomStrategy, type Strategy } from "./strategy.js";

type Options = {
  games: number;
  presets: PresetName[];
  strategy: Strategy;
  players: number;
  seed: number;
};

function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    games: 2000,
    presets: [],
    strategy: expectedValueStrategy(),
    players: 4,
    seed: Date.now() % 2 ** 31,
  };

  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined) {
      throw new Error(`値が足りない: ${String(flag)}`);
    }

    switch (flag) {
      case "--games":
        options.games = Number(value);
        break;
      case "--preset":
        // 知らない名前を黙って無視すると、既定値の数値を「プリセットの結果」として
        // 読んでしまう。測り間違いはグラフを見ても気づけないので、ここで止める
        if (!(value in BALANCE_PRESETS)) {
          throw new Error(
            `知らないプリセット: ${value}\n使えるもの: ${Object.keys(BALANCE_PRESETS).join(", ")}`
          );
        }
        options.presets.push(value as PresetName);
        break;
      case "--strategy":
        options.strategy = value === "random" ? randomStrategy() : expectedValueStrategy();
        break;
      case "--players":
        options.players = Number(value);
        break;
      case "--seed":
        options.seed = Number(value);
        break;
      default:
        throw new Error(`知らないオプション: ${String(flag)}`);
    }
  }

  return options;
}

/** 目標値（docs/spec.md §7）と並べて出す */
function format(summary: Summary): string {
  const round = (n: number) => n.toFixed(2);

  return [
    `ゲーム数              ${summary.games}`,
    `平均ラウンド数        ${round(summary.avgRounds)}`,
    "",
    "§7 最優先",
    `  滞留の厚み          ${round(summary.avgPendingThickness)}  (目標 3〜5)`,
    `  手番あたり投入R数   ${round(summary.avgInsertionRoundsPerTurn)}  (目標 2〜4)`,
    `  自分でやめた割合    ${round(summary.voluntaryStopRate)}  (目標 0.3 以上)`,
    `  投入レーン数        ${round(summary.avgLanesPerInsertion)}  (上限に張り付いていないか)`,
    `  やめた時点の得点    ${round(summary.avgStopPoints)}  (1手番の取り分と同程度が目安)`,
    "",
    `バースト率            ${round(summary.bustRate)}`,
    `投入1枚の回収         ${round(summary.pointsPerInsertedCard)}  (絶対値に目標はない)`,
    `1ゲームのイベント数   ${round(summary.avgEventsPerGame)}`,
    `手番順ごとの勝率      ${summary.seatWinRates.map(round).join(" / ")}`,
    "",
    "ティック同時進行（docs/turn-structure.md §4-1・手番制では 0）",
    `  1ゲームのティック数 ${round(summary.avgTicksPerGame)}  (待ち時間の指標)`,
    `  レーンの取り合い率  ${round(summary.sameLaneRate)}  (0 なら並んでソロプレイ)`,
    "",
    "ボール札（docs/turn-structure.md §4-3・使わない設定では 0）",
    `  1ゲームの落下回数   ${round(summary.avgBallDrops)}  (少なすぎると狙う機会が無い)`,
    `  終了時のレーンの厚み ${round(summary.avgFinalLaneStock)}  (落ちるたび1枚増える。膨らみすぎないか)`,
  ].join("\n");
}

const options = parseArgs(process.argv.slice(2));
const config = options.presets.length === 0 ? DEFAULT_BALANCE : withPreset(...options.presets);

const label = options.presets.length === 0 ? "default" : options.presets.join("+");
console.log(`preset=${label} strategy=${options.strategy.name} seed=${options.seed}\n`);
console.log(
  format(
    simulateMany(options.games, config, options.strategy, createRng(options.seed), options.players)
  )
);
