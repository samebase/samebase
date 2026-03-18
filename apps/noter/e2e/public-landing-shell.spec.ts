import { expect, test } from "@playwright/test";
import { FAST_LANDING_APP_BOOT_DELAY_MS } from "../src/lib/fastLandingBoot";
import { expectScreenshotsToMatch, takeStableScreenshot } from "./visualDiff";

// These budgets target the local production preview used in CI.
// Keep them loose enough to absorb runner variance while still catching
// obvious regressions in the fast landing path.
const NAVIGATION_BUDGET_MS = {
  responseEnd: 150,
  domContentLoaded: 400,
  load: 500,
} as const;

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

test("public landing shell renders before the full app UI takes over", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("public-landing-shell")).toBeVisible();
  await expect(
    page.getByTestId("public-landing-waitlist-placeholder"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Google" })).toBeVisible();
  await expect(page.getByPlaceholder("email@example.com")).toBeVisible();
  await expect(page.getByPlaceholder("email@example.com")).toBeEditable();
  await expect(
    page.getByRole("button", { name: "Join Waitlist" }),
  ).toBeEnabled();
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

test("public landing handoff keeps the card height stable", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const landingContent = page.getByTestId("public-landing-content");
  await expect(landingContent).toBeVisible();

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
  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  const landingContent = page.getByTestId("public-landing-content");
  await expect(page.getByTestId("public-landing-shell")).toBeVisible();
  await expect(landingContent).toBeVisible();

  const shellScreenshot = await takeStableScreenshot(landingContent);

  await expect(page.getByPlaceholder("email@example.com")).toBeEditable();
  const hydratedScreenshot = await takeStableScreenshot(landingContent);

  await expectScreenshotsToMatch({
    actual: hydratedScreenshot,
    artifactPrefix: "public-landing-prod-ui-handoff",
    expected: shellScreenshot,
    maxDiffPixelRatio: 0.01,
    testInfo,
  });
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

  await expect(page.getByPlaceholder("email@example.com")).toBeVisible();
  await expect(page.getByText("Password auth (dev)")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Autofill & sign in" }),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder("you@example.com")).toHaveCount(0);
});

test("prod-ui mode overrides the landing dev editor", async ({ page }) => {
  await page.goto("/?prod-ui&dev", { waitUntil: "domcontentloaded" });

  await expect(page.getByPlaceholder("email@example.com")).toBeVisible();
  await expect(page.getByText("Password auth (dev)")).toHaveCount(0);
  await expect(page.locator(".cm-editor")).toHaveCount(0);
});

test("landing dev toggle preserves unrelated query params", async ({
  page,
}) => {
  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  const shellToggleLink = page.getByRole("link", { name: "/?dev" });
  await expect(shellToggleLink).toHaveAttribute("href", "/?prod-ui&dev");

  await shellToggleLink.click();
  await expect(page).toHaveURL(/\/\?prod-ui&dev$/);

  const appToggleLink = page.getByRole("link", { name: "/" });
  await expect(appToggleLink).toHaveAttribute("href", "/?prod-ui");
});
