import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pager } from "./Pager";

const hrefFor = (page: number) => `/list?page=${page}`;

describe("Pager", () => {
  it("links to the page before and after, and says where the list is", () => {
    render(<Pager page={2} pageCount={3} hrefFor={hrefFor} />);
    const nav = screen.getByRole("navigation", { name: "Pages" });
    expect(nav).toHaveTextContent("Page 2 of 3");
    expect(within(nav).getByRole("link", { name: "Previous page" })).toHaveAttribute(
      "href",
      "/list?page=1",
    );
    expect(within(nav).getByRole("link", { name: "Next page" })).toHaveAttribute(
      "href",
      "/list?page=3",
    );
  });

  it("offers no link past either end", () => {
    const { unmount } = render(<Pager page={1} pageCount={2} hrefFor={hrefFor} />);
    expect(screen.queryByRole("link", { name: "Previous page" })).not.toBeInTheDocument();
    unmount();
    render(<Pager page={2} pageCount={2} hrefFor={hrefFor} />);
    expect(screen.queryByRole("link", { name: "Next page" })).not.toBeInTheDocument();
  });

  it("offers the first page from a page past the end", () => {
    render(<Pager page={5} pageCount={2} hrefFor={hrefFor} />);
    const nav = screen.getByRole("navigation", { name: "Pages" });
    expect(nav).toHaveTextContent("Page 5 is past the end.");
    expect(within(nav).getByRole("link", { name: "First page" })).toHaveAttribute(
      "href",
      "/list?page=1",
    );
  });

  it("shows nothing for a list that fits on one page", () => {
    const { container } = render(<Pager page={1} pageCount={1} hrefFor={hrefFor} />);
    expect(container).toBeEmptyDOMElement();
  });
});
