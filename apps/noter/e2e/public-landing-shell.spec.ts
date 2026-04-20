import { devices, expect, test, type Locator } from "@playwright/test";
import {
  APP_BUILD_COMMIT_LINK_TEST_ID,
  APP_BUILD_STATUS_BAR_TEST_ID,
  APP_BUILD_VERSION_TEST_ID,
} from "../src/lib/appBuild";
import { PUBLIC_LANDING_SCROLL_SHELL_TEST_ID } from "../src/lib/publicLanding";
import {
  PUBLIC_LANDING_LOGO_SCENE_TEST_ID,
  PUBLIC_LANDING_LOGO_STAGE_TEST_ID,
  PUBLIC_LANDING_LOGO_TEST_ID,
} from "../src/lib/publicLandingLogo";
import { expectScreenshotsToMatch, takeStableScreenshot } from "./visualDiff";

// These budgets target the local production preview used in CI.
// Keep them loose enough to absorb runner variance while still catching
// obvious regressions in the public landing route.
const NAVIGATION_BUDGET_MS = {
  responseEnd: 150,
  domContentLoaded: 400,
  load: 500,
} as const;
const COPY_SHORTCUT_KEY =
  process.platform === "darwin" ? "Meta+C" : "Control+C";
const strictScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0,
  maxDiffPixels: 0,
} as const;

const {
  defaultBrowserType: _mobileLandingDefaultBrowserType,
  ...mobileLandingDevice
} = devices["iPhone 13"];

async function readNavigationTiming(page: Parameters<typeof test>[0]["page"]) {
  return page.evaluate(() => {
    const navigationEntry = performance.getEntriesByType("navigation")[0];

    if (!(navigationEntry instanceof PerformanceNavigationTiming)) {
      return null;
    }

    return {
      responseEndMs: navigationEntry.responseEnd,
      domContentLoadedMs: navigationEntry.domContentLoadedEventEnd,
      loadMs: navigationEntry.loadEventEnd,
    };
  });
}

type LandingToggleFrame = {
  href: string;
  top: number | null;
};

type LandingToggleLayout = {
  contentTop: number;
  contentHeight: number;
  authRowHeight: number;
  waitlistLinkTop: number;
  waitlistLinkOffset: number;
};

type LandingReloadFrame = {
  content: {
    top: number;
    height: number;
  } | null;
  copy: {
    top: number;
    height: number;
  } | null;
};

declare global {
  interface Window {
    __landingReloadFrames?: LandingReloadFrame[];
  }
}

async function captureLandingToggleFrames(
  page: Parameters<typeof test>[0]["page"],
  linkName: "/?dev" | "/",
): Promise<LandingToggleFrame[]> {
  const framesPromise = page.evaluate(() => {
    return new Promise<LandingToggleFrame[]>((resolve) => {
      const samples: LandingToggleFrame[] = [];
      let frame = 0;

      const capture = () => {
        const root = document.querySelector(
          '[data-testid="public-landing-content"]',
        );
        const rect =
          root instanceof HTMLElement ? root.getBoundingClientRect() : null;
        samples.push({
          href: window.location.href,
          top: rect ? Number(rect.top.toFixed(3)) : null,
        });
        frame += 1;
        if (frame >= 45) {
          resolve(samples);
          return;
        }
        requestAnimationFrame(capture);
      };

      requestAnimationFrame(capture);
    });
  });

  await page.getByRole("link", { name: linkName, exact: true }).click();
  return await framesPromise;
}

