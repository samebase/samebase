import { describe, expect, it } from "vite-plus/test";

import {
  buildAvailableAppResourceNameSuggestion,
  buildDefaultAppResourceName,
  buildNumberedAppResourceNameSuggestion,
  formatAppResourceNameConflictMessage,
  sanitizeAppResourceName,
  validateAppResourceName,
  type AppResourceNameProvider,
} from "./appResourceNames";

const generatedNameCases = [
  { provider: "convex", maxLength: 40 },
  { provider: "cloudflare", maxLength: 54 },
] satisfies Array<{
  provider: AppResourceNameProvider;
  maxLength: number;
}>;

describe("app resource names", () => {
  it("defaults provider names from only the repository name", () => {
    expect(
      buildDefaultAppResourceName({
        repositoryName: "My_App.Name",
        provider: "convex",
      }),
    ).toBe("my-app-name");
    expect(
      buildDefaultAppResourceName({
        repositoryName: "My_App.Name",
        provider: "cloudflare",
      }),
    ).toBe("my-app-name");
  });

  it("uses provider-specific name limits", () => {
    const longName = "a-very-long-generated-app-name-that-should-be-truncated-for-providers";

    expect(sanitizeAppResourceName(longName, "convex")).toHaveLength(40);
    expect(sanitizeAppResourceName(longName, "cloudflare")).toHaveLength(54);
  });

  it("keeps Convex display names and trims surrounding whitespace", () => {
    expect(validateAppResourceName("  Samebase App_1  ", "convex")).toEqual({
      valid: true,
      value: "Samebase App_1",
    });
    expect(validateAppResourceName("a".repeat(80), "convex").valid).toBe(true);
  });

  it("accepts Cloudflare Worker names that support preview URLs", () => {
    expect(validateAppResourceName("samebase-app", "cloudflare")).toEqual({
      valid: true,
      value: "samebase-app",
    });
    expect(validateAppResourceName("samebase1", "cloudflare").valid).toBe(true);
  });

  it("enforces documented Cloudflare Worker name characters", () => {
    expect(validateAppResourceName("samebase_app", "cloudflare")).toEqual({
      valid: false,
      message:
        "Cloudflare Worker name can use lowercase letters, numbers, and dashes, and cannot start or end with a dash.",
      suggestion: "samebase-app",
    });
    for (const invalidName of ["Samebase", "-samebase", "samebase-"]) {
      expect(validateAppResourceName(invalidName, "cloudflare").valid).toBe(false);
    }
  });

  it("enforces the Cloudflare preview URL name limit", () => {
    expect(validateAppResourceName("a".repeat(54), "cloudflare").valid).toBe(true);
    expect(validateAppResourceName("a".repeat(55), "cloudflare")).toEqual({
      valid: false,
      message: "Cloudflare Worker name must be 54 characters or fewer.",
      suggestion: "a".repeat(54),
    });
  });

  it("keeps numbered suggestions within the provider limit", () => {
    expect(
      buildNumberedAppResourceNameSuggestion({
        provider: "convex",
        baseName: "a-very-long-generated-app-name-that-will-conflict",
        number: 12,
      }),
    ).toBe("a-very-long-generated-app-name-that-w-12");

    expect(
      buildAvailableAppResourceNameSuggestion({
        provider: "convex",
        baseName: "samebase-app",
        unavailableNames: new Set(["samebase-app", "samebase-app-2"]),
      }),
    ).toBe("samebase-app-3");
    expect(
      buildAvailableAppResourceNameSuggestion({
        provider: "convex",
        baseName: "samebase-app-2",
        unavailableNames: new Set(["samebase-app-2"]),
      }),
    ).toBe("samebase-app-3");
  });

  it("formats provider name conflicts for public UI", () => {
    expect(formatAppResourceNameConflictMessage({ provider: "convex", name: "samebase-app" })).toBe(
      "A Convex project named samebase-app already exists.",
    );
    expect(
      formatAppResourceNameConflictMessage({ provider: "cloudflare", name: "samebase-app" }),
    ).toBe("A Cloudflare Worker named samebase-app already exists.");
  });

  it("enumerates generated provider name state axes", () => {
    for (const { provider, maxLength } of generatedNameCases) {
      const exactLimitName = "a".repeat(maxLength);
      const overLimitName = "a".repeat(maxLength + 1);
      const cases = [
        {
          rawName: "my-app-1",
          sanitized: "my-app-1",
        },
        {
          rawName: exactLimitName,
          sanitized: exactLimitName,
        },
        {
          rawName: overLimitName,
          sanitized: exactLimitName,
        },
        {
          rawName: "My App",
          sanitized: "my-app",
        },
        {
          rawName: "-my-app-",
          sanitized: "my-app",
        },
      ];

      for (const { rawName, sanitized } of cases) {
        expect(sanitizeAppResourceName(rawName, provider)).toBe(sanitized);
      }

      const numberedSuggestion = buildNumberedAppResourceNameSuggestion({
        provider,
        baseName: exactLimitName,
        number: 20,
      });
      expect(numberedSuggestion.length).toBeLessThanOrEqual(maxLength);
      expect(validateAppResourceName(numberedSuggestion, provider).valid).toBe(true);
    }
  });

  it("requires a name for every provider", () => {
    for (const { provider } of generatedNameCases) {
      expect(validateAppResourceName("  ", provider)).toEqual({
        valid: false,
        message: `${provider === "convex" ? "Convex project" : "Cloudflare Worker"} name is required.`,
        suggestion: null,
      });
    }
  });
});
