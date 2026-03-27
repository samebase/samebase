import { devices, expect, test, type Locator } from "@playwright/test";
import { FAST_LANDING_APP_BOOT_DELAY_MS } from "../src/lib/fastLandingBoot";
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

const {
  defaultBrowserType: _mobileLandingDefaultBrowserType,
  ...mobileLandingDevice
} = devices["iPhone 13"];
const PUBLIC_LANDING_INTAKE_TEST_ID = "public-landing-intake-placeholder";
const PUBLIC_LANDING_INTAKE_MESSAGE_LABEL = "Message";
const PUBLIC_LANDING_INTAKE_EMAIL_PLACEHOLDER = "e.g. name@team.com (optional)";
const PUBLIC_LANDING_INTAKE_BUTTON_LABEL = "Send";

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

  const topValues = frames
    .map((frame) => frame.top)
    .filter((value): value is number => value !== null);
  expect(topValues.length).toBeGreaterThan(0);
  expect(Math.max(...topValues) - Math.min(...topValues)).toBeLessThanOrEqual(
    1,
  );
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
  await expect(page.getByTestId(PUBLIC_LANDING_INTAKE_TEST_ID)).toBeVisible();
  await expect(page.getByRole("button", { name: "Google" })).toBeVisible();
  await expect(
    page.getByLabel(PUBLIC_LANDING_INTAKE_MESSAGE_LABEL),
  ).toBeVisible();
  await expect(
    page.getByLabel(PUBLIC_LANDING_INTAKE_MESSAGE_LABEL),
  ).toBeEditable();
  await expect(
    page.getByPlaceholder(PUBLIC_LANDING_INTAKE_EMAIL_PLACEHOLDER),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: PUBLIC_LANDING_INTAKE_BUTTON_LABEL }),
  ).toBeEnabled();
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
    expectStableLandingToggleFrames(shellFrames, "/?dev");
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

test("shell landing note preserves typed message through handoff", async ({
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

  const messageField = page.getByLabel(PUBLIC_LANDING_INTAKE_MESSAGE_LABEL);
  await expect(page.getByTestId("public-landing-shell")).toBeVisible();
  await messageField.fill("A publishing-aware repo notes surface.");
  await expect(page.getByTestId("public-landing-shell")).toHaveCount(0);
  await expect(
    page.getByLabel(PUBLIC_LANDING_INTAKE_MESSAGE_LABEL),
  ).toBeEditable();
  await expect(
    page.getByLabel(PUBLIC_LANDING_INTAKE_MESSAGE_LABEL),
  ).toHaveValue("A publishing-aware repo notes surface.");
});

test("shell landing note preserves typed optional email through handoff", async ({
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

  const emailField = page.getByPlaceholder(
    PUBLIC_LANDING_INTAKE_EMAIL_PLACEHOLDER,
  );
  await expect(page.getByTestId("public-landing-shell")).toBeVisible();
  await emailField.fill("shell@example.com");
  await expect(page.getByTestId("public-landing-shell")).toHaveCount(0);
  await expect(
    page.getByPlaceholder(PUBLIC_LANDING_INTAKE_EMAIL_PLACEHOLDER),
  ).toBeEditable();
  await expect(
    page.getByPlaceholder(PUBLIC_LANDING_INTAKE_EMAIL_PLACEHOLDER),
  ).toHaveValue("shell@example.com");
});

test("shell landing note message focus survives the scheduled handoff", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const messageField = page.getByLabel(PUBLIC_LANDING_INTAKE_MESSAGE_LABEL);
  await expect(page.getByTestId("public-landing-shell")).toBeVisible();
  await messageField.click();
  await expect(page.getByTestId("public-landing-shell")).toHaveCount(0);
  await expect(
    page.getByLabel(PUBLIC_LANDING_INTAKE_MESSAGE_LABEL),
  ).toBeFocused();
});

test("shell landing note email focus survives the scheduled handoff", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const emailField = page.getByPlaceholder(
    PUBLIC_LANDING_INTAKE_EMAIL_PLACEHOLDER,
  );
  await expect(page.getByTestId("public-landing-shell")).toBeVisible();
  await emailField.click();
  await expect(page.getByTestId("public-landing-shell")).toHaveCount(0);
  await expect(
    page.getByPlaceholder(PUBLIC_LANDING_INTAKE_EMAIL_PLACEHOLDER),
  ).toBeFocused();
});

test("shell landing note blur clears pending focus restore intent", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const messageField = page.getByLabel(PUBLIC_LANDING_INTAKE_MESSAGE_LABEL);
  const submitButton = page.getByRole("button", {
    name: PUBLIC_LANDING_INTAKE_BUTTON_LABEL,
  });

  await expect(page.getByTestId("public-landing-shell")).toBeVisible();
  await messageField.click();
  await submitButton.click();
  await expect(page.getByTestId("public-landing-shell")).toHaveCount(0);
  await expect(
    page.getByLabel(PUBLIC_LANDING_INTAKE_MESSAGE_LABEL),
  ).not.toBeFocused();
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

  await expect(page.getByTestId(PUBLIC_LANDING_INTAKE_TEST_ID)).toBeVisible();
  await expect(
    page.getByLabel(PUBLIC_LANDING_INTAKE_MESSAGE_LABEL),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder(PUBLIC_LANDING_INTAKE_EMAIL_PLACEHOLDER),
  ).toBeVisible();

  const fullAppHeight = await landingContent.evaluate((element) =>
    Math.round(element.getBoundingClientRect().height),
  );

  expect(Math.abs(fullAppHeight - shellHeight)).toBeLessThanOrEqual(8);
});

test("prod-ui landing handoff stays visually aligned", async ({
  page,
}, testInfo) => {
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
  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("public-landing-shell")).toBeVisible();
  await expect(page.getByRole("button", { name: "Google" })).toBeVisible();

  await expect(
    page.getByLabel(PUBLIC_LANDING_INTAKE_MESSAGE_LABEL),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder(PUBLIC_LANDING_INTAKE_EMAIL_PLACEHOLDER),
  ).toBeVisible();
  await expect(page.getByText("Password auth (dev)")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Autofill & sign in" }),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder("you@example.com")).toHaveCount(0);
});

test("prod-ui mode overrides the landing dev editor", async ({ page }) => {
  await page.goto("/?prod-ui&dev", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByLabel(PUBLIC_LANDING_INTAKE_MESSAGE_LABEL),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder(PUBLIC_LANDING_INTAKE_EMAIL_PLACEHOLDER),
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
