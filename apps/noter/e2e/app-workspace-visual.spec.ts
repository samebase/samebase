import { expect, test } from "@playwright/test";

const selectAllShortcut = process.platform === "darwin" ? "Meta+A" : "Control+A";
const localConvexSyncConsoleErrorPattern =
  /^WebSocket connection to 'ws:\/\/127\.0\.0\.1:\d+\/api\/[^']+\/sync' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED$/;

function isExpectedLocalConvexSyncConsoleError(message: string) {
  return localConvexSyncConsoleErrorPattern.test(message);
}

test("landing route uses the stable app workspace shell", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.57;
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page).toHaveScreenshot("app-workspace-landing.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("app workspace header exposes the route URL editor", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.57;
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?dev", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const pageUrl = new URL(page.url());
  const origin = pageUrl.origin;
  const routeUrlDisplay = page.getByTestId("route-url-editor-display");
  await expect(routeUrlDisplay).toHaveValue(`${origin}/?dev`);
  await expect(routeUrlDisplay).toHaveAttribute("title", `${origin}/?dev`);
  await expect(page).toHaveScreenshot("app-workspace-landing-dev.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
  await routeUrlDisplay.focus();
  const routeUrlInput = page.getByTestId("route-url-editor-input");
  await expect(routeUrlInput).toHaveValue(`${origin}/?dev&`);

  await page.getByRole("link", { name: "/terms", exact: true }).dispatchEvent("click");
  await expect(page).toHaveURL(/\/terms\?dev$/);
  await expect(routeUrlInput).toHaveCount(0);
  await expect(routeUrlDisplay).toHaveValue(`${origin}/terms?dev`);
  await expect(routeUrlDisplay).toHaveAttribute("title", `${origin}/terms?dev`);
});

test("app workspace route URL editor stays compact for long URLs", async ({ page }) => {
  const longPath =
    "/logo/transition/transforms?dev&depth=5&dist=1.25&elev=33&freeView&gridSize=4&isoSide=120&isoStyle=shaded-edge&leftFace=striped&stripeA=45&stripeBasis=diagonal&stripeG=8&stripeLink&stripeO=2&stripeW=4&rot=45";

  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(longPath, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const pageUrl = new URL(page.url());
  const origin = pageUrl.origin;
  const routeAddress = `${pageUrl.pathname}${pageUrl.search}${pageUrl.hash}`;
  const routeUrlEditor = page.getByTestId("route-url-editor");
  const routeUrlDisplay = page.getByTestId("route-url-editor-display");
  await expect(routeUrlDisplay).toHaveValue(`${origin}${routeAddress}`);
  await expect(routeUrlDisplay).toHaveAttribute("title", `${origin}${routeAddress}`);

  const metrics = await routeUrlEditor.evaluate((element) => {
    const display = element.querySelector('[data-testid="route-url-editor-display"]');
    if (!(display instanceof HTMLInputElement)) {
      throw new Error("Expected route URL editor display");
    }

    return {
      height: element.getBoundingClientRect().height,
      displayClientWidth: display.clientWidth,
      displayScrollWidth: display.scrollWidth,
    };
  });

  expect(metrics.height).toBeLessThanOrEqual(32);
  expect(metrics.displayScrollWidth).toBeGreaterThan(metrics.displayClientWidth);
});

test("landing ProseMark copy survives full selection deletion", async ({ page }) => {
  await page.goto("/?dev", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const errorMessages: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !isExpectedLocalConvexSyncConsoleError(text)) {
      errorMessages.push(text);
    }
  });
  page.on("pageerror", (error) => {
    errorMessages.push(error.message);
  });

  await page.getByTestId("public-landing-copy").getByRole("textbox").focus();
  await page.keyboard.press(selectAllShortcut);
  await page.keyboard.press("Backspace");

  // ProseMark decoration plugins used to keep stale measured ranges after
  // destructive edits, crashing CodeMirror during the next view update.
  await expect(page.getByText("Something went wrong!")).toHaveCount(0);
  expect(errorMessages).toEqual([]);
});
