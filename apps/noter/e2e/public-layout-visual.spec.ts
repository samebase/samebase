import { expect, test } from "@playwright/test";

const selectAllShortcut = process.platform === "darwin" ? "Meta+A" : "Control+A";

function isExpectedLocalConvexSyncConsoleError(message: string) {
  return (
    message.includes("WebSocket connection to 'ws://127.0.0.1:3210/") &&
    message.includes("net::ERR_CONNECTION_REFUSED")
  );
}

test("public landing route uses the right sidebar shell", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.57;
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page).toHaveScreenshot("public-layout-landing.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("public landing header exposes the route URL editor", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.57;
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?dev", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const host = new URL(page.url()).host;
  const routeUrlInput = page.getByTestId("route-url-editor-input");
  await expect(routeUrlInput).toHaveValue(`${host}/?dev`);
  await expect(routeUrlInput).toHaveAttribute("title", `${host}/?dev`);
  await expect(page).toHaveScreenshot("public-layout-landing-dev.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });

  await page.getByRole("link", { name: "/terms", exact: true }).click();
  await expect(page).toHaveURL(/\/terms\?dev$/);
  await expect(page.getByTestId("route-url-editor-input")).toHaveValue(`${host}/terms?dev`);
  await expect(page.getByTestId("route-url-editor-input")).toHaveAttribute(
    "title",
    `${host}/terms?dev`,
  );
});

test("public route URL editor stays compact for long URLs", async ({ page }) => {
  const longPath =
    "/?dev&route=codex-find-main-header-url-research&state=abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";

  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(longPath, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const host = new URL(page.url()).host;
  const routeUrlEditor = page.getByTestId("route-url-editor");
  const routeUrlInput = page.getByTestId("route-url-editor-input");
  await expect(routeUrlInput).toHaveValue(`${host}${longPath}`);
  await expect(routeUrlInput).toHaveAttribute("title", `${host}${longPath}`);

  const metrics = await routeUrlEditor.evaluate((element) => {
    const input = element.querySelector('[data-testid="route-url-editor-input"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected route URL editor input");
    }

    return {
      height: element.getBoundingClientRect().height,
      inputClientWidth: input.clientWidth,
      inputScrollWidth: input.scrollWidth,
    };
  });

  expect(metrics.height).toBeLessThanOrEqual(32);
  expect(metrics.inputScrollWidth).toBeGreaterThanOrEqual(metrics.inputClientWidth);
});

test("public landing ProseMark copy survives full selection deletion", async ({ page }) => {
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
  await page.getByTestId("public-landing-copy").getByRole("textbox").click();
  await page.keyboard.press(selectAllShortcut);
  await page.keyboard.press("Backspace");

  // ProseMark decoration plugins used to keep stale measured ranges after
  // destructive edits, crashing CodeMirror during the next view update.
  await expect(page.getByText("Something went wrong!")).toHaveCount(0);
  expect(errorMessages).toEqual([]);
});
