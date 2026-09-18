import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeclarationActions } from "./DeclarationActions";

function setup(props: Partial<React.ComponentProps<typeof DeclarationActions>> = {}) {
  const onDeclare = vi.fn();
  const onWithdraw = vi.fn();
  const onCancel = vi.fn();
  render(
    <DeclarationActions
      declared={null}
      canDeclare
      busy={false}
      onDeclare={onDeclare}
      onWithdraw={onWithdraw}
      onCancel={onCancel}
      {...props}
    />
  );
  return { onDeclare, onWithdraw, onCancel, user: userEvent.setup() };
}

describe("DeclarationActions", () => {
  it("レーンと手札が揃っていれば宣言できる", async () => {
    const { onDeclare, user } = setup();

    await user.click(screen.getByRole("button", { name: "宣言する" }));

    expect(onDeclare).toHaveBeenCalledOnce();
  });

  it("選びきっていなければ宣言できない", () => {
    setup({ canDeclare: false });

    expect(screen.getByRole("button", { name: "宣言する" })).toBeDisabled();
  });

  it("降りることも宣言できる", async () => {
    const { onWithdraw, user } = setup();

    await user.click(screen.getByRole("button", { name: "降りる" }));

    expect(onWithdraw).toHaveBeenCalledOnce();
  });

  it("選びきっていなくても降りられる", () => {
    setup({ canDeclare: false });

    expect(screen.getByRole("button", { name: "降りる" })).toBeEnabled();
  });

  it("宣言したあとは、自分がどのレーンを狙ったかが見える", () => {
    setup({ declared: { kind: "insert", laneIndex: 0, handIndexes: [1] } });

    expect(screen.getByText(/左レーンへ投入/)).toBeInTheDocument();
  });

  it("降りると宣言したあとも、それが見える", () => {
    setup({ declared: { kind: "withdraw" } });

    expect(screen.getByText(/降りる/)).toBeInTheDocument();
  });

  it("締め切りまでは宣言を取り消せる", async () => {
    const { onCancel, user } = setup({ declared: { kind: "withdraw" } });

    await user.click(screen.getByRole("button", { name: "取り消す" }));

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("宣言したあとは、もう一度宣言する口を出さない", () => {
    setup({ declared: { kind: "withdraw" } });

    expect(screen.queryByRole("button", { name: "宣言する" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "降りる" })).not.toBeInTheDocument();
  });

  it("送信中はどのボタンも押せない", () => {
    setup({ busy: true });

    expect(screen.getByRole("button", { name: "宣言する" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "降りる" })).toBeDisabled();
  });

  it("送信中は取り消しも押せない", () => {
    setup({ busy: true, declared: { kind: "withdraw" } });

    expect(screen.getByRole("button", { name: "取り消す" })).toBeDisabled();
  });
});
