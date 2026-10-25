import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JoinScreen } from "./JoinScreen";

vi.mock("./actions", () => ({ joinLiveSession: async () => ({ status: "idle" }) }));

describe("JoinScreen (Main and JoinDesktop mockups)", () => {
  it("names the page, says no account is needed, and asks for the code and a name", () => {
    render(<JoinScreen code="" />);
    expect(screen.getByRole("heading", { level: 1, name: "Join a live session" })).toBeVisible();
    expect(screen.getByText("No account needed.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Join code" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Display name" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();
  });

  it("says what happens next, in three steps, beside the form on a laptop", () => {
    render(<JoinScreen code="" />);
    const next = screen.getByRole("region", { name: "What happens next" });
    expect(next).toHaveClass("hidden", "lg:flex");
    expect(
      within(next)
        .getAllByRole("listitem")
        .map((step) => step.textContent),
    ).toEqual([
      expect.stringContaining("Wait for your teacher"),
      expect.stringContaining("Answer on this screen"),
      expect.stringContaining("See the answer together"),
    ]);
  });

  it("sends a student holding a class code to the right place", () => {
    render(<JoinScreen code="" />);
    expect(screen.getByRole("link", { name: "Join your class" })).toBeInTheDocument();
    expect(screen.getByText(/Have a class code like ABCD-2345\?/)).toBeInTheDocument();
  });
});

describe("JoinScreen for a signed-in student (ADR 0013)", () => {
  it("says who is joining and for which class, fills in the name, and offers to join as a guest", () => {
    render(
      <JoinScreen
        code="7KQ2MZ"
        account={{
          kind: "member",
          name: "Mia Chen",
          className: "NUR 310",
          guestHref: "/join/7KQ2MZ?guest=1",
        }}
      />,
    );
    expect(screen.getByText("Joining as Mia Chen for NUR 310.")).toBeInTheDocument();
    expect(screen.getByText("Your answers count toward the class.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join as a guest instead" })).toHaveAttribute(
      "href",
      "/join/7KQ2MZ?guest=1",
    );
    expect(screen.getByRole("textbox", { name: "Display name" })).toHaveValue("Mia Chen");
  });

  it("says only the class when the account has no name yet", () => {
    render(
      <JoinScreen
        code="7KQ2MZ"
        account={{ kind: "member", name: null, className: "NUR 310", guestHref: "/x" }}
      />,
    );
    expect(screen.getByText("Joining for NUR 310.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Display name" })).toHaveValue("");
  });

  it("tells a signed-in student what counts, without guessing which session the code is", () => {
    render(
      <JoinScreen
        code=""
        account={{ kind: "student", name: "Mia Chen", guestHref: "/join?guest=1" }}
      />,
    );
    expect(
      screen.getByText(
        "Signed in as Mia Chen. If this live session is for one of your classes, your answers count toward it.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join as a guest instead" })).toHaveAttribute(
      "href",
      "/join?guest=1",
    );
    // Nothing is filled in: the class is not known.
    expect(screen.getByRole("textbox", { name: "Display name" })).toHaveValue("");
  });

  it("says a guest's answers count toward no class, and how to undo it", () => {
    render(<JoinScreen code="7KQ2MZ" account={{ kind: "guest", signedInHref: "/join/7KQ2MZ" }} />);
    expect(
      screen.getByText("Joining as a guest. Your answers do not count toward a class."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join with your account" })).toHaveAttribute(
      "href",
      "/join/7KQ2MZ",
    );
  });

  it("is today's screen for everyone else", () => {
    const { container: plain } = render(<JoinScreen code="7KQ2MZ" />);
    const { container: none } = render(<JoinScreen code="7KQ2MZ" account={{ kind: "none" }} />);
    // The two renders differ only in the ids useId draws.
    const ids = (html: string) => html.replace(/_r_[0-9a-z]+_/g, "_id_");
    expect(ids(none.innerHTML)).toBe(ids(plain.innerHTML));
  });
});