async function readLandingToggleLayout(
  page: Parameters<typeof test>[0]["page"],
): Promise<LandingToggleLayout> {
  return await page.evaluate(() => {
    const content = document.querySelector(
      '[data-testid="public-landing-content"]',
    );
    const waitlistLink = document.querySelector(
      'a[href="https://x.com/noter_md"]',
    );
    const googleButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Google") ?? false,
    );

    if (!(content instanceof HTMLElement)) {
      throw new Error("Expected landing content element");
    }
    if (!(waitlistLink instanceof HTMLElement)) {
      throw new Error("Expected landing waitlist link element");
    }
    if (!(googleButton instanceof HTMLElement)) {
      throw new Error("Expected landing Google button element");
    }

    const contentRect = content.getBoundingClientRect();
    const waitlistLinkRect = waitlistLink.getBoundingClientRect();
    const googleRect = googleButton.getBoundingClientRect();

    return {
      contentTop: Number(contentRect.top.toFixed(3)),
      contentHeight: Number(contentRect.height.toFixed(3)),
      authRowHeight: Number(googleRect.height.toFixed(3)),
      waitlistLinkTop: Number(waitlistLinkRect.top.toFixed(3)),
      waitlistLinkOffset: Number(
        (waitlistLinkRect.top - contentRect.top).toFixed(3),
      ),
    };
  });
}

async function captureLandingReloadFrames(
  page: Parameters<typeof test>[0]["page"],
  path?: string,
): Promise<LandingReloadFrame[]> {
  await page.addInitScript(() => {
    const sampleCount = 60;
    const frameStore: LandingReloadFrame[] = [];
    window.__landingReloadFrames = frameStore;

    const readRect = (node: Element | null) => {
      if (!(node instanceof HTMLElement)) {
        return null;
      }

      const rect = node.getBoundingClientRect();
      return {
        top: Number(rect.top.toFixed(3)),
        height: Number(rect.height.toFixed(3)),
      };
    };

    let frame = 0;
    const capture = () => {
      frameStore.push({
        content: readRect(
          document.querySelector('[data-testid="public-landing-content"]'),
        ),
        copy: readRect(
          document.querySelector('[data-testid="public-landing-copy"]'),
        ),
      });
      frame += 1;
      if (frame >= sampleCount) {
        return;
      }
      requestAnimationFrame(capture);
    };

    requestAnimationFrame(capture);
  });

  if (path !== undefined) {
    await page.goto(path, { waitUntil: "networkidle" });
  }
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  return await page.evaluate(() => {
    const landingReloadFrames = window.__landingReloadFrames;

    return Array.isArray(landingReloadFrames) ? landingReloadFrames : [];
  });
}

async function captureLandingInitialFrames(
  page: Parameters<typeof test>[0]["page"],
  path = "/",
): Promise<LandingReloadFrame[]> {
  await page.addInitScript(() => {
    const sampleCount = 60;
    const frameStore: LandingReloadFrame[] = [];
    window.__landingReloadFrames = frameStore;

    const readRect = (node: Element | null) => {
      if (!(node instanceof HTMLElement)) {
        return null;
      }

      const rect = node.getBoundingClientRect();
      return {
        top: Number(rect.top.toFixed(3)),
        height: Number(rect.height.toFixed(3)),
      };
    };

    let frame = 0;
    const capture = () => {
      frameStore.push({
        content: readRect(
          document.querySelector('[data-testid="public-landing-content"]'),
        ),
        copy: readRect(
          document.querySelector('[data-testid="public-landing-copy"]'),
        ),
      });
      frame += 1;
      if (frame >= sampleCount) {
        return;
      }
      requestAnimationFrame(capture);
    };

    requestAnimationFrame(capture);
  });

  await page.goto(path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  return await page.evaluate(() => {
    const landingReloadFrames = window.__landingReloadFrames;

    return Array.isArray(landingReloadFrames) ? landingReloadFrames : [];
  });
}

function expectStableLandingReloadFrames(frames: LandingReloadFrame[]) {
  const visibleFrames = frames.flatMap((frame) => {
    if (frame.content === null || frame.copy === null) {
      return [];
    }
    return [frame];
  });

  expect(visibleFrames.length).toBeGreaterThanOrEqual(10);

  const contentTopValues = visibleFrames.map((frame) => frame.content!.top);
  const copyTopValues = visibleFrames.map((frame) => frame.copy!.top);
  const copyHeightValues = visibleFrames.map((frame) => frame.copy!.height);

  expect(
    Math.max(...contentTopValues) - Math.min(...contentTopValues),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.max(...copyTopValues) - Math.min(...copyTopValues),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.max(...copyHeightValues) - Math.min(...copyHeightValues),
  ).toBeLessThanOrEqual(1);
}

/**
 * The target route should stop shifting once at least 10 target-path frames
 * have been captured.
 */
function expectStableLandingToggleFrames(
  frames: LandingToggleFrame[],
  expectedPathWithSearch: "/?dev" | "/",
) {
  const sawExpectedPath = frames.some((frame) => {
    const url = new URL(frame.href);
    return `${url.pathname}${url.search}` === expectedPathWithSearch;
  });
  expect(sawExpectedPath).toBe(true);
  expect(frames.some((frame) => frame.top === null)).toBe(false);

  const expectedPathTopValues = frames.flatMap((frame) => {
    const url = new URL(frame.href);
    return `${url.pathname}${url.search}` === expectedPathWithSearch &&
      frame.top !== null
      ? [frame.top]
      : [];
  });
  expect(expectedPathTopValues.length).toBeGreaterThanOrEqual(10);
  expect(
    Math.max(...expectedPathTopValues) - Math.min(...expectedPathTopValues),
  ).toBeLessThanOrEqual(1);
}

async function expectLandingToggleFocusTarget(
  page: Parameters<typeof test>[0]["page"],
) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const activeElement = document.activeElement;
        return activeElement === document.body
          ? "body"
          : (activeElement?.tagName.toLowerCase() ?? null);
      }),
    )
    .toBe("body");
}

