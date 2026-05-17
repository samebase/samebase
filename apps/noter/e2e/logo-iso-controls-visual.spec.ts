import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { PUBLIC_RIGHT_SIDEBAR_ROUTE_URL_HEADER_TEST_ID } from "../src/components/PublicRightSidebar";
import { APP_BUILD_STATUS_BAR_TEST_ID } from "../src/lib/appBuild";
import { LOCAL_STORAGE_ROUTE } from "../src/lib/localStorageRoute";

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

  return [
    png.data[index],
    png.data[index + 1],
    png.data[index + 2],
    png.data[index + 3],
  ] as const;
}

test("logo iso controls sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo/iso?isoSide=6", {
    waitUntil: "domcontentloaded",
  });

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
  const linksSidebar = page.getByTestId("workspace-layout-v2-pane-right");
  const routeUrlHeader = linksSidebar.getByTestId(
    PUBLIC_RIGHT_SIDEBAR_ROUTE_URL_HEADER_TEST_ID,
  );
  const publicLinks = linksSidebar.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);

  await expect(controlsSidebar).toBeVisible();
  await expect(
    controlsSidebar.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID),
  ).toHaveCount(0);
  await expect(linksSidebar).toBeVisible();
  await expect(routeUrlHeader.getByTestId("route-url-display")).toHaveAttribute(
    "title",
    "/logo",
  );
  await expect(routeUrlHeader.getByTestId("route-url-display")).toHaveText(
    "/logo",
  );
  await expect(
    publicLinks.getByRole("link", { name: "/home", exact: true }),
  ).toHaveAttribute("href", "/");
  await expect(
    publicLinks.getByRole("link", { name: LOCAL_STORAGE_ROUTE, exact: true }),
  ).toHaveCount(0);
  await expect(
    publicLinks.getByRole("link", { name: "/terms", exact: true }),
  ).toHaveAttribute("href", "/terms");
  await expect(
    publicLinks.getByRole("link", { name: "/privacy", exact: true }),
  ).toHaveAttribute("href", "/privacy");
  await expect(
    publicLinks.getByRole("link", { name: "?light", exact: true }),
  ).toHaveAttribute("href", "/logo?light");
  await expect(
    publicLinks.getByRole("link", { name: "?dark", exact: true }),
  ).toHaveAttribute("href", "/logo?dark");
  await expect(publicLinks).toHaveScreenshot(
    "logo-right-sidebar-meta-section.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.03,
      scale: "css",
    },
  );
});

test("logo public query links toggle root theme mode", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo?dev", {
    waitUntil: "domcontentloaded",
  });

  const linksSidebar = page.getByTestId("workspace-layout-v2-pane-right");
  const publicLinks = linksSidebar.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);

  await publicLinks.getByRole("link", { name: "?light", exact: true }).click();
  await expect(page).toHaveURL(/\/logo\?dev&light$/);
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(
    publicLinks.getByRole("link", { name: "?-light", exact: true }),
  ).toBeVisible();

  await publicLinks.getByRole("link", { name: "?dark", exact: true }).click();
  await expect(page).toHaveURL(/\/logo\?dev&dark$/);
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(
    publicLinks.getByRole("link", { name: "?-dark", exact: true }),
  ).toBeVisible();

  await publicLinks.getByRole("link", { name: "?-dark", exact: true }).click();
  await expect(page).toHaveURL(/\/logo\?dev$/);
  await expect(
    publicLinks.getByRole("link", { name: "?light", exact: true }),
  ).toBeVisible();
  await expect(
    publicLinks.getByRole("link", { name: "?dark", exact: true }),
  ).toBeVisible();
});

test("logo public query links repaint the three scene theme colors", async ({
  page,
}) => {
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
  await expect(page).toHaveURL(/\/logo\?dev&dark$/);
  await waitForPaint(page);

  const darkPixel = await sampleLogoCanvasCorner(page);

  expect(lightPixel).toEqual([255, 255, 255, 255]);
  expect(darkPixel).toEqual([57, 68, 71, 255]);
});

test("logo public query color overrides repaint the three scene base color", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo?dev&light&base=%23112233", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.locator("canvas").first()).toBeVisible();
  await waitForPaint(page);

  expect(await sampleLogoCanvasCorner(page)).toEqual([17, 34, 51, 255]);
});

test("logo public query links cancel conflicting root theme modes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo?dev&light&dark", {
    waitUntil: "domcontentloaded",
  });

  await expect(page).toHaveURL(/\/logo\?dev$/);
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

