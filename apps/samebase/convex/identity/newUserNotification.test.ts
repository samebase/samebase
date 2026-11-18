import { describe, expect, it } from "vite-plus/test";

import { buildNewUserNotification } from "./newUserNotification";

describe("new user notification", () => {
  it("builds the admin notification for a new user", () => {
    const notification = buildNewUserNotification({
      existingUserId: null,
      profile: {
        email: "ada@example.com",
        name: "Ada Lovelace",
      },
      providerId: "google",
      seededPasswordEmail: null,
      userId: "user-id",
    });

    expect(notification?.to).toBe("nicuchiciuc@gmail.com");
    for (const detail of ["Ada Lovelace", "ada@example.com", "user-id", "google"]) {
      expect(notification?.text).toContain(detail);
    }
  });

  it("does not notify for an existing or newly linked user", () => {
    expect(
      buildNewUserNotification({
        existingUserId: "existing-user-id",
        profile: {},
        providerId: "google",
        seededPasswordEmail: null,
        userId: "existing-user-id",
      }),
    ).toBeNull();
  });

  it("does not treat deployment password-account seeding as a signup", () => {
    expect(
      buildNewUserNotification({
        existingUserId: null,
        profile: { email: "preview@example.com" },
        providerId: "password",
        seededPasswordEmail: "preview@example.com",
        userId: "seed-user-id",
      }),
    ).toBeNull();
  });

  it("notifies for a password signup that is not the seeded account", () => {
    expect(
      buildNewUserNotification({
        existingUserId: null,
        profile: { email: "new-user@example.com" },
        providerId: "password",
        seededPasswordEmail: "nicu@samebase.com",
        userId: "new-user-id",
      }),
    ).toMatchObject({
      to: "nicuchiciuc@gmail.com",
    });
  });
});
