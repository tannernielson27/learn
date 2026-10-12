import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PracticeBankList } from "./PracticeBankList";

describe("PracticeBankList (#241)", () => {
  it("links each shared bank to its practice, with how far the student has got", () => {
    render(
      <PracticeBankList
        banks={[
          { bankId: "b1", name: "Cardiac week", itemCount: 21, answered: 3, workspaceName: null },
          { bankId: "b2", name: "Renal week", itemCount: 1, answered: 0, workspaceName: null },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Practice banks" });
    const cardiac = screen.getByRole("link", { name: "Cardiac week" });
    expect(cardiac).toHaveAttribute("href", "/learn/practice/b1");
    expect(list).toHaveTextContent("3 of 21 done");
    expect(list).toHaveTextContent("1 item");
  });

  const twoWorkspaces = [
    { bankId: "b1", name: "Cardiac week", itemCount: 21, answered: 3, workspaceName: "Ada's" },
    { bankId: "b2", name: "Cardiac week", itemCount: 4, answered: 0, workspaceName: "Grace's" },
    { bankId: "b3", name: "Renal week", itemCount: 2, answered: 0, workspaceName: null },
  ];

  it("names each bank's workspace for a student whose classes span more than one", () => {
    render(<PracticeBankList banks={twoWorkspaces} showWorkspace />);
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]!).getByText("Ada's", { exact: true })).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Grace's", { exact: true })).toBeInTheDocument();
    // The database sent no name for this one (or has not got the column yet): nothing is shown.
    expect(rows[2]).toHaveTextContent(/^Renal week2 items$/);
  });

  it("leaves the workspace off for everybody else", () => {
    render(<PracticeBankList banks={twoWorkspaces} />);
    const list = screen.getByRole("list", { name: "Practice banks" });
    expect(list).not.toHaveTextContent("Ada's");
    expect(list).not.toHaveTextContent("Grace's");
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
