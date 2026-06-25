import { describe, expect, it } from "vite-plus/test";

import { isAdminUser } from "./userAccess";

describe("isAdminUser", () => {
  it("matches admin emails case-insensitively", () => {
    expect(isAdminUser("NICU@SAMEBASE.COM")).toBe(true);
  });

  it("does not give staff access to the member test account by email", () => {
    expect(isAdminUser("nicu.dev@gmail.com")).toBe(false);
  });
});
