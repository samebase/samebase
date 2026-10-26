import { expect, test } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";

test.describe("route URL editor compact mobile suggestions", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("shortens shared paths consistently and highlights the draft cursor prefix", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Math.random = () => 0.57;
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/repo", { waitUntil: "networkidle" });
    await signInIfNeeded(page, "/terms");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("route-url-editor-display").focus();

    const origin = new URL(page.url()).origin;
    const path = "/repo/samebase/convex-cloudflare-email-inbox";
    const input = page.getByTestId("route-url-editor-input");
    const popover = page.getByTestId("route-url-editor-suggestions-popover");
    const values = popover.getByTestId("route-url-editor-suggestion-value");
    await input.fill(`${origin}${path}?attachments&`);
    await input.evaluate((element, position) => {
      if (!(element instanceof HTMLInputElement)) throw new Error("Expected URL input.");
      element.setSelectionRange(position, position);
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }, `${origin}/rep`.length);
    await expect(values).toHaveText(["/repo", path, `${path}/alchemy`, `${path}/settings`]);
    const sharedPaths = popover
      .getByTestId("route-url-editor-suggestion-path-prefix")
      .filter({ hasText: path });
    await expect(sharedPaths).toHaveText([path, path, path]);
    const prefixWidths = await sharedPaths.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().width),
    );
    expect(prefixWidths[0]).toBeGreaterThan(prefixWidths[1]);
    expect(prefixWidths[1]).toBe(prefixWidths[2]);
    for (const ending of ["/alchemy", "/settings"]) {
      const metrics = await popover.getByText(ending, { exact: true }).evaluate((element) => {
        const text = document.createRange();
        text.selectNodeContents(element);
        return {
          available: element.getBoundingClientRect().width,
          required: text.getBoundingClientRect().width,
        };
      });
      expect(metrics.available).toBeGreaterThanOrEqual(metrics.required);
    }
    await expect(popover).toHaveScreenshot("route-url-editor-early-path-mobile.png", {
      animations: "disabled",
      caret: "hide",
      scale: "css",
    });

    await input.evaluate((element, position) => {
      if (!(element instanceof HTMLInputElement)) throw new Error("Expected URL input.");
      element.setSelectionRange(position, position);
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }, `${origin}${path}`.length);

    await expect(values).toHaveText(["…/convex-cloudflare-email-inbox", "…/alchemy", "…/settings"]);
    await expect(
      popover.getByRole("option", { name: `${path}/alchemy`, exact: true }),
    ).toBeVisible();
    await expect(popover).toHaveScreenshot("route-url-editor-compact-paths-mobile.png", {
      animations: "disabled",
      caret: "hide",
      scale: "css",
    });

    await input.evaluate((element, position) => {
      if (!(element instanceof HTMLInputElement)) throw new Error("Expected URL input.");
      element.setSelectionRange(position, position);
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }, `${origin}/repo/samebase/convex-clo`.length);
    const labels = [
      "…/convex-cloudflare-email-inbox",
      "…/convex-cloudflare-email-inbox/alchemy",
      "…/convex-cloudflare-email-inbox/settings",
    ];
    await expect(values).toHaveText(labels);
    await expect(values.locator("mark")).toHaveText([
      "…",
      "/convex-clo",
      "…",
      "/convex-clo",
      "…",
      "/convex-clo",
    ]);
    await expect(popover).toHaveScreenshot("route-url-editor-middle-path-mobile.png", {
      animations: "disabled",
      caret: "hide",
      scale: "css",
    });

    await input.press("ArrowDown");
    await expect(values).toHaveText(labels);
    await expect(values.locator("mark")).toHaveText([
      "…",
      "/convex-clo",
      "…",
      "/convex-clo",
      "…",
      "/convex-clo",
    ]);
    await input.press("Enter");
    await expect(input).toHaveValue(`${origin}${path}?attachments&`);
  });
});

test("app workspace address chrome exposes the route URL editor", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.57;
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/privacy?dev", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const pageUrl = new URL(page.url());
  const origin = pageUrl.origin;
  const addressChrome = page.locator('[data-sidebar-layout-part="address-chrome"]');
  const routeUrlDisplay = addressChrome.getByTestId("route-url-editor-display");
  await expect(addressChrome).toBeVisible();
  await expect(routeUrlDisplay).toHaveValue("/privacy?dev");
  await expect(routeUrlDisplay).toHaveAttribute("title", `${origin}/privacy?dev`);
  await routeUrlDisplay.focus();
  const routeUrlInput = page.getByTestId("route-url-editor-input");
  await expect(routeUrlInput).toHaveValue(`${origin}/privacy?dev&`);
  const suggestionsPopover = page.getByTestId("route-url-editor-suggestions-popover");
  await expect(suggestionsPopover.getByRole("option", { exact: true, name: "&auth=" })).toHaveCount(
    0,
  );
  await expect(
    suggestionsPopover.getByRole("option", { exact: true, name: "&prod-ui" }),
  ).toHaveCount(0);
  await expect(
    suggestionsPopover.getByRole("option", { exact: true, name: "&signup=" }),
  ).toHaveCount(0);
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
  const addressChrome = page.locator('[data-sidebar-layout-part="address-chrome"]');
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
