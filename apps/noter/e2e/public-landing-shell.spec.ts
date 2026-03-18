import { expect, test } from "@playwright/test";

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
  await expect(page.getByPlaceholder("email@example.com")).toHaveCount(0, {
    timeout: 200,
  });
  await expect(page.getByPlaceholder("email@example.com")).toBeVisible();
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

test("public landing shell still renders when localStorage access is denied", async ({
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

    const originalSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (handler, timeout, ...args) => {
      if (timeout === 150) {
        return 0;
      }
      return originalSetTimeout(handler, timeout, ...args);
    };
  });

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
  expect(navigationTiming?.responseEndMs ?? Infinity).toBeLessThan(100);
  expect(navigationTiming?.domContentLoadedMs ?? Infinity).toBeLessThan(250);
  expect(navigationTiming?.loadMs ?? Infinity).toBeLessThan(300);
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
