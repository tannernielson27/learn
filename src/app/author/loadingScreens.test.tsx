import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SessionsLoading from "./sessions/loading";
import WorkspaceLoading from "./workspace/loading";

describe.each([
  ["Live sessions", SessionsLoading, "Loading live sessions"],
  ["Workspace", WorkspaceLoading, "Loading the workspace"],
] as const)("%s loading state", (_name, Loading, label) => {
  it("is one status line and blocks: no heading, link or visible words", () => {
    const { container } = render(<Loading />);
    expect(screen.getByRole("status")).toHaveTextContent(label);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(container.querySelector("[data-skeleton-blocks]")).toHaveTextContent("");
  });
});
