import { devices, expect, test, type Locator } from "@playwright/test";
import {
  APP_BUILD_COMMIT_LINK_TEST_ID,
  APP_BUILD_STATUS_BAR_TEST_ID,
  APP_BUILD_VERSION_TEST_ID,
} from "../src/lib/appBuild";
import { FAST_LANDING_APP_BOOT_DELAY_MS } from "../src/lib/fastLandingBoot";
import {
  PUBLIC_LANDING_SCROLL_SHELL_TEST_ID,
  PUBLIC_LANDING_SHELL_MAIN_TEST_ID,
} from "../src/lib/publicLanding";
import {
  PUBLIC_LANDING_LOGO_SCENE_TEST_ID,
  PUBLIC_LANDING_LOGO_STAGE_TEST_ID,
  PUBLIC_LANDING_LOGO_TEST_ID,
} from "../src/lib/publicLandingLogo";
import { expectScreenshotsToMatch, takeStableScreenshot } from "./visualDiff";

// These budgets target the local production preview used in CI.
// Keep them loose enough to absorb runner variance while still catching
// obvious regressions in the fast landing path.
const NAVIGATION_BUDGET_MS = {
  responseEnd: 150,
  domContentLoaded: 400,
  load: 500,
} as const;
const COPY_SHORTCUT_KEY =
  process.platform === "darwin" ? "Meta+C" : "Control+C";

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
  waitlistInputTop: number;
  waitlistInputOffset: number;
};

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
    const waitlistInput = document.querySelector(
      'input[placeholder="email@example.com"]',
    );
    const googleButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Google") ?? false,
    );

    if (!(content instanceof HTMLElement)) {
      throw new Error("Expected landing content element");
    }
    if (!(waitlistInput instanceof HTMLElement)) {
      throw new Error("Expected landing waitlist input element");
    }
    if (!(googleButton instanceof HTMLElement)) {
      throw new Error("Expected landing Google button element");
    }

    const contentRect = content.getBoundingClientRect();
    const waitlistInputRect = waitlistInput.getBoundingClientRect();
    const googleRect = googleButton.getBoundingClientRect();

    return {
      contentTop: Number(contentRect.top.toFixed(3)),
      contentHeight: Number(contentRect.height.toFixed(3)),
      authRowHeight: Number(googleRect.height.toFixed(3)),
      waitlistInputTop: Number(waitlistInputRect.top.toFixed(3)),
      waitlistInputOffset: Number(
        (waitlistInputRect.top - contentRect.top).toFixed(3),
      ),
    };
  });
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

/**
 * The target route should stop jittering once at least 10 target-path frames
 * have been captured, and those settled frames should stay on-screen.
 */
function expectSettledLandingToggleFrames(
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

  const lastStableWindow = expectedPathTopValues.slice(-10);
  expect(
    Math.max(...lastStableWindow) - Math.min(...lastStableWindow),
  ).toBeLessThanOrEqual(1);
  expect(Math.min(...expectedPathTopValues)).toBeGreaterThanOrEqual(0);
  expect(Math.max(...expectedPathTopValues)).toBeLessThanOrEqual(96);
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
          : activeElement?.tagName.toLowerCase() ?? null;
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

async function readLandingLogoSceneView(scene: Locator) {
  const elevationDegrees = await scene.getAttribute("data-elevation-degrees");
  const rotationDegrees = await scene.getAttribute("data-rotation-degrees");

  return {
    elevationDegrees,
    rotationDegrees,
  };
}

test("public landing shell renders before the full app UI takes over", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("public-landing-shell")).toBeVisible();
  await expectLandingLogoReady(page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID));
  await expect(
    page.getByTestId("public-landing-waitlist-placeholder"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Google", includeHidden: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Google", includeHidden: true }),
  ).toBeDisabled();
  await expect(page.getByPlaceholder("email@example.com")).toBeVisible();
  await expect(page.getByPlaceholder("email@example.com")).toBeEditable();
  await expect(
    page.getByRole("button", { name: "Join Waitlist" }),
  ).toBeEnabled();
  await expect(page.getByTestId("public-landing-shell")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Google", includeHidden: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Google", includeHidden: true }),
  ).toBeDisabled();
});

