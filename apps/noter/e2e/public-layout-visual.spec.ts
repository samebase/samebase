import { expect, test } from "@playwright/test";

const publicLayoutSnapshotSuffix = process.platform;
const selectAllShortcut =
  process.platform === "darwin" ? "Meta+A" : "Control+A";

test("public landing route uses the right sidebar shell", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.57;
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page).toHaveScreenshot(
    `public-layout-landing-${publicLayoutSnapshotSuffix}.png`,
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});

test("public landing dev rail exposes the route URL display", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0.57;
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?dev", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const routeUrlDisplay = page.getByTestId("route-url-display");
  await expect(routeUrlDisplay).toHaveText("/?dev");
  await expect(routeUrlDisplay).toHaveAttribute("title", "/?dev");
  await expect(page).toHaveScreenshot(
    `public-layout-landing-dev-${publicLayoutSnapshotSuffix}.png`,
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );

  await page.getByRole("link", { name: "/terms", exact: true }).click();
  await expect(page).toHaveURL(/\/terms\?dev$/);
  await expect(page.getByTestId("route-url-display")).toHaveText("/terms?dev");
  await expect(page.getByTestId("route-url-display")).toHaveAttribute(
    "title",
    "/terms?dev",
  );
});

test("public route URL display clamps long URLs to two lines", async ({
  page,
}) => {
  const longPath =
    "/?dev&route=codex-find-main-header-url-research&state=abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";

  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(longPath, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const routeUrlDisplay = page.getByTestId("route-url-display");
  await expect(routeUrlDisplay).toHaveText(longPath);
  await expect(routeUrlDisplay).toHaveAttribute("title", longPath);

  const metrics = await routeUrlDisplay.evaluate((element) => {
    const styles = window.getComputedStyle(element);

    return {
      height: element.getBoundingClientRect().height,
      lineClamp: styles.getPropertyValue("-webkit-line-clamp"),
      lineHeight: Number.parseFloat(styles.lineHeight),
      overflow: styles.overflow,
    };
  });

  expect(metrics.lineClamp).toBe("2");
  expect(metrics.overflow).toBe("hidden");
  expect(metrics.height).toBeLessThanOrEqual(metrics.lineHeight * 2 + 1);
});

test("public landing ProseMark copy survives full selection deletion", async ({
  page,
}) => {
  const errorMessages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errorMessages.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errorMessages.push(error.message);
  });

  await page.goto("/?dev", {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("public-landing-copy").getByRole("textbox").click();
  await page.keyboard.press(selectAllShortcut);
  await page.keyboard.press("Backspace");

  // ProseMark decoration plugins used to keep stale measured ranges after
  // destructive edits, crashing CodeMirror during the next view update.
  await expect(page.getByText("Something went wrong!")).toHaveCount(0);
  expect(errorMessages).toEqual([]);
});
