import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LANDING_SLOGAN } from "./landingSlogans";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("landingPageSlogan", () => {
  it("uses the build-selected slogan when Vite injects one", async () => {
    vi.stubGlobal("__LANDING_PAGE_SLOGAN__", "build-time slogan");

    const { landingPageMarkdown, landingPageSlogan } =
      await import("./landingCopy");

    expect(landingPageSlogan).toBe("build-time slogan");
    expect(landingPageMarkdown).toContain("## build-time slogan");
  });

  it("falls back to the default slogan when the build marker is missing", async () => {
    const { landingPageMarkdown, landingPageSlogan } =
      await import("./landingCopy");

    expect(landingPageSlogan).toBe(DEFAULT_LANDING_SLOGAN);
    expect(landingPageMarkdown).toContain(`## ${DEFAULT_LANDING_SLOGAN}`);
  });
});
