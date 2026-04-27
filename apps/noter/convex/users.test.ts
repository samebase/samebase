import { describe, expect, it } from "vite-plus/test";

import {
  hasAppAccess,
  isAdminUser,
  resolveUserPermissions,
} from "./permissionsModel";

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

describe("resolveUserPermissions", () => {
  it("grants every permission to admins", () => {
    expect(
      resolveUserPermissions({
        email: "nicu@noter.md",
        githubUsername: undefined,
      }),
    ).toEqual([
      "dashboard.monitoring.view",
      "fileView.access",
      "developerTools.view",
      "machines.access",
    ]);
  });

  it("keeps explicit non-admin grants in deterministic order", () => {
    expect(
      resolveUserPermissions({
        email: "noter.guest@gmail.com",
        githubUsername: undefined,
        isApproved: true,
        permissionGrants: [
          "machines.access",
          "dashboard.monitoring.view",
          "machines.access",
        ],
      }),
    ).toEqual(["dashboard.monitoring.view", "machines.access"]);
  });

  it("does not activate explicit grants for unapproved non-admin users", () => {
    expect(
      resolveUserPermissions({
        email: "noter.guest@gmail.com",
        githubUsername: undefined,
        permissionGrants: ["fileView.access"],
      }),
    ).toEqual([]);
  });
});
