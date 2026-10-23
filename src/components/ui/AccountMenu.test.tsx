import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountMenu, MENU_ITEM_CLASSES } from "./AccountMenu";

function menu(signOut = vi.fn()) {
  render(
    <AccountMenu
      name="Chidinma Okonkwo"
      initials="CO"
      signOut={signOut}
      links={
        <>
          <a href="/account" className={MENU_ITEM_CLASSES}>
            Account
          </a>
          <a href="/help" className={MENU_ITEM_CLASSES}>
            Help
          </a>
        </>
      }
    />,
  );
  return signOut;
}

describe("AccountMenu", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("opens a native popover from a named button", () => {
    menu();
    const button = screen.getByRole("button", { name: "Account menu" });
    expect(button).toHaveTextContent("CO");
    const panelId = button.getAttribute("popovertarget");
    expect(panelId).toBeTruthy();
    const panel = document.getElementById(panelId!)!;
    expect(panel).toHaveAttribute("popover", "auto");
    expect(panel).toHaveTextContent("Chidinma Okonkwo");
  });

  it("holds Account, Help and Sign out", () => {
    menu();
    const nav = screen.getByRole("navigation", { name: "Help and account", hidden: true });
    expect(nav).toHaveTextContent("AccountHelp");
    const signOut = screen.getByRole("button", { name: "Sign out", hidden: true });
    expect(signOut).toHaveAttribute("type", "submit");
    expect(signOut.closest("form")).not.toBeNull();
  });

  it("closes when one of its links is followed, since the layout outlives the navigation", () => {
    menu();
    const panel = document.getElementById(
      screen.getByRole("button", { name: "Account menu" }).getAttribute("popovertarget")!,
    )!;
    // jsdom has no popover API; stand in for an open panel.
    const hide = vi.fn();
    Object.assign(panel, { hidePopover: hide });
    const matches = panel.matches.bind(panel);
    vi.spyOn(panel, "matches").mockImplementation((query) =>
      query === ":popover-open" ? true : matches(query),
    );
    const help = screen.getByRole("link", { name: "Help", hidden: true });
    help.addEventListener("click", (event) => event.preventDefault());

    fireEvent.click(screen.getByText("The projector view is always light."));
    expect(hide).not.toHaveBeenCalled();
    fireEvent.click(help);
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it("sets the theme from the menu, the same store the page boots from", async () => {
    menu();
    const dark = screen.getByRole("radio", { name: "Dark", hidden: true });
    expect(screen.getByRole("radio", { name: "System", hidden: true })).toBeChecked();
    await userEvent.click(dark);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("learn.theme")).toBe("dark");
    expect(screen.getByText("The projector view is always light.")).toBeInTheDocument();
  });
});
