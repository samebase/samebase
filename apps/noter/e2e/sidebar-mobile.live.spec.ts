import { expect, type Page, test } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";

const WORKSPACE_FILE_ROUTE = "/vault/noter-md/noter/main/README.md";

async function goToWorkspace(page: Page) {
  await page.goto("/?dev", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page);
  await page.goto(WORKSPACE_FILE_ROUTE, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: "Toggle Sidebar" }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
}

async function getSidebarTranslateX(page: Page) {
  return page
    .locator('[data-sidebar="sidebar"][data-mobile="true"]')
    .evaluate((element) => {
      const transform = window.getComputedStyle(element).transform;
      if (transform === "none") {
        return 0;
      }

      const matrixMatch = transform.match(/^matrix\((.+)\)$/);
      if (!matrixMatch) {
        throw new Error(`Unsupported transform: ${transform}`);
      }

      const values = matrixMatch[1]?.split(",").map((value) => Number(value));
      const translateX = values?.[4];
      if (translateX === undefined || Number.isNaN(translateX)) {
        throw new Error(`Missing translateX in transform: ${transform}`);
      }

      return translateX;
    });
}

async function expectSidebarVisibility(page: Page, visible: boolean) {
  await expect
    .poll(
      async () =>
        page
          .locator('[data-sidebar="sidebar"][data-mobile="true"]')
          .getAttribute("aria-hidden"),
      {
        timeout: 10_000,
      },
    )
    .toBe(visible ? "false" : "true");
}

test.describe("mobile workspace sidebar live flow", () => {
  test("tap opens and closes the workspace sidebar on mobile", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-mobile",
      "This live check targets the mobile Chromium project.",
    );

    await goToWorkspace(page);
    await expectSidebarVisibility(page, false);
    await expect
      .poll(async () => getSidebarTranslateX(page))
      .toBeLessThan(-250);

    await page.getByRole("button", { name: "Toggle Sidebar" }).tap();

    await expectSidebarVisibility(page, true);
    await expect
      .poll(async () => getSidebarTranslateX(page))
      .toBeGreaterThan(-2);

    await page.keyboard.press("Escape");

    await expectSidebarVisibility(page, false);
    await expect
      .poll(async () => getSidebarTranslateX(page))
      .toBeLessThan(-250);
  });

  test("edge drag reveals the workspace sidebar before release", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-mobile",
      "This live check targets the mobile Chromium project.",
    );

    await goToWorkspace(page);
    await expectSidebarVisibility(page, false);
    await expect
      .poll(async () => getSidebarTranslateX(page))
      .toBeLessThan(-250);

    await page.mouse.move(8, 220);
    await page.mouse.down();
    await page.mouse.move(180, 220, { steps: 8 });

    await expect
      .poll(async () => getSidebarTranslateX(page))
      .toBeGreaterThan(-250);

    await page.mouse.up();

    await expectSidebarVisibility(page, true);
    await expect
      .poll(async () => getSidebarTranslateX(page))
      .toBeGreaterThan(-2);
  });
});
