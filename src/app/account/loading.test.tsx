import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AccountLoading from "./loading";

describe("account loading state", () => {
  it("says what is loading in one status line, inside the account form's frame", () => {
    const { container } = render(<AccountLoading />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading your account");
    expect(container.querySelector("main [aria-busy='true']")).not.toBeNull();
  });

  it("keeps the page's one h1, named for the page, outside any aria-hidden block", () => {
    render(<AccountLoading />);

    const h1 = screen.getByRole("heading", { level: 1, name: "Your account" });
    expect(screen.getAllByRole("heading")).toEqual([h1]);
    expect(h1.closest("[aria-hidden]")).toBeNull();
  });

  it("holds still: no block pulses (docs/04 §5)", () => {
    const { container } = render(<AccountLoading />);

    expect(container.querySelector(".animate-pulse")).toBeNull();
  });
});