async function insertLandingHeadingMarker(
  page: Parameters<typeof test>[0]["page"],
  marker: string,
) {
  const editor = page.locator(".cm-content").first();
  const headingLine = editor.locator(".cm-line").first();

  await expect(headingLine).toBeVisible();
  await headingLine.click();
  await editor.pressSequentially(` ${marker}`);
  await expect(editor).toContainText(marker);
}

async function expectLandingLogoReady(image: Locator) {
  await expect(image).toBeVisible();
  await expect
    .poll(async () =>
      image.evaluate(
        (element) =>
          element instanceof HTMLImageElement &&
          element.complete &&
          element.naturalWidth > 0,
      ),
    )
    .toBe(true);
}

async function expectLandingLogoSceneReady(scene: Locator) {
  await expect(scene).toBeVisible();
  await expect(scene).toHaveAttribute("data-state", "ready");
}

async function expectAppBuildVersion(versionLabel: Locator) {
  await expect(versionLabel).toHaveText(/^v\d+$/);
}

async function expectAppBuildVersionDisplay(
  statusBar: Locator,
  versionLabel: Locator,
  commitLabel: Locator,
) {
  await expectAppBuildVersion(versionLabel);
  await expect(commitLabel).toHaveText(/^[0-9a-f]{8}$/);
  const buildVersionGroup = statusBar.locator(".font-mono").first();
  const versionText = await versionLabel.textContent();
  const commitText = await commitLabel.textContent();
  expect(versionText).not.toBeNull();
  expect(commitText).not.toBeNull();
  await expect
    .poll(async () => {
      const buildVersionText = await buildVersionGroup.textContent();
      return buildVersionText?.replace(/\s+/g, "") ?? null;
    })
    .toBe(`${versionText ?? ""}${commitText ?? ""}`);
}

async function expectAppBuildCommitLink(commitLabel: Locator) {
  const href = await commitLabel.getAttribute("href");

  expect(href).toMatch(
    /^https:\/\/github\.com\/noter-md\/noter\/commit\/[0-9a-f]{40}$/,
  );

  return href;
}

async function expectLegalLinksLeadBuildVersion(statusBar: Locator) {
  const termsLink = statusBar.getByRole("link", { name: "/terms" });
  const privacyLink = statusBar.getByRole("link", { name: "/privacy" });
  const versionLabel = statusBar.getByTestId(APP_BUILD_VERSION_TEST_ID);

  await expect(termsLink).toBeVisible();
  await expect(privacyLink).toBeVisible();
  await expect(versionLabel).toBeVisible();

  const termsBox = await termsLink.boundingBox();
  const privacyBox = await privacyLink.boundingBox();
  const versionBox = await versionLabel.boundingBox();
  expect(termsBox).not.toBeNull();
  expect(privacyBox).not.toBeNull();
  expect(versionBox).not.toBeNull();
  if (termsBox === null || privacyBox === null || versionBox === null) {
    return;
  }

  expect(termsBox.x).toBeLessThan(versionBox.x);
  expect(privacyBox.x).toBeLessThan(versionBox.x);
}

