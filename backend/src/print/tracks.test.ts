import { describe, expect, it } from "vitest";
import { DEFAULT_BALANCE } from "../game/balance.js";
import { SEATS } from "./cards.js";
import { PENDING_TRACK_MAX, SCORE_TRACK_MAX, renderPlayerMats, renderTracks } from "./tracks.js";

describe("renderTracks", () => {
  const html = renderTracks(DEFAULT_BALANCE);

  it("A4 の印刷指定を持つ1つの HTML を返す", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("size: A4");
  });

  it("得点トラックは 0 から SCORE_TRACK_MAX まで並ぶ", () => {
    const cells = html.match(/class="cell score"/g);

    expect(cells).toHaveLength(SCORE_TRACK_MAX + 1);
    expect(html).toContain(`>${SCORE_TRACK_MAX}<`);
  });

  it("ラウンドトラックは balance の maxRounds ぶん並ぶ", () => {
    expect(html.match(/class="cell round"/g)).toHaveLength(DEFAULT_BALANCE.maxRounds);
  });

  it("JPカウンターは 0 から閾値まで並ぶ", () => {
    expect(html.match(/class="cell jp"/g)).toHaveLength(DEFAULT_BALANCE.jackpotThreshold + 1);
  });

  it("先行権の列は席の数ぶんの枠を持つ", () => {
    expect(html.match(/class="priority-slot"/g)).toHaveLength(SEATS.length);
  });

  it("マーカーは席の色ぶんと、ジャックポット・ラウンド用がある", () => {
    for (const seat of SEATS) {
      expect(html).toContain(seat.color);
    }
    expect(html).toContain("ジャックポット");
  });
});

describe("renderPlayerMats", () => {
  const html = renderPlayerMats();

  it("席の数ぶんのマットを作る", () => {
    expect(html.match(/class="mat"/g)).toHaveLength(SEATS.length);
  });

  it("未確定得点トラックは 0 から PENDING_TRACK_MAX まで並ぶ", () => {
    const perMat = PENDING_TRACK_MAX + 1;

    expect(html.match(/class="cell pending"/g)).toHaveLength(perMat * SEATS.length);
  });

  it("宣言を伏せて置く枠がある", () => {
    expect(html).toContain("宣言");
    expect(html.match(/class="declare-slot"/g)).toHaveLength(SEATS.length * 2);
  });
});
