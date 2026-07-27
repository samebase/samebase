import { expect, test } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";

test.setTimeout(120_000);

test("Menger hover maps the pointer to one closed proxy face", async ({ page }) => {
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
  await expect(scene).toHaveAttribute("data-hover-face", "+Z");
  await expect(scene).toHaveAttribute("data-hover-coordinate-a", /.+/);
  await expect(scene).toHaveAttribute("data-hover-coordinate-b", /.+/);

  await expect(scene).toHaveScreenshot("logo-menger-hover-left-face.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
    timeout: 15_000,
  });
});
