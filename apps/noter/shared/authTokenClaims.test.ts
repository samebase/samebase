import { describe, expect, it } from "vite-plus/test";
import { buildAuthTokenProfileCustomClaims, readAuthTokenProfileClaims } from "./authTokenClaims";

describe("auth token claims", () => {
  it("reads the profile claims used for the optimistic auth presentation", () => {
    expect(
      readAuthTokenProfileClaims({
        email: "nicu@noter.md",
        name: "Nicu",
      }),
    ).toEqual({
      email: "nicu@noter.md",
      name: "Nicu",
    });
  });

  it("rejects missing or blank profile claims", () => {
    expect(readAuthTokenProfileClaims({ email: " ", name: "" })).toBe(null);
    expect(readAuthTokenProfileClaims(null)).toBe(null);
  });

  it("ignores unusable profile claims while keeping usable siblings", () => {
    expect(
      readAuthTokenProfileClaims({
        email: " ",
        name: "Nicu",
      }),
    ).toEqual({
      name: "Nicu",
    });
    expect(
      readAuthTokenProfileClaims({
        email: "nicu@noter.md",
        name: 123,
      }),
    ).toEqual({
      email: "nicu@noter.md",
    });
  });

  it("builds flat Convex Auth custom claims without avatar fields", () => {
    expect(
      buildAuthTokenProfileCustomClaims({
        email: "nicu@noter.md",
        name: "Nicu",
      }),
    ).toEqual({
      email: "nicu@noter.md",
      name: "Nicu",
    });
  });
});