test("landing dev mode shows Google sign-in", async ({ page }) => {
  await page.goto("/?dev", { waitUntil: "networkidle" });

  await expect(page.getByTestId("public-landing-shell")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Google" })).toBeVisible();
});

test("pre-hydration landing dev toggle keeps the waitlist row aligned", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("public-landing-shell").waitFor({ state: "visible" });

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
      afterToggleLayout.waitlistInputOffset -
        beforeToggleLayout.waitlistInputOffset,
    ),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(
      afterToggleLayout.contentHeight - beforeToggleLayout.contentHeight,
    ),
  ).toBeLessThanOrEqual(1);
});

test("public landing omits section divider lines before and after handoff", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const landingContent = page.getByTestId("public-landing-content");

  await expect(page.getByTestId("public-landing-shell")).toBeVisible();
  await expect(landingContent.locator(".border-t")).toHaveCount(0);

  await expect(page.getByTestId("public-landing-shell")).toHaveCount(0);
  await expect(landingContent.locator(".border-t")).toHaveCount(0);
});

test("public landing keeps legal links in the top bar across the shell handoff", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const landingContent = page.getByTestId("public-landing-content");
  const shellStatusBar = page
    .getByTestId("public-landing-shell")
    .getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);

  await expectLegalLinksLeadBuildVersion(shellStatusBar);
  await expect(
    landingContent.getByRole("link", { name: "/terms" }),
  ).toHaveCount(0);
  await expect(
    landingContent.getByRole("link", { name: "/privacy" }),
  ).toHaveCount(0);

  await expect(page.getByTestId("public-landing-shell")).toHaveCount(0);

  const hydratedStatusBar = page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);
  await expectLegalLinksLeadBuildVersion(hydratedStatusBar);
  await expect(
    landingContent.getByRole("link", { name: "/terms" }),
  ).toHaveCount(0);
  await expect(
    landingContent.getByRole("link", { name: "/privacy" }),
  ).toHaveCount(0);
});

test("mcp consent sign-in keeps legal links in the top bar", async ({
  page,
}) => {
  await page.goto(
    "/oauth/mcp/consent?mcp_consent_request=mcpar_test&mcp_login_required=1",
    { waitUntil: "networkidle" },
  );

  const statusBar = page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);

  await expectLegalLinksLeadBuildVersion(statusBar);
  await expect(statusBar.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(page.getByText("Temporary MCP sign-in note")).toBeVisible();
});

test("build version stays stable across the landing shell handoff", async ({
  page,
}, testInfo) => {
  await page.addInitScript((bootDelayMs) => {
    const originalSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (handler, timeout, ...args) => {
      if (timeout === bootDelayMs) {
        return originalSetTimeout(handler, 600, ...args);
      }
      return originalSetTimeout(handler, timeout, ...args);
    };
  }, FAST_LANDING_APP_BOOT_DELAY_MS);

  await page.goto("/", { waitUntil: "domcontentloaded" });

  const shellStatusBar = page
    .getByTestId("public-landing-shell")
    .getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);
  const shellVersion = shellStatusBar.getByTestId(APP_BUILD_VERSION_TEST_ID);
  const shellCommit = shellStatusBar.getByTestId(APP_BUILD_COMMIT_LINK_TEST_ID);

  await expect(page.getByTestId("public-landing-shell")).toBeVisible();
  await expectAppBuildVersionDisplay(shellStatusBar, shellVersion, shellCommit);
  const shellVersionText = await shellVersion.textContent();
  const shellCommitText = await shellCommit.textContent();
  const shellVersionHref = await expectAppBuildCommitLink(shellCommit);
  expect(shellVersionText).not.toBeNull();
  expect(shellCommitText).not.toBeNull();

  const shellScreenshot = await takeStableScreenshot(shellStatusBar);

  await expect(page.getByTestId("public-landing-shell")).toHaveCount(0);

  const hydratedStatusBar = page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);
  const hydratedVersion = hydratedStatusBar.getByTestId(
    APP_BUILD_VERSION_TEST_ID,
  );
  const hydratedCommit = hydratedStatusBar.getByTestId(
    APP_BUILD_COMMIT_LINK_TEST_ID,
  );

  await expectAppBuildVersionDisplay(
    hydratedStatusBar,
    hydratedVersion,
    hydratedCommit,
  );
  await expect(hydratedVersion).toHaveText(shellVersionText ?? "");
  await expect(hydratedCommit).toHaveText(shellCommitText ?? "");
  await expect(hydratedCommit).toHaveAttribute("href", shellVersionHref ?? "");

  const hydratedScreenshot = await takeStableScreenshot(hydratedStatusBar);

  await expectScreenshotsToMatch({
    actual: hydratedScreenshot,
    artifactPrefix: "public-landing-build-version-handoff",
    expected: shellScreenshot,
    maxDiffPixelRatio: 0.005,
    testInfo,
  });
});

