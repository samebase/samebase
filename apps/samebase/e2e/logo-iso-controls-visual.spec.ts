import { expect, test, type Locator, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { APP_BUILD_STATUS_BAR_TEST_ID } from "../src/lib/appBuild";
import { APP_WORKSPACE_SIDEBAR_STORAGE_KEY } from "../src/lib/appWorkspaceSidebarPreferences";
import { LOCAL_STORAGE_ROUTE } from "../src/lib/localStorageRoute";
import { PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID } from "../src/lib/publicLanding";
import { signInIfNeeded } from "./liveHelpers";

test.setTimeout(120_000);

// Keep this route-level guard independent from the production cap helper.
const EXPECTED_LOGO_DEPTH_HARD_MAX = {
  iso: 10,
  raster: 10,
  svg: 3,
  three: 5,
} as const;
const logoPublicRouteUrls = ["/logo", "/logo?light", "/logo?dark"] as const;

async function waitForPaint(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  });
}

async function replaceNumberInputValue(input: Locator, value: string) {
  await input.click();
  await input.press("ControlOrMeta+A");
  await input.press("Backspace");
  await expect(input).toHaveValue("");
  await input.pressSequentially(value);
  await expect(input).toHaveValue(value);
}

async function sampleLogoCanvasCorner(page: Page) {
  const buffer = await page.locator("canvas").first().screenshot({
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
  const png = PNG.sync.read(buffer);
  const x = Math.min(8, png.width - 1);
  const y = Math.min(8, png.height - 1);
  const index = (y * png.width + x) * 4;

  return [png.data[index], png.data[index + 1], png.data[index + 2], png.data[index + 3]] as const;
}

type LogoSearchEntry = [key: string, value: string];

function sortLogoSearchEntries(entries: LogoSearchEntry[]) {
  return [...entries].sort(
    ([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
  );
}

async function expectLogoSearchEntries(page: Page, expectedEntries: LogoSearchEntry[]) {
  await expect
    .poll(() => {
      const url = new URL(page.url());

      return {
        pathname: url.pathname,
        searchEntries: sortLogoSearchEntries(Array.from(url.searchParams.entries())),
      };
    })
    .toEqual({
      pathname: "/logo",
      searchEntries: sortLogoSearchEntries(expectedEntries),
    });
}

async function signInForLogoAdminRoute(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page);
}

async function gotoLogoAdminRoute(page: Page, url: string): Promise<void> {
  await signInForLogoAdminRoute(page);
  await page.goto(url, {
    waitUntil: "domcontentloaded",
  });
}

async function navigateWithRouteUrlEditor(page: Page, url: string): Promise<void> {
  const input = page.getByTestId("route-url-editor-input");
  if (!(await input.isVisible())) {
    const display = page.getByTestId("route-url-editor-display");
    await expect(display).toBeVisible();
    await display.focus();
    await expect(input).toBeFocused();
  }
  await input.fill(url);
  await input.press("Enter");
}

test("logo iso controls sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoLogoAdminRoute(page, "/logo/iso?isoSide=6");

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  await expect(controlsSidebar).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  await expect(controlsSidebar).toContainText("Cube side");
  await expect(controlsSidebar).toContainText("6px");

  const screenshot = await controlsSidebar.screenshot({
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });

  expect(screenshot).toMatchSnapshot("logo-iso-controls.png", {
    // The controls sidebar uses the app's system sans stack, which shifts text
    // metrics between macOS and Linux. Keep a bounded tolerance for that copy.
    maxDiffPixelRatio: 0.06,
  });
});

test("logo right sidebar keeps public links visible", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo", {
    waitUntil: "domcontentloaded",
  });

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  const addressChrome = page.getByTestId("workspace-layout-v2-address-chrome");
  const linksSidebar = page.getByTestId("workspace-layout-v2-pane-right");
  const pageUrl = new URL(page.url());
  const origin = pageUrl.origin;
  const routeUrlDisplay = addressChrome.getByTestId("route-url-editor-display");
  const publicLinks = linksSidebar.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);

  await expect(controlsSidebar).toBeVisible();
  await expect(addressChrome).toBeVisible();
  await expect(controlsSidebar.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID)).toHaveCount(0);
  await expect(routeUrlDisplay).toHaveValue("/logo");
  await expect(routeUrlDisplay).toHaveAttribute("title", `${origin}/logo`);
  await expect(linksSidebar).toBeVisible();
  const accountSection = linksSidebar.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID);
  await expect(accountSection).toBeVisible();
  await expect(accountSection.getByRole("button", { name: "not logged in" })).toBeVisible();
  await expect(publicLinks.getByRole("link", { name: "/home", exact: true })).toHaveCount(0);
  await expect(
    publicLinks.getByRole("link", { name: LOCAL_STORAGE_ROUTE, exact: true }),
  ).toHaveCount(0);
  await expect(publicLinks.getByRole("link", { name: "/terms", exact: true })).toHaveAttribute(
    "href",
    "/terms",
  );
  await expect(publicLinks.getByRole("link", { name: "/privacy", exact: true })).toHaveAttribute(
    "href",
    "/privacy",
  );
  await expect(publicLinks.getByRole("link", { name: "/landing", exact: true })).toHaveAttribute(
    "href",
    "/",
  );
  await expect(publicLinks.getByRole("link", { name: "?light", exact: true })).toHaveAttribute(
    "href",
    "/logo?light",
  );
  await expect(publicLinks.getByRole("link", { name: "?dark", exact: true })).toHaveAttribute(
    "href",
    "/logo?dark",
  );
  await expect(publicLinks).toHaveScreenshot("logo-right-sidebar-meta-section.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.03,
    scale: "css",
  });
});

