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

test("app workspace address chrome exposes the route URL editor", async ({ page }) => {
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
  const addressChrome = page.getByTestId("workspace-layout-v2-address-chrome");
  const routeUrlDisplay = addressChrome.getByTestId("route-url-editor-display");
  await expect(addressChrome).toBeVisible();
  await expect(routeUrlDisplay).toHaveValue("/?dev");
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
  const suggestionsPopover = page.getByTestId("route-url-editor-suggestions-popover");
  await expect(suggestionsPopover.getByRole("group", { name: "Theme" })).toBeVisible();
  await expect(suggestionsPopover.getByRole("group", { name: "Logo", exact: true })).toHaveCount(0);
  await expect(suggestionsPopover).toHaveScreenshot("route-url-editor-suggestion-groups.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });

  await page.getByRole("link", { name: "/terms", exact: true }).dispatchEvent("click");
  await expect(page).toHaveURL(/\/terms\?dev$/);
  await expect(routeUrlInput).toHaveCount(0);
  await expect(routeUrlDisplay).toHaveValue("/terms?dev");
  await expect(routeUrlDisplay).toHaveAttribute("title", `${origin}/terms?dev`);
});

test("route URL editor distinguishes developer logo routes @logo-research", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.57;
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?dev", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const origin = new URL(page.url()).origin;
  const routeUrlDisplay = page.getByTestId("route-url-editor-display");
  await routeUrlDisplay.focus();

  const routeUrlInput = page.getByTestId("route-url-editor-input");
  await routeUrlInput.evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) {
      throw new Error("Expected route URL editor input.");
    }

    const pathCursorPosition = element.value.lastIndexOf("/") + 1;
    element.setSelectionRange(pathCursorPosition, pathCursorPosition);
    element.dispatchEvent(new Event("select", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const suggestionsPopover = page.getByTestId("route-url-editor-suggestions-popover");
  const developerSuggestion = suggestionsPopover.getByRole("option", {
    exact: true,
    name: "/logo/iso",
  });
  const standardSuggestion = suggestionsPopover.getByRole("option", {
    exact: true,
    name: "/logo",
  });

  await expect(routeUrlInput).toHaveValue(`${origin}/?dev&`);
  await expect(developerSuggestion.getByText("dev", { exact: true })).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(developerSuggestion).toHaveClass(/bg-sky-500\/5/);
  await expect(standardSuggestion.getByText("dev", { exact: true })).toHaveCount(0);
  await expect(suggestionsPopover).toHaveScreenshot("route-url-editor-dev-logo-routes.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});

test("developer logo routes remain public on direct loads @logo-research", async ({ page }) => {
  await page.goto("/logo/single-cube?dev", {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.getByRole("heading", {
      exact: true,
      name: "Single Cube Rotation Lab",
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/logo\/single-cube\?dev$/);
});

test("app workspace route URL editor stays compact for long URLs", async ({ page }) => {
  const longPath =
    "/terms?dev#route-editor-keeps-a-long-address-readable-without-expanding-the-workspace-chrome-on-narrow-viewports";

  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(longPath, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const pageUrl = new URL(page.url());
  const origin = pageUrl.origin;
  const routeAddress = `${pageUrl.pathname}${pageUrl.search}${pageUrl.hash}`;
  const routeTitleAddress = `${pageUrl.pathname}${pageUrl.search}`;
  const addressChrome = page.getByTestId("workspace-layout-v2-address-chrome");
  const routeUrlEditor = addressChrome.getByTestId("route-url-editor");
  const routeUrlDisplay = addressChrome.getByTestId("route-url-editor-display");
  await expect(addressChrome).toBeVisible();
  await expect(routeUrlDisplay).toHaveValue(routeAddress);
  await expect(routeUrlDisplay).toHaveAttribute("title", `${origin}${routeTitleAddress}`);

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

  await page.goto("/?dev", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await page.getByTestId("public-landing-copy").getByRole("textbox").focus();
  await page.keyboard.press(selectAllShortcut);
  await page.keyboard.press("Backspace");

  // ProseMark decoration plugins used to keep stale measured ranges after
  // destructive edits, crashing CodeMirror during the next view update.
  await expect(page.getByText("Something went wrong!")).toHaveCount(0);
  expect(errorMessages).toEqual([]);
});