test("build version copies as a Markdown link across the shell handoff", async ({
  page,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript((bootDelayMs) => {
    const originalSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (handler, timeout, ...args) => {
      if (timeout === bootDelayMs) {
        return originalSetTimeout(handler, 600, ...args);
      }
      return originalSetTimeout(handler, timeout, ...args);
    };
  }, FAST_LANDING_APP_BOOT_DELAY_MS);

  await page.goto("/", { waitUntil: "domcontentloaded" });

  const shellVersion = page
    .getByTestId("public-landing-shell")
    .getByTestId(APP_BUILD_VERSION_TEST_ID);
  const shellCommit = page
    .getByTestId("public-landing-shell")
    .getByTestId(APP_BUILD_COMMIT_LINK_TEST_ID);
  const shellStatusBar = page
    .getByTestId("public-landing-shell")
    .getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);
  await expect(page.getByTestId("public-landing-shell")).toBeVisible();
  await expectAppBuildVersionDisplay(shellStatusBar, shellVersion, shellCommit);
  const shellCommitText = await shellCommit.textContent();
  const shellVersionHref = await expectAppBuildCommitLink(shellCommit);
  expect(shellCommitText).not.toBeNull();
  await selectText(shellCommit);
  await page.keyboard.press(COPY_SHORTCUT_KEY);
  const shellClipboardText = await readClipboardText(page);
  expect(shellClipboardText).toBe(`[${shellCommitText}](${shellVersionHref})`);

  await expect(page.getByTestId("public-landing-shell")).toHaveCount(0);

  const hydratedStatusBar = page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);
  const hydratedVersion = page.getByTestId(APP_BUILD_VERSION_TEST_ID);
  const hydratedCommit = page.getByTestId(APP_BUILD_COMMIT_LINK_TEST_ID);
  await expectAppBuildVersionDisplay(
    hydratedStatusBar,
    hydratedVersion,
    hydratedCommit,
  );
  await selectText(hydratedCommit);
  await page.keyboard.press(COPY_SHORTCUT_KEY);
  const hydratedClipboardText = await readClipboardText(page);

  expect(hydratedClipboardText).toBe(
    `[${shellCommitText}](${shellVersionHref})`,
  );
});

test("landing footer links keep browser link styling across the shell handoff", async ({
  page,
}, testInfo) => {
  await page.addInitScript((bootDelayMs) => {
    const originalSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (handler, timeout, ...args) => {
      if (timeout === bootDelayMs) {
        return originalSetTimeout(handler, 600, ...args);
      }
      return originalSetTimeout(handler, timeout, ...args);
    };
  }, FAST_LANDING_APP_BOOT_DELAY_MS);

  await page.goto("/", { waitUntil: "domcontentloaded" });

  const shellRoot = page.getByTestId("public-landing-shell");
  const shellTermsLink = shellRoot.getByRole("link", {
    name: "/terms",
    exact: true,
  });
  const shellFooter = shellTermsLink.locator("xpath=..");

  await expect(shellRoot).toBeVisible();
  await expect(shellTermsLink).toBeVisible();

  const shellLinkPresentation = await readLinkPresentation(shellTermsLink);
  expect(shellLinkPresentation.textDecorationLine).toContain("underline");

  const shellScreenshot = await takeStableScreenshot(shellFooter);

  await expect(shellRoot).toHaveCount(0);

  const hydratedTermsLink = page.getByRole("link", {
    name: "/terms",
    exact: true,
  });
  const hydratedFooter = hydratedTermsLink.locator("xpath=..");

  await expect(hydratedTermsLink).toBeVisible();

  const hydratedLinkPresentation =
    await readLinkPresentation(hydratedTermsLink);
  expect(hydratedLinkPresentation.textDecorationLine).toContain("underline");
  expect(hydratedLinkPresentation).toEqual(shellLinkPresentation);

  const hydratedScreenshot = await takeStableScreenshot(hydratedFooter);

  await testInfo.attach("public-landing-footer-links-shell", {
    body: shellScreenshot,
    contentType: "image/png",
  });
  await testInfo.attach("public-landing-footer-links-hydrated", {
    body: hydratedScreenshot,
    contentType: "image/png",
  });
});

