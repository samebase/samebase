import { describe, expect, it } from "vite-plus/test";

import {
  buildDefaultAppResourceName,
  buildNumberedAppResourceNameSuggestion,
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

  it("rejects the Cloudflare Worker name from the production failure", () => {
    expect(validateAppResourceName("samebase_app", "cloudflare")).toEqual({
      valid: false,
      message:
        "Cloudflare Worker name can use lowercase letters, numbers, and dashes, and must start and end with a letter or number.",
      suggestion: "samebase-app",
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
  });

  it("enumerates generated provider name state axes", () => {
    for (const { provider, maxLength } of generatedNameCases) {
      const exactLimitName = "a".repeat(maxLength);
      const overLimitName = "a".repeat(maxLength + 1);
      const sanitizationCases = [
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

      for (const { rawName, sanitized } of sanitizationCases) {
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

  it("enforces the Cloudflare preview URL name limit", () => {
    expect(validateAppResourceName("a".repeat(54), "cloudflare").valid).toBe(true);
    expect(validateAppResourceName("a".repeat(55), "cloudflare")).toEqual({
      valid: false,
      message: "Cloudflare Worker name must be 54 characters or fewer.",
      suggestion: "a".repeat(54),
    });
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
