import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Die } from "./Die";

describe("Die", () => {
  it("出目を読み上げられる", () => {
    render(<Die value={4} />);

    expect(screen.getByRole("img", { name: "出目 4" })).toBeInTheDocument();
  });
});