test("logo routes share the public account right sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  for (const pathname of logoPublicRouteUrls) {
    await page.goto(pathname, { waitUntil: "domcontentloaded" });

    const linksSidebar = page.getByTestId("workspace-layout-v2-pane-right");
    const accountSection = linksSidebar.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID);
    await expect(accountSection).toBeVisible();
    await expect(accountSection.getByRole("button", { name: "not logged in" })).toBeVisible();
  }
});

test("logo right sidebar public path links navigate on click", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo", {
    waitUntil: "domcontentloaded",
  });

  const linksSidebar = page.getByTestId("workspace-layout-v2-pane-right");
  const publicLinks = linksSidebar.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);
  const termsLink = publicLinks.getByRole("link", { name: "/terms", exact: true });

  await expect(publicLinks).toBeVisible();
  await termsLink.hover();
  await expect(page).toHaveURL(/\/logo$/);

  await termsLink.click();
  await expect(page).toHaveURL(/\/terms$/);
});

test("logo public query links toggle root theme mode", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo?dev", {
    waitUntil: "domcontentloaded",
  });

  const linksSidebar = page.getByTestId("workspace-layout-v2-pane-right");
  const publicLinks = linksSidebar.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);

  await publicLinks.getByRole("link", { name: "?light", exact: true }).click();
  await expectLogoSearchEntries(page, [
    ["dev", ""],
    ["light", ""],
  ]);
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(publicLinks.getByRole("link", { name: "?light-", exact: true })).toBeVisible();

  await publicLinks.getByRole("link", { name: "?dark", exact: true }).click();
  await expectLogoSearchEntries(page, [
    ["dark", ""],
    ["dev", ""],
  ]);
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(publicLinks.getByRole("link", { name: "?dark-", exact: true })).toBeVisible();

  await publicLinks.getByRole("link", { name: "?dark-", exact: true }).click();
  await expectLogoSearchEntries(page, [["dev", ""]]);
  await expect(publicLinks.getByRole("link", { name: "?light", exact: true })).toBeVisible();
  await expect(publicLinks.getByRole("link", { name: "?dark", exact: true })).toBeVisible();
});

test("logo public query links repaint the three scene theme colors", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo?dev&light", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.locator("canvas").first()).toBeVisible();
  await waitForPaint(page);

  const lightPixel = await sampleLogoCanvasCorner(page);
  const publicLinks = page
    .getByTestId("workspace-layout-v2-pane-right")
    .getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);

  await publicLinks.getByRole("link", { name: "?dark", exact: true }).click();
  await expectLogoSearchEntries(page, [
    ["dark", ""],
    ["dev", ""],
  ]);
  await waitForPaint(page);

  const darkPixel = await sampleLogoCanvasCorner(page);

  expect(lightPixel).toEqual([255, 255, 255, 255]);
  expect(darkPixel).toEqual([57, 68, 71, 255]);
});

test("logo public query color overrides repaint the three scene background color", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo?dev&light&background=%23112233", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.locator("canvas").first()).toBeVisible();
  await waitForPaint(page);

  expect(await sampleLogoCanvasCorner(page)).toEqual([17, 34, 51, 255]);
});

test("logo public query links cancel conflicting root theme modes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo?dev&light&dark", {
    waitUntil: "domcontentloaded",
  });

  await expectLogoSearchEntries(page, [["dev", ""]]);
  await expect(
    page
      .getByTestId("workspace-layout-v2-pane-right")
      .getByRole("link", { name: "?light", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("workspace-layout-v2-pane-right")
      .getByRole("link", { name: "?dark", exact: true }),
  ).toBeVisible();
});

