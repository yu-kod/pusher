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
import { DEFAULT_BALANCE, withPreset, type PresetName } from "../game/balance.js";
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
    `  やめた時点の得点    ${round(summary.avgStopPoints)}  (机上計算では 15〜20)`,
    "",
    `バースト率            ${round(summary.bustRate)}`,
    `投入1枚の回収         ${round(summary.pointsPerInsertedCard)}  (絶対値に目標はない)`,
    `1ゲームのイベント数   ${round(summary.avgEventsPerGame)}`,
    `手番順ごとの勝率      ${summary.seatWinRates.map(round).join(" / ")}`,
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
