import { expect, test } from "@playwright/test";

const SCREENSHOT_OPTIONS = {
  animations: "disabled",
  caret: "hide",
  maxDiffPixelRatio: 0.001,
  scale: "css",
  timeout: 60_000,
} as const;

test("TypeGPU Menger keeps a static fallback without WebGPU", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: undefined,
    });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/logo/webgpu/menger", { waitUntil: "domcontentloaded" });

  const scene = page.getByTestId("logo-menger-webgpu-scene");
  const canvas = scene.locator("canvas");
  await expect(scene).toHaveAttribute("data-renderer-state", "unavailable");
  await expect(canvas).toHaveAttribute("data-renderer-error", /WebGPU/);
  await expect(canvas).toHaveCSS("cursor", "auto");
  await expect(scene.locator("img")).toHaveAttribute("src", /^data:image\/svg\+xml/);
  await expect(scene.getByRole("status")).toHaveText(
    "WebGPU is not available. The static logo is shown.",
  );
  await expect(scene).toHaveScreenshot(
    "logo-menger-webgpu-static-fallback.png",
    SCREENSHOT_OPTIONS,
  );
});