test("logo recursive depth renders a rotatable shuffleable Three scene", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInForLogoAdminRoute(page);
  await page.goto("/logo?depth=3&rot=45", {
    waitUntil: "domcontentloaded",
  });

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  const canvas = page.locator("canvas").first();

  await expect(canvas).toBeVisible();
  await expect(controlsSidebar.getByLabel("Depth value")).toHaveValue("3");
  await expect(controlsSidebar.getByRole("button", { name: "Add" })).toHaveCount(0);
  await expect(controlsSidebar.getByRole("button", { name: "Start shuffle" })).toBeVisible();
  await expect(controlsSidebar).toContainText("Parallel cubes");
  await controlsSidebar.getByRole("button", { name: "Start shuffle" }).click();
  await expect(controlsSidebar.getByRole("button", { name: "Stop shuffle" })).toBeVisible();
  await controlsSidebar.getByRole("button", { name: "Stop shuffle" }).click();
  await expect(controlsSidebar.getByRole("button", { name: "Start shuffle" })).toBeVisible();
  const origin = new URL(page.url()).origin;
  await navigateWithRouteUrlEditor(page, `${origin}/logo/svg?depth=3`);
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return `${url.pathname}:${url.searchParams.get("depth")}`;
    })
    .toBe("/logo/svg:3");
  await navigateWithRouteUrlEditor(page, `${origin}/logo?depth=3&rot=45`);
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return `${url.pathname}:${url.searchParams.get("depth")}:${url.searchParams.get("rot")}`;
    })
    .toBe("/logo:3:45");

  await controlsSidebar.getByLabel("Yaw value").fill("90");
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return `${url.pathname}:${url.searchParams.get("depth")}:${url.searchParams.get("rot")}`;
    })
    .toBe("/logo:3:90");
  await waitForPaint(page);

  await expect(canvas).toHaveScreenshot("logo-depth-3-three-scene.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
  });
});

test("logo recursive depth keeps opacity visually ordered", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo?depth=2&rot=45", {
    waitUntil: "domcontentloaded",
  });

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  const canvas = page.locator("canvas").first();

  await expect(canvas).toBeVisible();
  await expect(controlsSidebar.getByLabel("Depth value")).toHaveValue("2");
  await controlsSidebar.getByLabel("Opacity value").fill("0.40");
  await expect(controlsSidebar.getByLabel("Opacity value")).toHaveValue("0.40");
  await waitForPaint(page);

  await expect(canvas).toHaveScreenshot("logo-depth-2-opacity-three-scene.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
  });
});

test("logo depth 5 keeps the tiled Three preview responsive", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo?depth=5&rot=45", {
    waitUntil: "domcontentloaded",
  });

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");

  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(controlsSidebar.getByLabel("Depth value")).toHaveValue("5");
  await expect(controlsSidebar.getByRole("button", { name: "Add" })).toHaveCount(0);
  await expect(controlsSidebar.getByRole("button", { name: "Start shuffle" })).toBeVisible();
  await controlsSidebar.getByRole("button", { name: "Start shuffle" }).click();
  await expect(controlsSidebar.getByRole("button", { name: "Stop shuffle" })).toBeVisible();

  await controlsSidebar.getByLabel("Yaw value").fill("90");
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return `${url.searchParams.get("depth")}:${url.searchParams.get("rot")}`;
    })
    .toBe("5:90");
});

test("logo iso depth 5 keeps recursive preview responsive", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoLogoAdminRoute(page, "/logo/iso?depth=5&vox=xxx_xox_xxx-xox_ooo_xox-xxx_xox_xxx");

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  const canvas = page.locator('canvas[data-logo-renderer="iso"]').first();

  await expect(canvas).toBeVisible();
  await expect(controlsSidebar.getByLabel("Depth value")).toHaveValue("5");
  await expect(controlsSidebar.getByRole("button", { name: "Add" })).toHaveCount(0);
  await waitForPaint(page);
  await expect(canvas).toHaveScreenshot("logo-iso-depth-5-scene.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
  });

  await expect(controlsSidebar.getByRole("button", { name: "Start shuffle" })).toBeVisible();
  await controlsSidebar.getByRole("button", { name: "Start shuffle" }).click();
  await expect(controlsSidebar.getByRole("button", { name: "Stop shuffle" })).toBeVisible();
});