test("logo recursive depth renders a static rotatable Three scene", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo?depth=3&rot=45", {
    waitUntil: "domcontentloaded",
  });

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  const canvas = page.locator("canvas").first();

  await expect(canvas).toBeVisible();
  await expect(controlsSidebar.getByLabel("Depth value")).toHaveValue("3");
  await expect(
    controlsSidebar.getByRole("button", { name: "Add" }),
  ).toHaveCount(0);
  await expect(
    controlsSidebar.getByRole("button", { name: "Start shuffle" }),
  ).toHaveCount(0);
  await controlsSidebar.getByRole("button", { name: "SVG" }).click();
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return `${url.pathname}:${url.searchParams.get("depth")}`;
    })
    .toBe("/logo/svg:3");
  await page.goBack({ waitUntil: "domcontentloaded" });

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

test("logo depth slider clears default depth from the URL", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo?depth=3&rot=45", {
    waitUntil: "domcontentloaded",
  });

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");

  await expect(controlsSidebar.getByLabel("Depth value")).toHaveValue("3");
  await controlsSidebar.getByLabel("Depth slider").fill("1");
  await expect(controlsSidebar.getByLabel("Depth value")).toHaveValue("1");
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return url.searchParams.has("depth");
    })
    .toBe(false);
});

test("logo iso controls mobile boot", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/logo/iso?isoSide=6", {
    waitUntil: "domcontentloaded",
  });

  const workspace = page.locator('[data-workspace-layout-v2="mobile"]');
  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  await expect(workspace).toHaveAttribute("data-mobile-pane", "left");
  await expect(controlsSidebar).toContainText("Cube side");
  await expect(controlsSidebar).toContainText("6px");
  await expect(page.getByRole("button", { name: "Controls" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Preview" })).toHaveCount(0);
});

test("logo view mobile header button reopens the controls sidebar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/logo?elev=215.3", {
    waitUntil: "domcontentloaded",
  });

  const workspace = page.locator('[data-workspace-layout-v2="mobile"]');
  const carousel = page.getByTestId("workspace-layout-v2-pane-main");
  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  const mainHeader = page.getByTestId("logo-preview-main-header");
  const controlsToggle = page.getByRole("button", {
    name: "Toggle sidebar",
  });

  await expect(workspace).toHaveAttribute("data-mobile-pane", "left");
  await expect(controlsSidebar).toContainText("Pages");

  await carousel.evaluate((element) => {
    element.scrollLeft = 256;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect(workspace).toHaveAttribute("data-mobile-pane", "main");
  await expect(controlsToggle).toBeVisible();

  await expect(mainHeader).toHaveScreenshot("logo-mobile-main-header.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });

  await controlsToggle.click();
  await expect(workspace).toHaveAttribute("data-mobile-pane", "left");
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

test("logo view button groups wrap to one per row in the default rail", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo?elev=144.7", {
    waitUntil: "domcontentloaded",
  });

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  const addButton = controlsSidebar.getByRole("button", { name: "Add" });
  const removeButton = controlsSidebar.getByRole("button", { name: "Remove" });
  const cubeAxisButton = controlsSidebar.getByRole("button", {
    name: "Cube axis",
  });
  const verticalButton = controlsSidebar.getByRole("button", {
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

  if (
    addBox === null ||
    removeBox === null ||
    cubeAxisBox === null ||
    verticalBox === null
  ) {
    throw new Error("Expected the logo view buttons to be visible.");
  }

  expect(removeBox.y).toBeGreaterThan(addBox.y);
  expect(verticalBox.y).toBeGreaterThan(cubeAxisBox.y);
});

test("logo view color selection applies Tailwind colors to the Three scene", async ({
  page,
}) => {
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

  await primaryColorPopover
    .getByRole("button", { name: "Sky family", exact: true })
    .click();
  await expect(page).toHaveURL(/primary=sky-500/);

  await primaryColorPopover
    .getByRole("button", { name: "Red family", exact: true })
    .click();
  await expect(page).toHaveURL(/primary=red-500/);

  await primaryColorPopover
    .getByRole("button", { name: "Red 600", exact: true })
    .click();
  await expect(page).toHaveURL(/primary=red-600/);

  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  });

  await expect(primaryColorPopover).toHaveScreenshot(
    "logo-color-picker-popover.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.01,
      scale: "css",
    },
  );

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

test("logo view desktop header toggle collapses and reopens the sidebar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo?elev=215.3", {
    waitUntil: "domcontentloaded",
  });

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  const leftToggle = page.getByRole("button", {
    name: "Toggle sidebar",
  });

  await expect(leftToggle).toBeVisible();
  await expect(controlsSidebar).toContainText("Pages");

  await leftToggle.click();
  await expect
    .poll(async () =>
      controlsSidebar.evaluate((element) =>
        Math.round(element.getBoundingClientRect().width),
      ),
    )
    .toBe(0);

  await leftToggle.click();
  await expect
    .poll(async () =>
      controlsSidebar.evaluate((element) =>
        Math.round(element.getBoundingClientRect().width),
      ),
    )
    .toBeGreaterThan(200);
});
