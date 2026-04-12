import { describe, expect, it } from "vitest";
import { renderStaticRootLandingHtml } from "./staticRootLanding";

const APP_HTML_FIXTURE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/app.js"></script>
  </body>
</html>`;
const LANDING_MARKDOWN_FIXTURE = `## ship from markdown

- your notes and code live in a real repository
- collaborate in real time with your team`;

describe("renderStaticRootLandingHtml", () => {
  it("injects a visible root landing into the app shell", () => {
    const html = renderStaticRootLandingHtml({
      appCommit: "abcdef1234567890",
      appCommitNumber: 321,
      appHtml: APP_HTML_FIXTURE,
      landingMarkdown: LANDING_MARKDOWN_FIXTURE,
      repoUrl: "https://github.com/noter-md/noter.git",
    });

    expect(html).toContain('data-noter-static-root-landing="1"');
    expect(html).toContain('data-testid="public-landing-content"');
    expect(html).toContain("Google sign-in requires JS");
    expect(html).toContain("Enable JavaScript to join the waitlist.");
    expect(html).toContain('data-testid="app-build-version">v321<');
    expect(html).toContain(
      'href="https://github.com/noter-md/noter/commit/abcdef1234567890"',
    );
    expect(html).toContain('src="/logo-static.svg"');
    expect(html).toContain(
      '<script type="module" src="/assets/app.js"></script>',
    );
  });

  it("adds the js marker script and css for the no-js placeholders", () => {
    const html = renderStaticRootLandingHtml({
      appCommit: "unknown",
      appCommitNumber: null,
      appHtml: APP_HTML_FIXTURE,
      landingMarkdown: LANDING_MARKDOWN_FIXTURE,
      repoUrl: "",
    });

    expect(html).toContain("noter-static-js");
    expect(html).toContain(".noter-static-no-js-only");
    expect(html).toContain(".noter-static-js-only");
    expect(html).toContain("display: flex !important");
    expect(html).toContain('class="hidden noter-static-js-only');
    expect(html).toMatch(/>\s*Google\s*</);
    expect(html).toContain('data-testid="app-build-version">v?<');
  });

  it("fails closed when the built app shell is missing the root placeholder", () => {
    expect(() =>
      renderStaticRootLandingHtml({
        appCommit: "abcdef1234567890",
        appCommitNumber: 321,
        appHtml: "<html><body></body></html>",
        landingMarkdown: LANDING_MARKDOWN_FIXTURE,
        repoUrl: "",
      }),
    ).toThrow("Missing root placeholder in built app HTML.");
  });
});