test("logo raster depth 6 keeps recursive preview responsive", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoLogoAdminRoute(page, "/logo/raster?depth=6&top=red-500&elev=359.9&freeView");

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  const canvas = page.locator('canvas[data-logo-renderer="raster"]').first();

  await expect(canvas).toBeVisible();
  await expect(controlsSidebar.getByLabel("Depth value")).toHaveValue("6");
  await expect(controlsSidebar.getByRole("button", { name: "Add" })).toHaveCount(0);
  await waitForPaint(page);
  await expect(canvas).toHaveScreenshot("logo-raster-depth-6-scene.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
  });

  await expect(controlsSidebar.getByRole("button", { name: "Start shuffle" })).toBeVisible();
  await controlsSidebar.getByRole("button", { name: "Start shuffle" }).click();
  await expect(controlsSidebar.getByRole("button", { name: "Stop shuffle" })).toBeVisible();

  await controlsSidebar.getByLabel("Yaw value").fill("90");
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return `${url.pathname}:${url.searchParams.get("depth")}:${url.searchParams.get("rot")}`;
    })
    .toBe("/logo/raster:6:90");
});

test("logo raster face-on recursion renders without tile seams", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoLogoAdminRoute(
    page,
    "/logo/raster?depth=2&top=red-500&elev=0&rot=180&vox=xxx_oox_xxo-xoo_ooo_xox-oxx_xox_xox",
  );

  const canvas = page.locator('canvas[data-logo-renderer="raster"]').first();

  await expect(canvas).toBeVisible();
  await waitForPaint(page);
  await expect(canvas).toHaveScreenshot("logo-raster-face-on-depth-2-scene.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
  });
});

test("logo raster seam lab shows the tiny 2x2 image-composition diagnostic", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoLogoAdminRoute(page, "/logo/raster-seams?elev=22&rot=22");

  const currentCase = page.getByTestId("logo-raster-seam-lab-current-case");
  const sourceCanvas = currentCase.locator('canvas[data-logo-raster-seam-lab="source"]');
  const maskCanvas = currentCase.locator('canvas[data-logo-raster-seam-lab="mask"]');

  await expect(currentCase).toBeVisible();
  await expect(sourceCanvas).toHaveCount(1);
  await expect(sourceCanvas).toHaveAttribute("width", "24");
  await expect(sourceCanvas).toHaveAttribute("height", "24");
  await expect(maskCanvas).toHaveCount(1);
  await expect(maskCanvas).toHaveAttribute("width", "24");
  await expect(maskCanvas).toHaveAttribute("height", "24");
  await waitForPaint(page);
  await expect(currentCase).toHaveScreenshot("logo-raster-seam-lab.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
  });

  const mergeSweep = page.getByTestId("logo-raster-seam-lab-merge-sweep");
  const mergeSweepRowCount = await mergeSweep
    .locator("button")
    .evaluateAll(
      (buttons) =>
        new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().top))).size,
    );

  await expect(mergeSweep).toBeVisible();
  expect(mergeSweepRowCount).toBeGreaterThan(1);
  await expect(mergeSweep).toHaveScreenshot("logo-raster-seam-lab-merge-sweep.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
  });

  await page.getByRole("button", { exact: true, name: "2" }).click();
  await expect(currentCase).toContainText("depth 2");
  await expect(currentCase).toHaveScreenshot("logo-raster-seam-lab-depth-2.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
  });

  await page.getByRole("button", { exact: true, name: "3x3" }).click();
  await expect(currentCase).toContainText("3x3 base, depth 2 -> 9x9x9");
  await expect(currentCase).toHaveScreenshot("logo-raster-seam-lab-3x3-depth-2.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
  });

  await page.getByRole("button", { name: "Merged faces" }).first().click();
  await expect(currentCase).toContainText("Merged faces");
  await expect(currentCase.getByText(/0 \/ \d+ \(0\.0%\)/)).toHaveCount(4);
});

test("logo raster seam lab inflation input allows partial edits", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoLogoAdminRoute(page, "/logo/raster-seams?elev=22&rot=22");

  const currentCase = page.getByTestId("logo-raster-seam-lab-current-case");
  const inflationInput = page.getByLabel("Inflation scale");

  await expect(inflationInput).toHaveAttribute("type", "number");
  await expect(inflationInput).toHaveValue("1.010");
  await inflationInput.click();
  await inflationInput.press("End");
  await inflationInput.press("Backspace");
  await expect(inflationInput).toHaveValue("1.01");

  await inflationInput.fill("1.5");
  await expect(inflationInput).toHaveValue("1.5");
  await expect(currentCase).toContainText("inflate 1.500x");

  await inflationInput.press("Enter");
  await expect(inflationInput).toHaveValue("1.500");
});