test("landing preserves scroll position across the shell handoff", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 320 });
  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  const shellMain = page.getByTestId(PUBLIC_LANDING_SHELL_MAIN_TEST_ID);
  await shellMain.waitFor({ state: "visible" });

  const shellScrollTop = await shellMain.evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      throw new Error("Expected pre-hydration landing scroll container");
    }

    element.scrollTop = 160;
    return element.scrollTop;
  });
  expect(shellScrollTop).toBeGreaterThan(0);

  await page.getByTestId("public-landing-shell").waitFor({
    state: "detached",
    timeout: 10_000,
  });

  const hydratedScrollShell = page.getByTestId(
    PUBLIC_LANDING_SCROLL_SHELL_TEST_ID,
  );
  await expect(hydratedScrollShell).toBeVisible();
  await expect
    .poll(() =>
      hydratedScrollShell.evaluate((element) => {
        if (!(element instanceof HTMLElement)) {
          throw new Error("Expected hydrated landing scroll shell");
        }

        return element.scrollTop;
      }),
    )
    .toBe(shellScrollTop);
});

test.describe("mobile landing dev toggle", () => {
  test.use(mobileLandingDevice);

  test("pre-hydration landing dev toggle keeps the landing card stable frame by frame", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .getByTestId("public-landing-shell")
      .waitFor({ state: "visible" });

    const shellFrames = await captureLandingToggleFrames(page, "/?dev");
    expectSettledLandingToggleFrames(shellFrames, "/?dev");
    await expectLandingToggleFocusTarget(page);
    await expectLandingLogoAutoRotates(
      page.getByTestId(PUBLIC_LANDING_LOGO_SCENE_TEST_ID),
    );
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

test("pre-hydration landing dev toggle ignores duplicate taps", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("public-landing-shell").waitFor({ state: "visible" });

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

test("shell waitlist input preserves typed email through handoff", async ({
  page,
}) => {
  await page.addInitScript((bootDelayMs) => {
    const originalSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (handler, timeout, ...args) => {
      if (timeout === bootDelayMs) {
        return originalSetTimeout(handler, 600, ...args);
      }
      return originalSetTimeout(handler, timeout, ...args);
    };
  }, FAST_LANDING_APP_BOOT_DELAY_MS);

  await page.goto("/", { waitUntil: "domcontentloaded" });

  const waitlistInput = page.getByPlaceholder("email@example.com");
  await expect(page.getByTestId("public-landing-shell")).toBeVisible();
  await waitlistInput.fill("shell@example.com");
  await expect(page.getByTestId("public-landing-shell")).toHaveCount(0);
  await expect(page.getByPlaceholder("email@example.com")).toBeEditable();
  await expect(page.getByPlaceholder("email@example.com")).toHaveValue(
    "shell@example.com",
  );
});

test("shell waitlist focus survives the scheduled handoff", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const waitlistInput = page.getByPlaceholder("email@example.com");
  await expect(page.getByTestId("public-landing-shell")).toBeVisible();
  await waitlistInput.click();
  await expect(page.getByTestId("public-landing-shell")).toHaveCount(0);
  await expect(page.getByPlaceholder("email@example.com")).toBeFocused();
});

test("shell waitlist blur clears pending focus restore intent", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const waitlistInput = page.getByPlaceholder("email@example.com");
  const waitlistButton = page.getByRole("button", { name: "Join Waitlist" });

  await expect(page.getByTestId("public-landing-shell")).toBeVisible();
  await waitlistInput.click();
  await waitlistButton.click();
  await expect(page.getByTestId("public-landing-shell")).toHaveCount(0);
  await expect(page.getByPlaceholder("email@example.com")).not.toBeFocused();
});

test("public landing handoff keeps the card height stable", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const landingContent = page.getByTestId("public-landing-content");
  await expect(landingContent).toBeVisible();
  await expectLandingLogoReady(page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID));

  const shellHeight = await landingContent.evaluate((element) =>
    Math.round(element.getBoundingClientRect().height),
  );

  await expect(
    page.getByTestId("public-landing-waitlist-placeholder"),
  ).toBeVisible();
  await expect(page.getByPlaceholder("email@example.com")).toBeVisible();

  const fullAppHeight = await landingContent.evaluate((element) =>
    Math.round(element.getBoundingClientRect().height),
  );

  expect(Math.abs(fullAppHeight - shellHeight)).toBeLessThanOrEqual(8);
});

