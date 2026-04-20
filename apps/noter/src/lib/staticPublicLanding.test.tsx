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
      passwordAuthMode: "preview_seed",
      repoUrl: "https://github.com/noter-md/noter",
    });

    expect(markup).toContain('data-testid="public-landing-content"');
    expect(markup).toContain("build-time landing slogan");
    expect(markup).toContain("Preview password sign in");
    expect(markup).toContain("https://x.com/noter_md");
    expect(markup).toContain('data-testid="app-build-status-bar"');
    expect(markup).toContain("/terms");
    expect(markup).toContain("/privacy");
  });

  it("omits the password auth block when the deployment mode is off", () => {
    const markup = renderStaticPublicLandingMarkup({
      appCommit: "0123456789abcdef",
      appCommitNumber: 463,
      landingPageSlogan: "build-time landing slogan",
      passwordAuthMode: "off",
      repoUrl: "https://github.com/noter-md/noter",
    });

    expect(markup).not.toContain("Preview password sign in");
    expect(markup).not.toContain("Password auth (local worktree)");
  });

  it("injects the static landing markup into the app root", () => {
    const html = injectStaticPublicLandingIntoIndexHtml({
      indexHtml:
        '<!doctype html><html><body><div id="root"><!--__NOTER_STATIC_PUBLIC_LANDING__--></div></body></html>',
      passwordAuthMode: "preview_seed",
      staticMarkup: '<div data-testid="public-landing-content">landing</div>',
    });

    expect(html).toContain(
      `<div id="root" ${STATIC_PUBLIC_LANDING_ROOT_ATTRIBUTE}="true" data-static-public-password-auth-mode="preview_seed"><div data-testid="public-landing-content">landing</div></div>`,
    );
  });
});
