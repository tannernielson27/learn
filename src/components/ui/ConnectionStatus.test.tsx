import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConnectionStatus } from "./ConnectionStatus";

describe("ConnectionStatus", () => {
  it.each([
    ["connected", "Connected", "bg-correct"],
    ["reconnecting", "Reconnecting", "bg-flag"],
    ["offline", "Offline", "bg-flag"],
  ] as const)("says %s in words beside a dot", (status, word, dot) => {
    render(<ConnectionStatus status={status} />);
    const line = screen.getByRole("status");
    expect(line).toHaveTextContent(word);
    expect(line.querySelector("[aria-hidden]")).toHaveClass(dot);
  });
});
