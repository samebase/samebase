import { expect, test } from "@playwright/test";

async function getTranslateX(page: import("@playwright/test").Page) {
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

test("mobile sidebar reveals before pointer release", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto(
    "/visual-fixture.html?mode=dashboard-shared-sidebar-mobile-chat",
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");

  await expect.poll(async () => getTranslateX(page)).toBeLessThanOrEqual(-250);

  await page.mouse.move(8, 220);
  await page.mouse.down();
  await page.mouse.move(180, 220, { steps: 8 });

  await expect.poll(async () => getTranslateX(page)).toBeGreaterThan(-250);

  await page.mouse.up();

  await expect.poll(async () => getTranslateX(page)).toBeGreaterThan(-2);
});