test("logo raster seam lab spacing scale moves the fake 3d centers", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoLogoAdminRoute(page, "/logo/raster-seams?depth=2&elev=22&rot=22");

  const currentCase = page.getByTestId("logo-raster-seam-lab-current-case");
  const composedCanvas = currentCase.locator('canvas[data-logo-raster-seam-lab="composed"]');
  const spacingInput = page.getByLabel("Spacing scale");

  await expect(spacingInput).toHaveValue("1.000");
  await expect(spacingInput).toHaveAttribute("type", "number");
  await expect(page.locator('input[type="range"]').first()).toHaveAttribute("max", "2");
  await waitForPaint(page);
  const defaultImage = await composedCanvas.evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) {
      return "";
    }

    return element.toDataURL();
  });

  await spacingInput.fill("0.99");
  await expect(spacingInput).toHaveValue("0.99");
  await waitForPaint(page);
  const tightenedImage = await composedCanvas.evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) {
      return "";
    }

    return element.toDataURL();
  });

  expect(tightenedImage).not.toBe(defaultImage);
  await spacingInput.press("Enter");
  await expect(spacingInput).toHaveValue("0.990");
});

test("logo raster seam lab source size input allows larger custom rasters", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoLogoAdminRoute(page, "/logo/raster-seams?elev=22&rot=22");

  const currentCase = page.getByTestId("logo-raster-seam-lab-current-case");
  const maskCanvas = currentCase.locator('canvas[data-logo-raster-seam-lab="mask"]');
  const sourceInput = page.getByLabel("Source size");
  const rotationInput = page.getByLabel("Rotation degrees");
  const elevationInput = page.getByLabel("Elevation degrees");

  await expect(sourceInput).toHaveValue("24");
  await expect(sourceInput).toHaveAttribute("type", "number");
  await replaceNumberInputValue(sourceInput, "145");
  await sourceInput.press("Enter");
  await expect(currentCase).toContainText("145px source");
  await expect(maskCanvas).toHaveAttribute("width", "145");
  await expect(maskCanvas).toHaveAttribute("height", "145");

  await expect(sourceInput).toHaveValue("145");

  await expect(rotationInput).toHaveAttribute("step", "0.1");
  await expect(elevationInput).toHaveAttribute("step", "0.1");
  await expect(rotationInput).toHaveAttribute("type", "number");
  await expect(elevationInput).toHaveAttribute("type", "number");
  await replaceNumberInputValue(rotationInput, "54.5");
  await expect(currentCase).toContainText("rotation 54.5°");

  await replaceNumberInputValue(elevationInput, "22.4");
  await expect(currentCase).toContainText("elevation 22.4°");
});

test("logo shape presets include seam stress models", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoLogoAdminRoute(page, "/logo/raster?top=red-500");

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  const shapeSelect = controlsSidebar.getByRole("combobox").filter({ hasText: "Checker 3" });

  await expect(shapeSelect).toBeVisible();
  await shapeSelect.click();
  await expect(page.getByText("Sierpinski Carpet", { exact: true })).toBeVisible();
  await expect(page.getByText("Full Cube 3", { exact: true })).toBeVisible();
  await page.getByText("Sierpinski Carpet", { exact: true }).click();

  await expect(
    controlsSidebar.getByRole("combobox").filter({ hasText: "Sierpinski Carpet" }),
  ).toBeVisible();
  await expect(controlsSidebar).toContainText("xxx_xox_xxx-xox_ooo_xox-xxx_xox_xxx");

  await controlsSidebar.getByRole("combobox").filter({ hasText: "Sierpinski Carpet" }).click();
  await page.getByText("Full Cube 3", { exact: true }).click();

  await expect(
    controlsSidebar.getByRole("combobox").filter({ hasText: "Full Cube 3" }),
  ).toBeVisible();
  await expect(controlsSidebar).toContainText("xxx_xxx_xxx-xxx_xxx_xxx-xxx_xxx_xxx");
});

test("logo depth slider clears default depth from the URL", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo?depth=3&rot=45", {
    waitUntil: "domcontentloaded",
  });

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  const depthSlider = controlsSidebar.getByLabel("Depth slider");
  const depthValue = controlsSidebar.getByLabel("Depth value");

  await expect(depthSlider).toHaveAttribute("max", "5");
  await expect(depthValue).toHaveAttribute("max", `${EXPECTED_LOGO_DEPTH_HARD_MAX.three}`);
  await expect(depthValue).toHaveValue("3");
  await depthSlider.fill("1");
  await expect(depthValue).toHaveValue("1");
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return url.searchParams.has("depth");
    })
    .toBe(false);
});

