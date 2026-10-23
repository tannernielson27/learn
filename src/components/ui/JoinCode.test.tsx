import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JoinCode, codeGroups } from "./JoinCode";

describe("JoinCode", () => {
  it("splits the code into two groups of three, whatever was typed", () => {
    expect(codeGroups("v96-rn8")).toEqual(["V96", "RN8"]);
  });

  it("shows where to go and the code in mono, read as one code", () => {
    render(<JoinCode code="V96RN8" url="learn-nclex.app/join" />);
    const section = screen.getByRole("region", { name: "Join code" });
    expect(section).toHaveTextContent("Go to learn-nclex.app/join and type");
    const code = screen.getByTestId("join-code");
    expect(code).toHaveTextContent("V96 RN8");
    expect(code).toHaveClass("font-mono", "text-(length:--joincode-size)");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("adds a QR code second, and sizes for the stage", () => {
    render(
      <JoinCode
        code="V96RN8"
        url="learn-nclex.app/join"
        qrUrl="https://learn-nclex.app/join/V96RN8"
        size="stage"
      />,
    );
    expect(
      screen.getByRole("img", { name: "QR code for joining this live session" }),
    ).toBeVisible();
    expect(screen.getByText("Or scan from the front rows")).toBeInTheDocument();
    expect(screen.getByTestId("join-code")).toHaveClass("text-(length:--joincode-size-stage)");
  });

  it("leaves the QR code out when the address cannot be encoded", () => {
    render(<JoinCode code="V96RN8" url="x" qrUrl={"x".repeat(5_000)} />);
    expect(screen.queryByRole("img")).toBeNull();
  });
});
