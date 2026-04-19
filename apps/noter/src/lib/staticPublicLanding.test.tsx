import { describe, expect, it } from "vitest";

import { STATIC_PUBLIC_LANDING_ROOT_ATTRIBUTE } from "./staticPublicLandingShared";
import {
  injectStaticPublicLandingIntoIndexHtml,
  renderStaticPublicLandingMarkup,
} from "./staticPublicLanding";

describe("StaticPublicLanding", () => {
  it("renders the public landing shell into static markup", () => {
    const markup = renderStaticPublicLandingMarkup({
      appCommit: "0123456789abcdef",
      appCommitNumber: 463,
      landingPageSlogan: "build-time landing slogan",
      repoUrl: "https://github.com/noter-md/noter",
    });

    expect(markup).toContain('data-testid="public-landing-content"');
    expect(markup).toContain("build-time landing slogan");
    expect(markup).toContain("https://x.com/noter_md");
    expect(markup).toContain('data-testid="app-build-status-bar"');
    expect(markup).toContain("/terms");
    expect(markup).toContain("/privacy");
  });

  it("injects the static landing markup into the app root", () => {
    const html = injectStaticPublicLandingIntoIndexHtml({
      indexHtml:
        '<!doctype html><html><body><div id="root"><!--__NOTER_STATIC_PUBLIC_LANDING__--></div></body></html>',
      staticMarkup: '<div data-testid="public-landing-content">landing</div>',
    });

    expect(html).toContain(
      `<div id="root" ${STATIC_PUBLIC_LANDING_ROOT_ATTRIBUTE}="true"><div data-testid="public-landing-content">landing</div></div>`,
    );
  });
});