test("logo pages cap URL-edited recursive depth before rendering", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInForLogoAdminRoute(page);
  await page.goto("/logo?depth=99&rot=45", {
    waitUntil: "domcontentloaded",
  });

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  await expect(controlsSidebar.getByLabel("Depth value")).toHaveValue(
    `${EXPECTED_LOGO_DEPTH_HARD_MAX.three}`,
  );

  await page.goto("/logo/svg?depth=99&vox=xxx_xxx_xxx-xxx_xxx_xxx-xxx_xxx_xxx", {
    waitUntil: "domcontentloaded",
  });

  const staticLogo = page.getByTestId("logo-static-svg-image");
  await expect(staticLogo).toBeVisible();
  await expect
    .poll(async () => {
      const src = await staticLogo.getAttribute("src");
      const hash = src?.split("#")[1] ?? "";
      return decodeURIComponent(hash).endsWith(`:${EXPECTED_LOGO_DEPTH_HARD_MAX.svg}`);
    })
    .toBe(true);

  await page.goto("/logo/iso?depth=99", {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByTestId("workspace-layout-v2-pane-left").getByLabel("Depth value"),
  ).toHaveValue(`${EXPECTED_LOGO_DEPTH_HARD_MAX.iso}`);

  await page.goto("/logo/raster?depth=99", {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByTestId("workspace-layout-v2-pane-left").getByLabel("Depth value"),
  ).toHaveValue(`${EXPECTED_LOGO_DEPTH_HARD_MAX.raster}`);
});

test("logo distance scale controls Three and raster previews", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInForLogoAdminRoute(page);
  await page.goto("/logo?dist=1.25&rot=45", {
    waitUntil: "domcontentloaded",
  });

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  const distanceSlider = controlsSidebar.getByLabel("Distance slider");
  const distanceInput = controlsSidebar.getByLabel("Distance scale");

  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(distanceSlider).toHaveAttribute("max", "2");
  await expect(distanceInput).toHaveAttribute("type", "number");
  await expect(distanceInput).toHaveAttribute("step", "0.001");
  await expect(distanceInput).not.toHaveAttribute("max");
  await expect(distanceInput).toHaveValue("1.250");

  await distanceInput.fill("2.5");
  await expect(distanceInput).toHaveValue("2.5");
  await expect.poll(() => new URL(page.url()).searchParams.get("dist")).toBe("2.5");
  await distanceInput.press("Enter");
  await expect(distanceInput).toHaveValue("2.500");

  await distanceInput.fill("1");
  await distanceInput.press("Enter");
  await expect.poll(() => new URL(page.url()).searchParams.has("dist")).toBe(false);

  await page.goto("/logo/raster?dist=0.5&rot=45", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator('canvas[data-logo-renderer="raster"]').first()).toBeVisible();
  await expect(
    page.getByTestId("workspace-layout-v2-pane-left").getByLabel("Distance scale"),
  ).toHaveValue("0.500");
});

test("logo zoom controls shrink the Three preview", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInForLogoAdminRoute(page);

  await page.goto("/logo?zoom=1&rot=45", {
    waitUntil: "domcontentloaded",
  });

  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  await waitForPaint(page);
  const fullZoomBox = await canvas.boundingBox();
  expect(fullZoomBox).not.toBeNull();
  if (fullZoomBox === null) {
    throw new Error("Expected the full-size logo canvas to be visible.");
  }

  await page.goto("/logo?zoom=0.5&rot=45", {
    waitUntil: "domcontentloaded",
  });

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  const viewSection = controlsSidebar.getByTestId("logo-preview-view-section");
  const zoomSlider = controlsSidebar.getByLabel("Zoom slider");
  const zoomInput = controlsSidebar.getByLabel("Zoom value");

  await expect(canvas).toBeVisible();
  await expect(zoomSlider).toHaveAttribute("max", "1");
  await expect(zoomSlider).toHaveAttribute("min", "0");
  await expect(zoomSlider).toHaveAttribute("step", "0.01");
  await expect(zoomInput).toHaveAttribute("max", "1");
  await expect(zoomInput).toHaveValue("0.50");
  await waitForPaint(page);

  const halfZoomBox = await canvas.boundingBox();
  expect(halfZoomBox).not.toBeNull();
  if (halfZoomBox === null) {
    throw new Error("Expected the half-size logo canvas to be visible.");
  }

  expect(halfZoomBox.width).toBeLessThan(fullZoomBox.width * 0.6);
  expect(halfZoomBox.width).toBeGreaterThan(fullZoomBox.width * 0.4);

  await expect(viewSection).toHaveScreenshot("logo-view-zoom-controls.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
  });

  await replaceNumberInputValue(zoomInput, "0.25");
  await expect.poll(() => new URL(page.url()).searchParams.get("zoom")).toBe("0.25");
  await zoomInput.press("Enter");
  await expect(zoomInput).toHaveValue("0.25");

  await replaceNumberInputValue(zoomInput, "1");
  await zoomInput.press("Enter");
  await expect.poll(() => new URL(page.url()).searchParams.has("zoom")).toBe(false);
});

