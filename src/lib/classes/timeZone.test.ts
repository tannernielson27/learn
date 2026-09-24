import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLASS_TIME_ZONE,
  formatInZone,
  isKnownTimeZone,
  parseTimeZoneForm,
  TIME_ZONE_ERROR,
  timeZoneChoices,
  zoneOfClass,
} from "./timeZone";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("isKnownTimeZone", () => {
  it("knows IANA names and UTC", () => {
    expect(isKnownTimeZone("America/Denver")).toBe(true);
    expect(isKnownTimeZone("Europe/London")).toBe(true);
    expect(isKnownTimeZone("UTC")).toBe(true);
  });

  it("refuses anything else, including the empty string and offsets", () => {
    expect(isKnownTimeZone("")).toBe(false);
    expect(isKnownTimeZone("Not/AZone")).toBe(false);
    expect(isKnownTimeZone("+05:00")).toBe(false);
    expect(isKnownTimeZone("America/Denver; drop table")).toBe(false);
  });
});

describe("formatInZone", () => {
  // 2026-09-24 23:00 UTC is 17:00 in Denver (MDT) and 19:00 in New York (EDT).
  const CLOSES = "2026-09-24T23:00:00Z";

  it("says the instant in the class's zone, with the zone's short name", () => {
    expect(formatInZone(CLOSES, "America/Denver")).toBe("Thu 24 Sep 2026, 17:00 MDT");
    expect(formatInZone(CLOSES, "America/New_York")).toBe("Thu 24 Sep 2026, 19:00 EDT");
  });

  it("moves the date when the zone crosses midnight", () => {
    expect(formatInZone(CLOSES, "Europe/London")).toMatch(/^Fri 25 Sep 2026, 00:00 /);
  });

  it("follows the zone across a daylight saving change", () => {
    // Denver leaves daylight time at 02:00 on Sunday 1 November 2026: the same 23:00 UTC is 17:00
    // MDT the day before and 16:00 MST the day after.
    expect(formatInZone("2026-10-31T23:00:00Z", "America/Denver")).toBe(
      "Sat 31 Oct 2026, 17:00 MDT",
    );
    expect(formatInZone("2026-11-01T23:00:00Z", "America/Denver")).toBe(
      "Sun 1 Nov 2026, 16:00 MST",
    );
  });

  it("hands back an unreadable instant as it is rather than failing the page", () => {
    expect(formatInZone("not-a-date", "America/Denver")).toBe("not-a-date");
  });

  it("falls back to UTC, labelled, for a zone this runtime does not know", () => {
    expect(formatInZone(CLOSES, "Not/AZone")).toBe("Thu 24 Sep 2026, 23:00 UTC");
  });
});

describe("timeZoneChoices", () => {
  it("sorts the zones, adds UTC, and drops duplicates", () => {
    expect(timeZoneChoices(["Europe/London", "America/Denver", "Europe/London"], "UTC")).toEqual([
      "America/Denver",
      "Europe/London",
      "UTC",
    ]);
  });

  it("always offers the current value, so the select keeps it selected", () => {
    expect(timeZoneChoices(["Europe/London"], "America/Denver")).toEqual([
      "America/Denver",
      "Europe/London",
      "UTC",
    ]);
  });

  it("does not change its input", () => {
    const zones = Object.freeze(["Europe/London", "America/Denver"]);
    timeZoneChoices(zones, "UTC");
    expect(zones).toEqual(["Europe/London", "America/Denver"]);
  });
});

describe("parseTimeZoneForm", () => {
  it("reads a known zone", () => {
    expect(parseTimeZoneForm(form({ timeZone: "America/New_York" }))).toEqual({
      ok: true,
      zone: "America/New_York",
    });
  });

  it("trims it", () => {
    expect(parseTimeZoneForm(form({ timeZone: "  UTC " }))).toEqual({ ok: true, zone: "UTC" });
  });

  it("refuses a missing, unknown, or oversized value", () => {
    const refused = { ok: false, error: TIME_ZONE_ERROR };
    expect(parseTimeZoneForm(form({}))).toEqual(refused);
    expect(parseTimeZoneForm(form({ timeZone: "Mars/Olympus" }))).toEqual(refused);
    expect(parseTimeZoneForm(form({ timeZone: `America/${"x".repeat(80)}` }))).toEqual(refused);
  });
});

describe("zoneOfClass", () => {
  const classes = [
    { id: "a", timeZone: "America/New_York" },
    { id: "b", timeZone: "Europe/London" },
  ];

  it("finds the class's zone", () => {
    expect(zoneOfClass(classes, "b")).toBe("Europe/London");
  });

  it("uses the default zone for a class it cannot find, or no list at all", () => {
    expect(zoneOfClass(classes, "c")).toBe(DEFAULT_CLASS_TIME_ZONE);
    expect(zoneOfClass(null, "a")).toBe(DEFAULT_CLASS_TIME_ZONE);
    expect(DEFAULT_CLASS_TIME_ZONE).toBe("America/Denver");
  });
});
