import { describe, expect, it } from "vite-plus/test";
import {
  buildLandingPageMarkdown,
  landingPageBullets,
  landingPageMarkdown,
  landingPageSlogan,
} from "./landingPageContent";

describe("landingCopy", () => {
  it("builds landing markdown from an explicit slogan", () => {
    const markdown = buildLandingPageMarkdown("ship from your notes");

    expect(markdown).toContain("## ship from your notes");
    for (const bullet of landingPageBullets) {
      expect(markdown).toContain(`- ${bullet}`);
    }
  });

  it("uses the build-selected slogan for runtime copy", () => {
    expect(landingPageSlogan).toBe("test landing slogan");
    expect(landingPageMarkdown).toBe(buildLandingPageMarkdown("test landing slogan"));
  });
});