test("logo raster distance scale keeps depth 3 on the geometric base path", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoLogoAdminRoute(page, "/logo/raster?depth=3&dist=1.5&top=red-500&elev=22&rot=45");

  const canvas = page.locator('canvas[data-logo-renderer="raster"]').first();

  await expect(canvas).toBeVisible();
  await waitForPaint(page);
  await expect(canvas).toHaveScreenshot("logo-raster-distance-depth-3-scene.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
  });
});

test("logo iso controls mobile boot", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInForLogoAdminRoute(page);
  await page.evaluate((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, APP_WORKSPACE_SIDEBAR_STORAGE_KEY);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/logo/iso?isoSide=6", {
    waitUntil: "domcontentloaded",
  });

  const workspace = page.locator("[data-workspace-layout-v2]");
  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  await expect(workspace).toHaveAttribute("data-mobile-pane", "main");
  await expect(controlsSidebar).toContainText("Cube side");
  await expect(controlsSidebar).toContainText("6px");
  await expect(page.getByRole("button", { name: "Controls" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Preview" })).toHaveCount(0);
});

test("logo view mobile header omits the controls sidebar button", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/logo?elev=215.3", {
    waitUntil: "domcontentloaded",
  });

  const workspace = page.locator("[data-workspace-layout-v2]");
  const carousel = page.getByTestId("workspace-layout-v2-pane-main");
  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  const addressChrome = page.getByTestId("workspace-layout-v2-address-chrome");

  await expect(workspace).toHaveAttribute("data-mobile-pane", "main");
  await expect(controlsSidebar).toContainText("Shape");
  await expect(controlsSidebar).not.toContainText("Pages");
  await expect(carousel).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle Left Sidebar" })).toHaveCount(0);

  await expect(addressChrome).toHaveScreenshot("logo-mobile-main-header.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});

test("logo view angle input stacks below the slider", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo?elev=0&rot=34", {
    waitUntil: "domcontentloaded",
  });

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  const rotationSlider = controlsSidebar.getByLabel("Yaw slider");
  const rotationInput = controlsSidebar.getByLabel("Yaw value");

  await expect(rotationSlider).toBeVisible();
  await expect(rotationInput).toBeVisible();

  const sliderBox = await rotationSlider.boundingBox();
  const inputBox = await rotationInput.boundingBox();

  expect(sliderBox).not.toBeNull();
  expect(inputBox).not.toBeNull();

  if (sliderBox === null || inputBox === null) {
    throw new Error("Expected the rotation slider and input to be visible.");
  }

  expect(inputBox.y).toBeGreaterThan(sliderBox.y + sliderBox.height);
  expect(inputBox.width).toBeGreaterThan(120);
  expect(inputBox.width).toBeLessThan(sliderBox.width);
});

test("logo view button groups wrap to one per row in the default rail", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo?elev=144.7", {
    waitUntil: "domcontentloaded",
  });

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  const viewSection = controlsSidebar.getByTestId("logo-preview-view-section");
  const addButton = controlsSidebar.getByRole("button", { name: "Add" });
  const removeButton = controlsSidebar.getByRole("button", { name: "Remove" });
  const cubeAxisButton = viewSection.getByRole("button", {
    name: "Cube axis",
  });
  const verticalButton = viewSection.getByRole("button", {
    name: "Vertical",
  });

  const addBox = await addButton.boundingBox();
  const removeBox = await removeButton.boundingBox();
  const cubeAxisBox = await cubeAxisButton.boundingBox();
  const verticalBox = await verticalButton.boundingBox();

  expect(addBox).not.toBeNull();
  expect(removeBox).not.toBeNull();
  expect(cubeAxisBox).not.toBeNull();
  expect(verticalBox).not.toBeNull();

  if (addBox === null || removeBox === null || cubeAxisBox === null || verticalBox === null) {
    throw new Error("Expected the logo view buttons to be visible.");
  }

  expect(removeBox.y).toBeGreaterThan(addBox.y);
  expect(verticalBox.y).toBeGreaterThan(cubeAxisBox.y);
});