async function expectStatusBarBelowMainShell(
  page: Parameters<typeof test>[0]["page"],
  statusBar: Locator,
) {
  const main = page.locator("main");
  const mainBox = await main.boundingBox();
  const statusBarBox = await statusBar.boundingBox();

  expect(mainBox).not.toBeNull();
  expect(statusBarBox).not.toBeNull();
  if (mainBox === null || statusBarBox === null) {
    return;
  }

  expect(statusBarBox.y).toBeGreaterThanOrEqual(mainBox.y + mainBox.height - 2);
}

async function selectText(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) {
    throw new Error("Expected selectable text bounds");
  }

  await locator.hover({ force: true });
  await locator.page().mouse.move(box.x + 1, box.y + box.height / 2);
  await locator.page().mouse.down();
  await locator
    .page()
    .mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 20 });
  await locator.page().mouse.up();
}

async function readClipboardText(page: Parameters<typeof test>[0]["page"]) {
  return page.evaluate(async () => navigator.clipboard.readText());
}

async function readLinkPresentation(link: Locator) {
  return link.evaluate((element) => {
    const linkStyle = window.getComputedStyle(element);
    const parent = element.parentElement;

    return {
      color: linkStyle.color,
      parentColor:
        parent === null ? null : window.getComputedStyle(parent).color,
      textDecorationLine: linkStyle.textDecorationLine,
    };
  });
}

async function expectLandingLogoAutoRotates(scene: Locator) {
  await expectLandingLogoSceneReady(scene);
  const initialRotationDegrees = await scene.getAttribute(
    "data-rotation-degrees",
  );
  expect(initialRotationDegrees).not.toBeNull();
  if (initialRotationDegrees === null) {
    return;
  }

  await expect
    .poll(async () => {
      const currentRotationDegrees = await scene.getAttribute(
        "data-rotation-degrees",
      );
      return currentRotationDegrees ?? initialRotationDegrees;
    })
    .not.toBe(initialRotationDegrees);
}

test("public landing renders the routed landing UI directly", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.getByTestId("public-landing-content")).toBeVisible();
  await expect(
    page.getByTestId(PUBLIC_LANDING_SCROLL_SHELL_TEST_ID),
  ).toBeVisible();
  await expectLandingLogoReady(page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID));
  await expect(
    page.getByRole("button", { name: "Google", includeHidden: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Google", includeHidden: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "https://x.com/noter_md", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "https://x.com/noter_md", exact: true }),
  ).toHaveAttribute("href", "https://x.com/noter_md");
});

test("public landing page source contains prerendered landing markup", async ({
  request,
}) => {
  const response = await request.get("/");
  const html = await response.text();

  expect(html).toContain('data-static-public-landing="true"');
  expect(html).toContain('data-testid="public-landing-content"');
  expect(html).toContain("https://x.com/noter_md");
  expect(html).toContain("/terms");
  expect(html).toContain("/privacy");
});

test("landing dev mode shows Google sign-in", async ({ page }) => {
  await page.goto("/?dev", { waitUntil: "networkidle" });

  await expect(page.getByRole("button", { name: "Google" })).toBeVisible();
});

