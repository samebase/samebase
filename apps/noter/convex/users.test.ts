import { describe, expect, it } from "vite-plus/test";

import { hasAppAccess, isAdminUser } from "./users";

describe("isAdminUser", () => {
  it("matches admin emails case-insensitively", () => {
    expect(isAdminUser(undefined, "NICU@NOTER.MD")).toBe(true);
  });

  it("matches admin GitHub usernames", () => {
    expect(isAdminUser("nicu-chiciuc")).toBe(true);
  });
});

describe("hasAppAccess", () => {
  it("allows explicitly approved users", () => {
    expect(
      hasAppAccess({
        githubUsername: undefined,
        email: "noter.guest@gmail.com",
        isApproved: true,
      }),
    ).toBe(true);
  });

  it("allows admins without a stored approval flag", () => {
    expect(
      hasAppAccess({
        githubUsername: undefined,
        email: "nicu@noter.md",
      }),
    ).toBe(true);
  });

  it("blocks unapproved non-admin users", () => {
    expect(
      hasAppAccess({
        githubUsername: undefined,
        email: "noter.guest@gmail.com",
      }),
    ).toBe(false);
  });
});
