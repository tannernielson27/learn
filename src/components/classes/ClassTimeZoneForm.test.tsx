import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClassFormState } from "./ClassNameForm";
import { ClassTimeZoneForm, type ClassTimeZoneFormProps } from "./ClassTimeZoneForm";

const ZONES = ["America/Denver", "America/New_York", "Europe/London", "UTC"];

function setup(result: ClassFormState, props: Partial<ClassTimeZoneFormProps> = {}) {
  const action = vi.fn<ClassTimeZoneFormProps["action"]>(async () => result);
  render(
    <ClassTimeZoneForm action={action} currentZone="America/Denver" zones={ZONES} {...props} />,
  );
  return { action, user: userEvent.setup() };
}

function browserZone(zone: string) {
  const real = Intl.DateTimeFormat.prototype.resolvedOptions;
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (
    this: Intl.DateTimeFormat,
  ) {
    return { ...real.call(this), timeZone: zone };
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ClassTimeZoneForm", () => {
  it("keeps the class's current zone selected", () => {
    setup({ status: "idle" });
    expect(screen.getByRole("combobox", { name: "Time zone" })).toHaveValue("America/Denver");
    expect(screen.getAllByRole("option")).toHaveLength(ZONES.length);
  });

  it("saves the chosen zone", async () => {
    const { action, user } = setup({ status: "saved" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Time zone" }), "Europe/London");
    await user.click(screen.getByRole("button", { name: "Save time zone" }));
    expect(action.mock.calls[0]![1].get("timeZone")).toBe("Europe/London");
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
  });

  it("suggests the browser's zone when it differs, and picks it on request", async () => {
    browserZone("America/New_York");
    const { user } = setup({ status: "idle" });
    await user.click(screen.getByRole("button", { name: "Use America/New York" }));
    expect(screen.getByRole("combobox", { name: "Time zone" })).toHaveValue("America/New_York");
    expect(screen.queryByRole("button", { name: /^Use / })).toBeNull();
  });

  it("suggests nothing when the browser is already on the selected zone", () => {
    browserZone("America/Denver");
    setup({ status: "idle" });
    expect(screen.queryByRole("button", { name: /^Use / })).toBeNull();
  });

  it("suggests nothing the list does not offer", () => {
    browserZone("Antarctica/Troll");
    setup({ status: "idle" });
    expect(screen.queryByRole("button", { name: /^Use / })).toBeNull();
  });

  it("ties an error to the select and focuses it", async () => {
    const { user } = setup({ status: "error", error: "Choose a time zone from the list." });
    await user.click(screen.getByRole("button", { name: "Save time zone" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a time zone from the list.");
    expect(screen.getByRole("combobox", { name: "Time zone" })).toHaveFocus();
  });
});
