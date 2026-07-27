import { expect, test } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";

test.setTimeout(120_000);

test("Menger hover settles the pointer-driven 3D reveal", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/logo/hover/menger");

  const hoverPage = page.getByTestId("logo-menger-hover-page");
  const controls = page.getByTestId("logo-menger-hover-controls");
  const scene = page.getByTestId("logo-menger-hover-scene");

  await expect(controls).toBeVisible();
  await expect(scene.locator("canvas")).toBeVisible();
  await expect(hoverPage).toHaveAttribute("data-menger-research-mode", "hover");

  const sceneBox = await scene.boundingBox();
  if (!sceneBox) {
    throw new Error("The Menger hover scene must have a bounding box.");
  }

  await page.mouse.move(sceneBox.x + sceneBox.width * 0.42, sceneBox.y + sceneBox.height * 0.55);
  await expect(scene).toHaveAttribute("data-hover-coordinate-x", /.+/);
  await expect(scene).toHaveAttribute("data-hover-coordinate-y", /.+/);
  await expect(scene).toHaveAttribute("data-hover-coordinate-z", /.+/);
  await expect(scene).toHaveAttribute("data-hover-settled", "true");

  await expect(scene).toHaveScreenshot("logo-menger-hover-left-face.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
    timeout: 15_000,
  });
});
