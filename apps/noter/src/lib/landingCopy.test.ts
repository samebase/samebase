import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_LANDING_SLOGAN } from "@/lib/landingSlogans";
import {
  buildLandingPageMarkdown,
  landingPageBullets,
  landingPageMarkdown,
  landingPageSlogans,
  selectLandingPageMarkdown,
} from "./landingCopy";

describe("landingCopy", () => {
  it("builds landing markdown from an explicit slogan", () => {
    const markdown = buildLandingPageMarkdown("ship from your notes");

    expect(markdown).toContain("## ship from your notes");
    for (const bullet of landingPageBullets) {
      expect(markdown).toContain(`- ${bullet}`);
    }
  });

  it("keeps the module default deterministic for SSR-safe fallbacks", () => {
    expect(landingPageMarkdown).toBe(buildLandingPageMarkdown(DEFAULT_LANDING_SLOGAN));
  });

  it("selects request markdown from the caller-provided random source", () => {
    const firstMarkdown = selectLandingPageMarkdown(() => 0);
    const selectedSlogan = landingPageSlogans[0] ?? DEFAULT_LANDING_SLOGAN;

    expect(firstMarkdown).toContain(`## ${selectedSlogan}`);
  });
});