test("public landing renders the closed Google signup return state", async ({
  page,
}) => {
  await page.goto("/?signup=google", { waitUntil: "networkidle" });

  const landingContent = page.getByTestId("public-landing-content");

  await expect(landingContent).toBeVisible();
  await expect(landingContent.getByRole("heading", { level: 2 })).toBeVisible();
  await expect(
    landingContent.getByRole("link", { name: "go back" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "https://x.com/noter_md", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Google", includeHidden: true }),
  ).toHaveCount(0);

  await expect(landingContent).toHaveScreenshot(
    "public-landing-google-signup-closed.png",
    strictScreenshotOptions,
  );
});

test("landing dev toggle keeps the waitlist row aligned", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const beforeToggleLayout = await readLandingToggleLayout(page);

  await page.getByRole("link", { name: "/?dev", exact: true }).click();
  await expect(page).toHaveURL(/\/\?dev$/);
  await expect(page.getByRole("button", { name: "Google" })).toBeVisible();

  const afterToggleLayout = await readLandingToggleLayout(page);

  expect(
    Math.abs(
      afterToggleLayout.authRowHeight - beforeToggleLayout.authRowHeight,
    ),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(
      afterToggleLayout.waitlistLinkOffset -
        beforeToggleLayout.waitlistLinkOffset,
    ),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(
      afterToggleLayout.contentHeight - beforeToggleLayout.contentHeight,
    ),
  ).toBeLessThanOrEqual(1);
});

test("public landing omits section divider lines", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const landingContent = page.getByTestId("public-landing-content");
  await expect(landingContent.locator(".border-t")).toHaveCount(0);
});

test("public landing stays vertically stable while the page reloads", async ({
  page,
}) => {
  // `/?prod-ui` mirrors the shipped production shell while suppressing the
  // worktree-only password auth surface that would otherwise add a separate
  // preview-only layout shift on local routes.
  const reloadFrames = await captureLandingReloadFrames(page, "/?prod-ui");

  expectStableLandingReloadFrames(reloadFrames);
});

test("public landing keeps the same slogan across reloads", async ({
  page,
}) => {
  // `/?prod-ui` exercises the shipped public landing shell without the local
  // worktree auth affordances changing the route surface under test.
  await page.goto("/?prod-ui", { waitUntil: "networkidle" });

  const slogan = page
    .getByTestId("public-landing-content")
    .getByRole("heading", { level: 2 });
  await expect(slogan).toBeVisible();
  const initialSlogan = (await slogan.textContent())?.trim();

  expect(initialSlogan).toBeTruthy();

  await page.reload({ waitUntil: "networkidle" });
  await expect(slogan).toHaveText(initialSlogan ?? "");
});

test("public landing keeps the auth slot stable on first load", async ({
  page,
}) => {
  const initialFrames = await captureLandingInitialFrames(page);

  expectStableLandingReloadFrames(initialFrames);
});

test("prod-ui landing ignores remembered auth storage during reload", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("noter_was_authenticated", "1");
    window.localStorage.setItem("noter_auth_provider", "google");
  });

  const reloadFrames = await captureLandingReloadFrames(page, "/?prod-ui");

  expectStableLandingReloadFrames(reloadFrames);
  await expect(page.locator("#root")).toHaveAttribute(
    "data-static-public-landing",
    "true",
  );
  await expect(page.getByTestId("public-landing-content")).toBeVisible();
});

test("local landing keeps the remembered password auth slot stable on reload", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("button", { name: "Autofill & sign in" }),
  ).toBeVisible();

  const reloadFrames = await captureLandingReloadFrames(page);

  expectStableLandingReloadFrames(reloadFrames);
});

test("public landing keeps legal links in the bottom bar", async ({
  page,
}, testInfo) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const landingContent = page.getByTestId("public-landing-content");
  const statusBar = page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);

  await expectLegalLinksLeadBuildVersion(statusBar);
  await expectStatusBarBelowMainShell(page, statusBar);
  await expect(
    landingContent.getByRole("link", { name: "/terms" }),
  ).toHaveCount(0);
  await expect(
    landingContent.getByRole("link", { name: "/privacy" }),
  ).toHaveCount(0);

  const statusBarScreenshot = await takeStableScreenshot(statusBar);
  await testInfo.attach("public-landing-status-bar", {
    body: statusBarScreenshot,
    contentType: "image/png",
  });
});

test("mcp consent sign-in keeps legal links in the bottom bar", async ({
  page,
}) => {
  await page.goto(
    "/oauth/mcp/consent?mcp_consent_request=mcpar_test&mcp_login_required=1",
    { waitUntil: "networkidle" },
  );

  const statusBar = page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);

  await expectLegalLinksLeadBuildVersion(statusBar);
  await expectStatusBarBelowMainShell(page, statusBar);
  await expect(statusBar.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(page.getByText("Temporary MCP sign-in note")).toBeVisible();
});

