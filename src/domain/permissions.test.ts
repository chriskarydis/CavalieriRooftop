import { describe, expect, it } from "vitest";
import { hasPermission, PERMISSIONS } from "./permissions";

describe("permissions", () => {
  it("gives the manager every operational permission", () => {
    for (const permission of ["operations", "configuration", "refunds", "analytics"] as const) {
      expect(hasPermission("MANAGER", permission)).toBe(true);
    }
  });
  it("keeps system administration from the manager", () => {
    expect(hasPermission("MANAGER", "system")).toBe(false);
  });
  it("gives the developer everything", () => {
    for (const permission of PERMISSIONS) expect(hasPermission("DEVELOPER", permission)).toBe(true);
  });
});
