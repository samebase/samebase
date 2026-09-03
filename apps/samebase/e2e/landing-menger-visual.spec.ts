import { expect, test } from "@playwright/test";

test("landing Menger logo starts and reacts to the pointer @webgpu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const hero = page.getByTestId("landing-preview-hero-menger");
  const scene = hero.getByTestId("logo-menger-hover-scene");

  await expect(hero).toBeVisible({ timeout: 30_000 });
  await expect(scene).toHaveAttribute("data-renderer", "typegpu-ray-march");
  await expect(scene).toHaveAttribute("data-renderer-state", "ready", { timeout: 60_000 });
  await expect(hero).toHaveAttribute("data-state", "ready");
  await expect(scene.locator("canvas")).toBeVisible();

  const sceneBox = await scene.boundingBox();
  if (!sceneBox) {
    throw new Error("The landing Menger logo must have a bounding box.");
  }
  await page.mouse.move(sceneBox.x + sceneBox.width / 2, sceneBox.y + sceneBox.height / 2);
  await expect
    .poll(async () => Number(await scene.getAttribute("data-hover-maximum-openness")))
    .toBeGreaterThan(0);
});