test("logo view exposes striped left-face controls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo?leftFace=striped&stripeW=0.22&stripeG=0.18", {
    waitUntil: "domcontentloaded",
  });

  const leftFaceSection = page.getByTestId("logo-preview-left-face-section");
  await expect(leftFaceSection).toContainText("Width");
  await expect(leftFaceSection).toContainText("0.22");
  await expect(leftFaceSection).toContainText("Gap");
  await expect(leftFaceSection).toContainText("0.18");
  await expect(leftFaceSection).toContainText("Width basis");
  const linkedWidthGapCheckbox = leftFaceSection.getByRole("checkbox", {
    name: "Link width/gap",
  });
  const animateStripesCheckbox = leftFaceSection.getByRole("checkbox", {
    name: "Animate stripes",
  });
  await expect(linkedWidthGapCheckbox).not.toBeChecked();
  await expect(animateStripesCheckbox).not.toBeChecked();

  await expect(leftFaceSection).toHaveScreenshot("logo-left-face-stripe-controls.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
  });

  const canvas = page.locator("canvas").first();
  await waitForPaint(page);
  await expect(canvas).toHaveScreenshot("logo-striped-left-face-scene.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
  });

  const horizontalBasisButton = leftFaceSection.getByRole("button", {
    name: "Horizontal",
    exact: true,
  });
  await expect(horizontalBasisButton).toBeVisible();
  await horizontalBasisButton.click();
  await expect(page).toHaveURL(/stripeBasis=horizontal/);

  await linkedWidthGapCheckbox.check();
  await expect(linkedWidthGapCheckbox).toBeChecked();
  await expect(page).toHaveURL(/stripeLink/);
  await animateStripesCheckbox.check();
  await expect(animateStripesCheckbox).toBeChecked();
  await expect(page).not.toHaveURL(/stripeAnim/);

  await leftFaceSection.getByRole("spinbutton", { name: "Stripe gap" }).fill("0");
  await expect(page).toHaveURL(/stripeW=0/);
  await expect(page).toHaveURL(/stripeG=0/);
  await expect(page).toHaveURL(/stripeLink/);
});

test("logo view color selection applies Tailwind colors to the Three scene", async ({ page }) => {
  const unsupportedColorWarnings: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (text.includes("THREE.Color: Unknown color model")) {
      unsupportedColorWarnings.push(text);
    }
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo", {
    waitUntil: "domcontentloaded",
  });

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  const colorsSection = page.getByTestId("logo-preview-colors-section");
  const primaryColorPicker = controlsSidebar.getByRole("button", {
    name: "Primary color picker",
  });

  await primaryColorPicker.click();
  const primaryColorPopover = page.getByTestId("logo-color-picker-primary");
  await expect(primaryColorPopover).toBeVisible();

  await primaryColorPopover.getByLabel("Primary custom color").fill("#ff00cc");
  await expect(page).toHaveURL(/primary=%23ff00cc/);
  await expect(primaryColorPicker).toContainText("#ff00cc");

  await primaryColorPopover.getByRole("button", { name: "Sky family", exact: true }).click();
  await expect(page).toHaveURL(/primary=sky-500/);

  await primaryColorPopover.getByRole("button", { name: "Red family", exact: true }).click();
  await expect(page).toHaveURL(/primary=red-500/);

  await primaryColorPopover.getByRole("button", { name: "Red 600", exact: true }).click();
  await expect(page).toHaveURL(/primary=red-600/);

  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  });

  await expect(primaryColorPopover).toHaveScreenshot("logo-color-picker-popover.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
  });

  await page.keyboard.press("Escape");
  await expect(primaryColorPopover).toBeHidden();
  await expect(colorsSection).toHaveScreenshot("logo-color-controls.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
  });

  expect(unsupportedColorWarnings).toEqual([]);
});

test("logo view desktop header toggle collapses and reopens the sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo?elev=215.3", {
    waitUntil: "domcontentloaded",
  });

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  const leftToggle = page.getByRole("button", {
    name: "Toggle Left Sidebar",
  });

  await expect(leftToggle).toBeVisible();
  await expect(controlsSidebar).toContainText("Shape");
  await expect(controlsSidebar).not.toContainText("Pages");

  await leftToggle.click();
  await expect
    .poll(async () =>
      controlsSidebar.evaluate((element) => Math.round(element.getBoundingClientRect().width)),
    )
    .toBe(0);

  await leftToggle.click();
  await expect
    .poll(async () =>
      controlsSidebar.evaluate((element) => Math.round(element.getBoundingClientRect().width)),
    )
    .toBeGreaterThan(200);
});
