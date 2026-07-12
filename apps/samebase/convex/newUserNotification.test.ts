import { describe, expect, it } from "vite-plus/test";

import { buildNewUserNotification } from "./newUserNotification";

describe("new user notification", () => {
  it("builds the admin notification for a new user", () => {
    expect(
      buildNewUserNotification({
        existingUserId: null,
        passwordAuthMode: "off",
        profile: {
          email: "ada@example.com",
          name: "Ada Lovelace",
        },
        providerId: "google",
        userId: "user-id",
      }),
    ).toEqual({
      to: "nicu@samebase.com",
      subject: "New Samebase signup",
      text: `A new user signed up for Samebase.

Name: Ada Lovelace
Email: ada@example.com
User ID: user-id
Provider: google`,
    });
  });

  it("does not notify for an existing or newly linked user", () => {
    expect(
      buildNewUserNotification({
        existingUserId: "existing-user-id",
        passwordAuthMode: "off",
        profile: {},
        providerId: "google",
        userId: "existing-user-id",
      }),
    ).toBeNull();
  });

  it("does not treat deployment password-account seeding as a signup", () => {
    expect(
      buildNewUserNotification({
        existingUserId: null,
        passwordAuthMode: "preview_seed",
        profile: { email: "preview@example.com" },
        providerId: "password",
        userId: "seed-user-id",
      }),
    ).toBeNull();
  });
});
