import { describe, expect, it } from "vite-plus/test";

import {
  buildDefaultAppResourceName,
  buildNumberedAppResourceNameSuggestion,
  sanitizeAppResourceName,
  validateAppResourceName,
  type AppResourceNameProvider,
} from "./appResourceNames";

const providerCases = [
  { provider: "convex", maxLength: 40 },
  { provider: "cloudflare", maxLength: 63 },
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
    const longName =
      "a-very-long-generated-app-name-that-should-be-truncated-for-providers";

    expect(sanitizeAppResourceName(longName, "convex")).toHaveLength(40);
    expect(sanitizeAppResourceName(longName, "cloudflare")).toHaveLength(63);
  });

  it("validates provider names", () => {
    expect(validateAppResourceName("my-app", "convex")).toEqual({
      valid: true,
      value: "my-app",
    });
    expect(validateAppResourceName("My App", "cloudflare")).toEqual({
      valid: false,
      message:
        "Cloudflare Worker name can use lowercase letters, numbers, and dashes, and must start and end with a letter or number.",
      suggestion: "my-app",
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

  it("enumerates provider name state axes", () => {
    for (const { provider, maxLength } of providerCases) {
      const exactLimitName = "a".repeat(maxLength);
      const overLimitName = "a".repeat(maxLength + 1);
      const cases = [
        {
          rawName: "my-app-1",
          valid: true,
          sanitized: "my-app-1",
        },
        {
          rawName: exactLimitName,
          valid: true,
          sanitized: exactLimitName,
        },
        {
          rawName: overLimitName,
          valid: false,
          sanitized: exactLimitName,
        },
        {
          rawName: "My App",
          valid: false,
          sanitized: "my-app",
        },
        {
          rawName: "-my-app-",
          valid: false,
          sanitized: "my-app",
        },
      ];

      for (const { rawName, sanitized, valid } of cases) {
        expect(sanitizeAppResourceName(rawName, provider)).toBe(sanitized);
        expect(validateAppResourceName(rawName, provider).valid).toBe(valid);
      }

      const numberedSuggestion = buildNumberedAppResourceNameSuggestion({
        provider,
        baseName: exactLimitName,
        number: 20,
      });
      expect(numberedSuggestion.length).toBeLessThanOrEqual(maxLength);
      expect(validateAppResourceName(numberedSuggestion, provider).valid).toBe(
        true,
      );
    }
  });
});
