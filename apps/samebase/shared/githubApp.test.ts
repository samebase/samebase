import { describe, expect, it } from "vite-plus/test";

import {
  buildGitHubAppSetupReturnUrl,
  buildGitHubOrganizationProvidersReturnUrl,
  isSafeGitHubAppReturnToPath,
} from "./githubApp";

describe("GitHub App return URLs", () => {
  it("accepts same-origin root-relative paths and rejects alternate origins", () => {
    expect(isSafeGitHubAppReturnToPath("/org/acme/settings?prod-ui#github")).toBe(true);
    expect(isSafeGitHubAppReturnToPath("https://evil.example/settings")).toBe(false);
    expect(isSafeGitHubAppReturnToPath("//evil.example/settings")).toBe(false);
    expect(isSafeGitHubAppReturnToPath("/\\evil.example/settings")).toBe(false);
  });

  it("does not let an unsafe path replace the configured app origin", () => {
    expect(
      buildGitHubAppSetupReturnUrl({
        configuredAppUrl: "https://samebase.com",
        requestUrl: "https://samebase.com/oauth/github/callback",
        returnToPath: "/\\evil.example/settings",
      }),
    ).toBe("https://samebase.com/");
  });

  it("keeps query and hash values when a reconnect returns to the owner Providers page", () => {
    expect(
      buildGitHubOrganizationProvidersReturnUrl({
        githubOwnerLogin: "New-Owner",
        previousReturnUrl: "https://samebase.com/org/old-owner/providers?prod-ui#github",
      }),
    ).toBe("https://samebase.com/org/new-owner/providers?prod-ui#github");
  });
});