test("prod-ui landing handoff stays visually aligned", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });

  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  const landingContent = page.getByTestId("public-landing-content");
  await expect(page.getByTestId("public-landing-shell")).toBeVisible();
  await expect(landingContent).toBeVisible();
  await expectLandingLogoReady(page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID));

  const shellScreenshot = await takeStableScreenshot(landingContent);

  await expect(page.getByTestId("public-landing-shell")).toHaveCount(0);
  const hydratedScreenshot = await takeStableScreenshot(landingContent);

  await expectScreenshotsToMatch({
    actual: hydratedScreenshot,
    artifactPrefix: "public-landing-prod-ui-handoff",
    expected: shellScreenshot,
    maxDiffPixelRatio: 0.005,
    testInfo,
  });
});

test("prod-ui landing logo enhancement stays visually aligned", async ({
  page,
}, testInfo) => {
  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  const landingLogo = page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID);
  const landingLogoStage = page.getByTestId(PUBLIC_LANDING_LOGO_STAGE_TEST_ID);
  await expectLandingLogoReady(landingLogo);

  const initialLogoScreenshot = await takeStableScreenshot(landingLogoStage);

  await expectLandingLogoSceneReady(
    page.getByTestId(PUBLIC_LANDING_LOGO_SCENE_TEST_ID),
  );

  const enhancedLogoScreenshot = await takeStableScreenshot(landingLogoStage);

  await expectScreenshotsToMatch({
    actual: enhancedLogoScreenshot,
    artifactPrefix: "public-landing-logo-enhancement",
    expected: initialLogoScreenshot,
    maxDiffPixelRatio: 0.015,
    testInfo,
  });
});

test("prod-ui landing logo becomes draggable after the SVG fallback is removed", async ({
  page,
}) => {
  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  const landingLogo = page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID);
  const landingLogoScene = page.getByTestId(PUBLIC_LANDING_LOGO_SCENE_TEST_ID);
  const landingLogoCanvas = landingLogoScene.locator("canvas");

  await expectLandingLogoReady(landingLogo);
  await expectLandingLogoSceneReady(landingLogoScene);
  await expect(landingLogo).toHaveClass(/pointer-events-none opacity-0/);
  await expect(landingLogoScene).toHaveClass(/pointer-events-auto touch-none/);

  await expect
    .poll(async () =>
      landingLogoScene.evaluate((element) => {
        const sceneRoot = element.firstElementChild;
        if (!(sceneRoot instanceof HTMLElement)) {
          return null;
        }

        return window.getComputedStyle(sceneRoot).cursor;
      }),
    )
    .toBe("grab");

  const viewBeforeDrag = await readLandingLogoSceneView(landingLogoScene);
  expect(viewBeforeDrag).toEqual({
    elevationDegrees: "35.264",
    rotationDegrees: "45.000",
  });

  const canvasBounds = await landingLogoCanvas.boundingBox();
  expect(canvasBounds).not.toBeNull();
  if (!canvasBounds) {
    return;
  }

  await page.mouse.move(
    canvasBounds.x + canvasBounds.width / 2,
    canvasBounds.y + canvasBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    canvasBounds.x + canvasBounds.width / 2 + 48,
    canvasBounds.y + canvasBounds.height / 2 + 16,
    { steps: 8 },
  );
  await page.mouse.up();

  await expect
    .poll(async () => readLandingLogoSceneView(landingLogoScene))
    .not.toEqual(viewBeforeDrag);
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

test("public landing shell still renders when localStorage access is denied", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error);
  });

  await page.addInitScript((bootDelayMs) => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Access denied", "SecurityError");
      },
    });

    const originalSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (handler, timeout, ...args) => {
      if (timeout === bootDelayMs) {
        return 0;
      }
      return originalSetTimeout(handler, timeout, ...args);
    };
  }, FAST_LANDING_APP_BOOT_DELAY_MS);

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("public-landing-shell")).toBeVisible();
  await page.waitForTimeout(200);
  expect(pageErrors).toEqual([]);
});

test("public landing shell stays within the fast navigation budget", async ({
  page,
}) => {
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

  await expect(page.getByPlaceholder("email@example.com")).toBeVisible();
  await expect(page.getByText("Password auth (dev)")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Autofill & sign in" }),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder("you@example.com")).toHaveCount(0);
});

test("prod-ui mode overrides the landing dev editor", async ({ page }) => {
  await page.goto("/?prod-ui&dev", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("button", { name: "Google" })).toBeVisible();
  await expect(page.getByPlaceholder("email@example.com")).toBeVisible();
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