test("build version stays stable on the public landing", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const statusBar = page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);
  const version = statusBar.getByTestId(APP_BUILD_VERSION_TEST_ID);
  const commit = statusBar.getByTestId(APP_BUILD_COMMIT_LINK_TEST_ID);

  await expectAppBuildVersionDisplay(statusBar, version, commit);
  await expectAppBuildCommitLink(commit);
});

test("build version copies as a Markdown link on the public landing", async ({
  page,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/", { waitUntil: "networkidle" });

  const statusBar = page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);
  const version = page.getByTestId(APP_BUILD_VERSION_TEST_ID);
  const commit = page.getByTestId(APP_BUILD_COMMIT_LINK_TEST_ID);
  await expectAppBuildVersionDisplay(statusBar, version, commit);
  const commitText = await commit.textContent();
  const versionHref = await expectAppBuildCommitLink(commit);
  expect(commitText).not.toBeNull();
  await selectText(commit);
  await page.keyboard.press(COPY_SHORTCUT_KEY);
  const clipboardText = await readClipboardText(page);
  expect(clipboardText).toBe(`[${commitText}](${versionHref})`);
});

test("landing footer links keep browser link styling", async ({
  page,
}, testInfo) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const termsLink = page.getByRole("link", {
    name: "/terms",
    exact: true,
  });
  const footer = termsLink.locator("xpath=..");

  await expect(termsLink).toBeVisible();

  const linkPresentation = await readLinkPresentation(termsLink);
  expect(linkPresentation.textDecorationLine).toContain("underline");

  const footerScreenshot = await takeStableScreenshot(footer);

  await testInfo.attach("public-landing-footer-links", {
    body: footerScreenshot,
    contentType: "image/png",
  });
});

test.describe("mobile landing dev toggle", () => {
  test.use(mobileLandingDevice);

  test("landing uses document scroll on mobile instead of an inner scroll shell", async ({
    page,
  }) => {
    await page.goto("/?prod-ui", { waitUntil: "networkidle" });
    await page.setViewportSize({ width: 390, height: 320 });

    const scrollOwnership = await page.evaluate(() => {
      const shell = document.querySelector(
        '[data-testid="public-landing-scroll-shell"]',
      );
      const scrollingElement = document.scrollingElement;

      if (!(shell instanceof HTMLElement)) {
        throw new Error("Expected landing shell");
      }
      if (!(scrollingElement instanceof HTMLElement)) {
        throw new Error("Expected document scrolling element");
      }

      const shellStyle = getComputedStyle(shell);
      return {
        documentCanScroll:
          scrollingElement.scrollHeight > scrollingElement.clientHeight,
        shellCanScroll: shell.scrollHeight > shell.clientHeight,
        shellOverflowY: shellStyle.overflowY,
      };
    });

    expect(scrollOwnership.documentCanScroll).toBe(true);
    expect(scrollOwnership.shellCanScroll).toBe(false);
    expect(scrollOwnership.shellOverflowY).not.toBe("auto");

    const scrollTop = await page.evaluate(() => {
      const shell = document.querySelector(
        '[data-testid="public-landing-scroll-shell"]',
      );
      const scrollingElement = document.scrollingElement;

      if (!(shell instanceof HTMLElement)) {
        throw new Error("Expected landing shell");
      }
      if (!(scrollingElement instanceof HTMLElement)) {
        throw new Error("Expected document scrolling element");
      }

      window.scrollTo(0, 160);
      return {
        documentScrollTop: scrollingElement.scrollTop,
        shellScrollTop: shell.scrollTop,
      };
    });

    expect(scrollTop.documentScrollTop).toBeGreaterThan(0);
    expect(scrollTop.shellScrollTop).toBe(0);
  });

  test("landing dev toggle keeps the landing card stable frame by frame", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const forwardFrames = await captureLandingToggleFrames(page, "/?dev");
    expectStableLandingToggleFrames(forwardFrames, "/?dev");
    await expectLandingToggleFocusTarget(page);
    await expectLandingLogoAutoRotates(
      page.getByTestId(PUBLIC_LANDING_LOGO_SCENE_TEST_ID),
    );

    const backFrames = await captureLandingToggleFrames(page, "/");
    expectStableLandingToggleFrames(backFrames, "/");
    await expectLandingToggleFocusTarget(page);
  });
});

