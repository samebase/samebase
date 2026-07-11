import { describe, expect, it } from "vite-plus/test";
import {
  ACCOUNT_EMAIL_MAX_LENGTH,
  DISPLAY_NAME_MAX_CODE_POINTS,
  normalizeAccountEmail,
  normalizeDisplayName,
  resolveAccountPresentation,
} from "./accountPresentation";

function createEmail(length: number) {
  const suffix = "@b.co";
  return "a".repeat(length - suffix.length) + suffix;
}

describe("account presentation", () => {
  it("uses the explicit display name when one exists", () => {
    expect(
      resolveAccountPresentation({
        displayName: "  Nicu  ",
        email: " NICU@SAMEBASE.COM ",
      }),
    ).toEqual({ kind: "displayName", label: "Nicu" });
  });

  it("uses the canonical email when no display name exists", () => {
    expect(resolveAccountPresentation({ email: "nicu@samebase.com" })).toEqual({
      kind: "email",
      label: "nicu@samebase.com",
    });
  });

  it.each([
    {},
    { email: "not-an-email" },
    { email: createEmail(ACCOUNT_EMAIL_MAX_LENGTH + 1) },
    { displayName: "Nicu" },
    { displayName: "first\nsecond", email: "nicu@samebase.com" },
  ])("fails closed for invalid stored account fields %j", (input) => {
    expect(() => resolveAccountPresentation(input)).toThrow();
  });

  it("normalizes valid account emails", () => {
    expect(normalizeAccountEmail("  Nicu@Samebase.com ")).toBe("nicu@samebase.com");
    expect(normalizeAccountEmail(createEmail(ACCOUNT_EMAIL_MAX_LENGTH))).toHaveLength(
      ACCOUNT_EMAIL_MAX_LENGTH,
    );
  });

  it("rejects an email beyond the canonical maximum", () => {
    expect(() => normalizeAccountEmail(createEmail(ACCOUNT_EMAIL_MAX_LENGTH + 1))).toThrowError(
      `Email address must be ${ACCOUNT_EMAIL_MAX_LENGTH} characters or fewer.`,
    );
  });

  it.each(["", "nicu", "nicu@samebase", "nicu @samebase.com"])(
    "rejects invalid account email %j",
    (email) => {
      expect(() => normalizeAccountEmail(email)).toThrowError("A valid email address is required.");
    },
  );

  it("trims a valid display name", () => {
    expect(normalizeDisplayName("  Nicu  ")).toBe("Nicu");
  });

  it.each([
    ["", "Display name cannot be blank."],
    ["first\nsecond", "Display name must be one line."],
    ["a".repeat(DISPLAY_NAME_MAX_CODE_POINTS + 1), "Display name must be 64 characters or fewer."],
  ])("rejects invalid display name %j", (displayName, message) => {
    expect(() => normalizeDisplayName(displayName)).toThrowError(message);
  });

  it("counts Unicode code points instead of UTF-16 code units", () => {
    expect(normalizeDisplayName("🙂".repeat(DISPLAY_NAME_MAX_CODE_POINTS))).toHaveLength(
      DISPLAY_NAME_MAX_CODE_POINTS * 2,
    );
  });
});
