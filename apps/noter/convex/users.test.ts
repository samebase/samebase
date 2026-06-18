import { describe, expect, it } from "vite-plus/test";

import { hasAppAccess, isAdminUser } from "./userAccess";

describe("isAdminUser", () => {
  it("matches admin emails case-insensitively", () => {
    expect(isAdminUser("NICU@NOTER.MD")).toBe(true);
  });

  it("does not give staff access to the member test account by email", () => {
    expect(isAdminUser("nicu.dev@gmail.com")).toBe(false);
  });
});

describe("hasAppAccess", () => {
  it("allows explicitly approved users", () => {
    expect(
      hasAppAccess({
        email: "noter.guest@gmail.com",
        isApproved: true,
      }),
    ).toBe(true);
  });

  it("allows admins without a stored approval flag", () => {
    expect(
      hasAppAccess({
        email: "nicu@noter.md",
      }),
    ).toBe(true);
  });

  it("blocks unapproved non-admin users", () => {
    expect(
      hasAppAccess({
        email: "noter.guest@gmail.com",
      }),
    ).toBe(false);
  });
});