test("landing dev toggle ignores duplicate taps", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await page.evaluate(() => {
    const toggleLink = document.getElementById("public-landing-dev-toggle");
    if (!(toggleLink instanceof HTMLAnchorElement)) {
      return;
    }

    toggleLink.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        button: 0,
      }),
    );
    toggleLink.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        button: 0,
      }),
    );
  });

  await expect(page).toHaveURL(/\/\?dev$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

test("waitlist link stays visible through the dev toggle", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const waitlistLink = page.getByRole("link", {
    name: "https://x.com/noter_md",
    exact: true,
  });
  await expect(waitlistLink).toBeVisible();
  await expect(waitlistLink).toHaveAttribute("href", "https://x.com/noter_md");
  await page.getByRole("link", { name: "/?dev", exact: true }).click();
  await expect(page).toHaveURL(/\/\?dev$/);
  await expect(
    page.getByRole("link", { name: "https://x.com/noter_md", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "https://x.com/noter_md", exact: true }),
  ).toHaveAttribute("href", "https://x.com/noter_md");
});

test("public landing keeps the card height stable while toggling dev mode", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const landingContent = page.getByTestId("public-landing-content");
  await expect(landingContent).toBeVisible();
  await expectLandingLogoReady(page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID));

  const plainLandingHeight = await landingContent.evaluate((element) =>
    Math.round(element.getBoundingClientRect().height),
  );

  await page.getByRole("link", { name: "/?dev", exact: true }).click();
  await expect(page).toHaveURL(/\/\?dev$/);

  const devLandingHeight = await landingContent.evaluate((element) =>
    Math.round(element.getBoundingClientRect().height),
  );

  expect(Math.abs(devLandingHeight - plainLandingHeight)).toBeLessThanOrEqual(
    8,
  );
});

test("prod-ui landing logo stays static after hydration", async ({
  page,
}, testInfo) => {
  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  const landingLogo = page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID);
  const landingLogoStage = page.getByTestId(PUBLIC_LANDING_LOGO_STAGE_TEST_ID);
  await expectLandingLogoReady(landingLogo);

  const initialLogoScreenshot = await takeStableScreenshot(landingLogoStage);

  await expect(page.getByTestId(PUBLIC_LANDING_LOGO_SCENE_TEST_ID)).toHaveCount(
    0,
  );
  await expect(landingLogo).toHaveClass(/opacity-100/);
  await page.waitForTimeout(300);

  const enhancedLogoScreenshot = await takeStableScreenshot(landingLogoStage);

  await expectScreenshotsToMatch({
    actual: enhancedLogoScreenshot,
    artifactPrefix: "public-landing-logo-hydrated-svg",
    expected: initialLogoScreenshot,
    maxDiffPixelRatio: 0,
    testInfo,
  });
});

test("prod-ui landing logo stays static even after interaction", async ({
  page,
}) => {
  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  const landingLogo = page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID);
  const landingLogoStage = page.getByTestId(PUBLIC_LANDING_LOGO_STAGE_TEST_ID);

  await expectLandingLogoReady(landingLogo);
  await expect(page.getByTestId(PUBLIC_LANDING_LOGO_SCENE_TEST_ID)).toHaveCount(
    0,
  );
  await expect(landingLogo).toHaveClass(/opacity-100/);

  const landingLogoStageBounds = await landingLogoStage.boundingBox();
  expect(landingLogoStageBounds).not.toBeNull();
  if (!landingLogoStageBounds) {
    return;
  }

  await page.mouse.move(
    landingLogoStageBounds.x + landingLogoStageBounds.width / 2,
    landingLogoStageBounds.y + landingLogoStageBounds.height / 2,
  );
  await page.mouse.down();

  await page.mouse.up();
  await expect(page.getByTestId(PUBLIC_LANDING_LOGO_SCENE_TEST_ID)).toHaveCount(
    0,
  );
  await expect(landingLogo).toHaveClass(/opacity-100/);
});

