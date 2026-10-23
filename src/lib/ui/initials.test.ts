import { describe, expect, it } from "vitest";
import { accountInitials } from "./initials";

describe("accountInitials", () => {
  it("takes the first and last name's first letters", () => {
    expect(accountInitials("Chidinma Okonkwo")).toBe("CO");
    expect(accountInitials("Mary Jane Seacole")).toBe("MS");
    expect(accountInitials("ada")).toBe("A");
  });

  it("takes one letter from an email address", () => {
    expect(accountInitials("sam.lee@example.com")).toBe("S");
  });

  it("keeps a letter whole, and has something to show for nothing", () => {
    expect(accountInitials("Émile Zola")).toBe("ÉZ");
    expect(accountInitials("   ")).toBe("?");
    expect(accountInitials("@example.com")).toBe("?");
  });
});
