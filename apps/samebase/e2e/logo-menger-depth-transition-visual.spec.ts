import { expect, test, type Page } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";

test.setTimeout(120_000);

async function waitForPaint(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  });
}

test("Menger sponge moves from depth one to depth two", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/logo/transition/menger");

  const transitionPage = page.getByTestId("logo-menger-depth-transition-page");
  const scene = page.getByTestId("logo-menger-depth-transition-scene");
  const progress = page.getByLabel("Transition progress");

  await expect(scene.locator("canvas")).toBeVisible();
  await expect(transitionPage).toHaveAttribute("data-phase", "depth-2");

  await page.getByRole("button", { name: "Replay transition" }).click();
  await expect(transitionPage).toHaveAttribute("data-phase", "transition");
  await expect(transitionPage).toHaveAttribute("data-phase", "depth-2");

  await progress.fill("0");
  await expect(progress).toHaveValue("0");
  await expect(transitionPage).toHaveAttribute("data-phase", "depth-1");
  await waitForPaint(page);

  await expect(scene).toHaveScreenshot("logo-menger-depth-transition-depth-one.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
  });

  await progress.fill("500");
  await expect(progress).toHaveValue("500");
  await expect(transitionPage).toHaveAttribute("data-phase", "transition");
  await waitForPaint(page);

  await expect(scene).toHaveScreenshot("logo-menger-depth-transition-midpoint.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    scale: "css",
  });
});
