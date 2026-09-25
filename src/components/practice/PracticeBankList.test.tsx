import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PracticeBankList } from "./PracticeBankList";

describe("PracticeBankList (#241)", () => {
  it("links each shared bank to its practice, with how far the student has got", () => {
    render(
      <PracticeBankList
        banks={[
          { bankId: "b1", name: "Cardiac week", itemCount: 21, answered: 3 },
          { bankId: "b2", name: "Renal week", itemCount: 1, answered: 0 },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Practice banks" });
    const cardiac = screen.getByRole("link", { name: "Cardiac week" });
    expect(cardiac).toHaveAttribute("href", "/learn/practice/b1");
    expect(list).toHaveTextContent("3 of 21 done");
    expect(list).toHaveTextContent("1 item");
  });

  it("says when nothing is shared", () => {
    render(<PracticeBankList banks={[]} />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Nothing is shared for practice yet" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/instructor shares for practice/)).toBeInTheDocument();
  });
});
