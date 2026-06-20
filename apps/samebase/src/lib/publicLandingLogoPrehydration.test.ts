// @vitest-environment jsdom

import { createContext, Script } from "node:vm";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  clearPublicLandingLogoStaticFallbackPrehydration,
  publicLandingLogoPrehydrationScript,
} from "@/lib/publicLandingLogoPrehydration";

function runPublicLandingLogoPrehydrationScript() {
  new Script(publicLandingLogoPrehydrationScript).runInContext(
    createContext({
      document,
      window,
    }),
  );
}

describe("publicLandingLogoPrehydration", () => {
  afterEach(() => {
    clearPublicLandingLogoStaticFallbackPrehydration();
    window.history.replaceState(null, "", "/");
  });

  it("hides the static fallback before hydration when the URL can change logo rendering", () => {
    window.history.replaceState(null, "", "/?rot=113.7&elev=37.5");

    runPublicLandingLogoPrehydrationScript();

    expect(
      document.documentElement.hasAttribute("data-public-landing-logo-static-fallback-hidden"),
    ).toBe(true);
    expect(
      document.getElementById("samebase-public-landing-logo-prehydration")?.textContent,
    ).toContain("[data-public-landing-logo-static-fallback]");
  });

  it("keeps the SSG fallback visible for non-rendering and non-logo query params", () => {
    window.history.replaceState(null, "", "/?prod-ui&zoom=0.5");

    runPublicLandingLogoPrehydrationScript();

    expect(
      document.documentElement.hasAttribute("data-public-landing-logo-static-fallback-hidden"),
    ).toBe(false);
    expect(document.getElementById("samebase-public-landing-logo-prehydration")).toBeNull();
  });
});
