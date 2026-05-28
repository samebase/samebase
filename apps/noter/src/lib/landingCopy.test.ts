import { afterEach, describe, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("landingCopy", () => {
  it("builds landing markdown from an explicit slogan", async () => {
    vi.stubGlobal("__LANDING_PAGE_SLOGAN__", "build selected");
    const { buildLandingPageMarkdown, landingPageBullets } = await import("./landingCopy");
    const markdown = buildLandingPageMarkdown("ship from your notes");

    expect(markdown).toContain("## ship from your notes");
    for (const bullet of landingPageBullets) {
      expect(markdown).toContain(`- ${bullet}`);
    }
  });

  it("uses the build-selected slogan for runtime copy", async () => {
    vi.stubGlobal("__LANDING_PAGE_SLOGAN__", "build selected");
    const { buildLandingPageMarkdown, landingPageMarkdown, landingPageSlogan } =
      await import("./landingCopy");

    expect(landingPageSlogan.length).toBeGreaterThan(0);
    expect(landingPageMarkdown).toBe(buildLandingPageMarkdown(landingPageSlogan));
  });

  it("fails when the build-selected slogan is missing", async () => {
    await expect(import("./landingCopy")).rejects.toThrow("Missing build-selected landing slogan");
  });
});
