import { expect, test } from "@playwright/test";
import {
  PUBLIC_LANDING_LOGO_SCENE_TEST_ID,
  PUBLIC_LANDING_LOGO_TEST_ID,
} from "../src/lib/publicLandingLogo";
import { PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID } from "../src/lib/publicLanding";
import { MENGER_SPONGE_VOXEL_STATE } from "../src/components/logo/logoVoxelState";

test("unknown routes render the animated not-found page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/missing", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const content = page.getByTestId("not-found-route-content");
  await expect(content).toBeVisible();
  await expect(content).toContainText("Page not available");
  await expect(content).not.toContainText("This page isn't available.");
  await expect(content).not.toContainText("/missing");
  await expect(content.getByRole("link", { exact: true, name: "/landing" })).toBeVisible();
  await expect(page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID)).toBeVisible();

  const logoScene = page.getByTestId(PUBLIC_LANDING_LOGO_SCENE_TEST_ID);
  await expect(logoScene).toHaveAttribute("data-state", "ready");
  const initialRotationDegrees = await logoScene.getAttribute("data-rotation-degrees");
  expect(initialRotationDegrees).not.toBeNull();
  if (initialRotationDegrees === null) {
    throw new Error("Expected the not-found logo rotation.");
  }

  await expect
    .poll(
      async () => (await logoScene.getAttribute("data-rotation-degrees")) ?? initialRotationDegrees,
    )
    .not.toBe(initialRotationDegrees);

  const logoLink = content.getByRole("link", { exact: true, name: "play with this logo" });
  await expect(logoLink).toBeVisible();
  await logoLink.click();
  await expect(page).toHaveURL(/\/logo\?/);

  const logoUrl = new URL(page.url());
  expect(logoUrl.pathname).toBe("/logo");
  expect(logoUrl.searchParams.has("auto-rotate")).toBe(true);
  expect(logoUrl.searchParams.has("auto-shuffle")).toBe(true);
  expect(logoUrl.searchParams.get("depth")).toBe("2");
  expect(logoUrl.searchParams.get("shuffleMoves")).toBe("1");
  expect(logoUrl.searchParams.get("vox")).toBe(MENGER_SPONGE_VOXEL_STATE);
  expect(logoUrl.searchParams.get("primary")).not.toBeNull();
  expect(logoUrl.searchParams.get("secondary")).not.toBeNull();
  expect(logoUrl.searchParams.get("top")).not.toBeNull();
});

test("signed-out protected routes keep auth in the right sidebar", async ({ page }) => {
  await page.addInitScript(() => {
    const randomValues = [0, 0.625, 0.2] as const;
    const random = Math.random;
    let randomIndex = 0;
    Math.random = () => {
      const value = randomValues[randomIndex];
      randomIndex += 1;
      if (value !== undefined) {
        if (randomIndex === randomValues.length) {
          Math.random = random;
        }
        return value;
      }
      return random();
    };
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/new-app", { waitUntil: "networkidle" });

  const content = page.getByTestId("not-found-route-content");
  await expect(content).toBeVisible();
  await expect(content).toContainText("Page not available");
  await expect(content).not.toContainText("This page isn't available.");
  await expect(content).not.toContainText("/new-app");
  await expect(content.getByRole("link", { exact: true, name: "/landing" })).toBeVisible();
  await expect(content.getByTestId("public-landing-content")).toHaveCount(0);
  await expect(content.getByPlaceholder("you@example.com")).toHaveCount(0);
  await expect(content.getByPlaceholder("Password")).toHaveCount(0);
  await expect(
    page
      .getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID)
      .getByRole("button", { name: "not logged in" }),
  ).toBeVisible();
  await expect(content).toHaveScreenshot("not-found-signed-out-protected.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.03,
    scale: "css",
  });
});
