import { expect, test } from "@playwright/test";
import { APP_BUILD_STATUS_BAR_TEST_ID } from "../src/lib/appBuild";

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
  const publicLinks = linksSidebar.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);

  await expect(controlsSidebar).toBeVisible();
  await expect(
    controlsSidebar.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID),
  ).toHaveCount(0);
  await expect(linksSidebar).toBeVisible();
  await expect(
    publicLinks.getByRole("link", { name: "/home", exact: true }),
  ).toHaveAttribute("href", "/?dev");
  await expect(
    publicLinks.getByRole("link", { name: "/terms", exact: true }),
  ).toHaveAttribute("href", "/terms?dev");
  await expect(
    publicLinks.getByRole("link", { name: "/privacy", exact: true }),
  ).toHaveAttribute("href", "/privacy?dev");
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
  const leftColorPicker = controlsSidebar.getByRole("button", {
    name: "Left color picker",
  });

  await leftColorPicker.click();
  const leftColorPopover = page.getByTestId("logo-color-picker-left");
  await expect(leftColorPopover).toBeVisible();

  await leftColorPopover.getByLabel("Left custom color").fill("#ff00cc");
  await expect(page).toHaveURL(/leftColor=%23ff00cc/);
  await expect(leftColorPicker).toContainText("#ff00cc");

  await leftColorPopover
    .getByRole("button", { name: "Sky family", exact: true })
    .click();
  await expect(page).toHaveURL(/leftColor=sky-500/);

  await leftColorPopover
    .getByRole("button", { name: "Red family", exact: true })
    .click();
  await expect(page).toHaveURL(/leftColor=red-500/);

  await leftColorPopover
    .getByRole("button", { name: "Red 600", exact: true })
    .click();
  await expect(page).toHaveURL(/leftColor=red-600/);

  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  });

  await expect(leftColorPopover).toHaveScreenshot(
    "logo-color-picker-popover.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.01,
      scale: "css",
    },
  );

  await page.keyboard.press("Escape");
  await expect(leftColorPopover).toBeHidden();
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
