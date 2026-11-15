import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WayBack, type WayBackTo } from "./WayBack";

describe("WayBack", () => {
  it.each<[WayBackTo, string, string]>([
    ["library", "Back to the library", "/author"],
    ["student-home", "Back to your classes", "/learn"],
    ["sessions", "Back to live sessions", "/author/sessions"],
    ["join", "Back to the join page", "/join"],
  ])("goes %s, named for where it goes", (to, name, href) => {
    render(<WayBack to={to} />);

    expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
  });
});