test("prod-ui landing logo keeps the SVG fallback when WebGL is unavailable", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error);
  });

  await page.addInitScript(() => {
    const originalGetContextDescriptor = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "getContext",
    );
    const originalGetContext = originalGetContextDescriptor?.value;
    if (typeof originalGetContext !== "function") {
      return;
    }

    HTMLCanvasElement.prototype.getContext = function (contextId, ...args) {
      if (
        contextId === "webgl" ||
        contextId === "webgl2" ||
        contextId === "experimental-webgl"
      ) {
        return null;
      }

      return Reflect.apply(originalGetContext, this, [contextId, ...args]);
    };
  });

  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  await expectLandingLogoReady(page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID));
  await expect(page.getByTestId(PUBLIC_LANDING_LOGO_SCENE_TEST_ID)).toHaveCount(
    0,
  );
  await page.waitForTimeout(200);
  expect(pageErrors).toEqual([]);
});

test("public landing still renders when localStorage access is denied", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error);
  });

  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Access denied", "SecurityError");
      },
    });
  });

  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.getByTestId("public-landing-content")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("public landing stays within the navigation budget", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });

  const navigationTiming = await readNavigationTiming(page);

  expect(navigationTiming).not.toBeNull();
  expect(navigationTiming?.responseEndMs ?? Infinity).toBeLessThan(
    NAVIGATION_BUDGET_MS.responseEnd,
  );
  expect(navigationTiming?.domContentLoadedMs ?? Infinity).toBeLessThan(
    NAVIGATION_BUDGET_MS.domContentLoaded,
  );
  expect(navigationTiming?.loadMs ?? Infinity).toBeLessThan(
    NAVIGATION_BUDGET_MS.load,
  );
});

test("prod-ui mode hides developer password auth controls", async ({
  page,
}) => {
  await page.goto("/?prod-ui", { waitUntil: "networkidle" });

  await expect(
    page.getByRole("button", { name: "Google", includeHidden: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Google", includeHidden: true }),
  ).toBeDisabled();

  await expect(
    page.getByRole("link", { name: "https://x.com/noter_md", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Password auth (dev)")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Autofill & sign in" }),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder("you@example.com")).toHaveCount(0);
});

test("prod-ui mode overrides the landing dev editor", async ({ page }) => {
  await page.goto("/?prod-ui&dev", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("button", { name: "Google" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "https://x.com/noter_md", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Password auth (dev)")).toHaveCount(0);
  await expect(
    page.locator(
      '[data-testid="public-landing-copy"] [contenteditable="true"]',
    ),
  ).toHaveCount(0);
});

test("landing dev toggle preserves unrelated query params", async ({
  page,
}) => {
  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  const shellToggleLink = page.getByRole("link", { name: "/?dev" });
  await expect(shellToggleLink).toHaveAttribute("href", "/?prod-ui&dev");

  await shellToggleLink.click();
  await expect(page).toHaveURL(/\/\?prod-ui&dev$/);

  const appToggleLink = page.getByRole("link", { name: "/", exact: true });
  await expect(appToggleLink).toHaveAttribute("href", "/?prod-ui");
});

test("landing dev edits stay visible after toggling back to the plain landing view", async ({
  page,
}) => {
  const headingMarker = "codex-marker";

  await page.goto("/?dev", { waitUntil: "domcontentloaded" });

  await insertLandingHeadingMarker(page, headingMarker);

  const appToggleLink = page.getByRole("link", { name: "/", exact: true });
  await expect(appToggleLink).toBeVisible();
  await appToggleLink.click();

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.locator(
      '[data-testid="public-landing-copy"] [contenteditable="true"]',
    ),
  ).toHaveCount(0);
  await expect(page.getByRole("heading")).toContainText(headingMarker);
});
