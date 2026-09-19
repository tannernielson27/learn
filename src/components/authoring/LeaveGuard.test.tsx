import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GuardedLink, LeaveGuardProvider, useLeaveGuard, type LeaveGuard } from "./LeaveGuard";

function Guarding({ guard }: { guard: LeaveGuard }) {
  useLeaveGuard(guard);
  return null;
}

function setup(guard?: LeaveGuard) {
  render(
    <LeaveGuardProvider>
      <GuardedLink href="/author">LeaRN</GuardedLink>
      {guard ? <Guarding guard={guard} /> : null}
    </LeaveGuardProvider>,
  );
  return screen.getByRole("link", { name: "LeaRN" });
}

// fireEvent.click returns false when a handler prevented the default (the navigation).
describe("GuardedLink", () => {
  it("navigates as a plain link when nothing on the page guards leaving", () => {
    expect(fireEvent.click(setup())).toBe(true);
  });

  it("asks the page's guard first, and stays when the guard takes over", () => {
    const guard = vi.fn(() => true);
    const link = setup(guard);
    expect(fireEvent.click(link)).toBe(false);
    expect(guard).toHaveBeenCalledWith("/author");
  });

  it("navigates when the guard lets it go", () => {
    const guard = vi.fn(() => false);
    expect(fireEvent.click(setup(guard))).toBe(true);
    expect(guard).toHaveBeenCalledOnce();
  });

  it("leaves a click that opens a new tab or window alone, since the page stays open", () => {
    const guard = vi.fn(() => true);
    const link = setup(guard);
    fireEvent.click(link, { ctrlKey: true });
    fireEvent.click(link, { metaKey: true });
    fireEvent.click(link, { shiftKey: true });
    expect(guard).not.toHaveBeenCalled();
  });

  it("stops guarding once the guarding page has gone", () => {
    const guard = vi.fn(() => true);
    const { rerender } = render(
      <LeaveGuardProvider>
        <GuardedLink href="/author">Home</GuardedLink>
        <Guarding guard={guard} />
      </LeaveGuardProvider>,
    );
    rerender(
      <LeaveGuardProvider>
        <GuardedLink href="/author">Home</GuardedLink>
      </LeaveGuardProvider>,
    );
    expect(fireEvent.click(screen.getByRole("link", { name: "Home" }))).toBe(true);
    expect(guard).not.toHaveBeenCalled();
  });
});
