import { expect, test } from "@playwright/test";
import {
  PUBLIC_LANDING_LOGO_SCENE_TEST_ID,
  PUBLIC_LANDING_LOGO_TEST_ID,
} from "../src/lib/publicLandingLogo";
import { PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID } from "../src/lib/publicLanding";

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
  const logoCanvas = logoScene.locator("canvas");
  await expect(logoCanvas).toHaveAttribute("data-logo-recursive-move-depth", "2");
  await expect(logoCanvas).toHaveAttribute("data-logo-recursive-move-layer-counts", "1,20");
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
});

test("signed-out protected routes keep auth in the right sidebar", async ({ page }) => {
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
  await expect(content.getByRole("link")).toHaveCount(1);
  await expect(page.getByTestId(PUBLIC_LANDING_LOGO_SCENE_TEST_ID)).toHaveAttribute(
    "data-state",
    "ready",
  );
  await expect(
    page
      .getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID)
      .getByText("Sign in or create an account", { exact: true }),
  ).toBeVisible();
  await expect(content).toHaveScreenshot("not-found-signed-out-protected.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.1,
    scale: "css",
  });
});

test("failed Google signup on a protected route keeps feedback in the right sidebar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/new-app?signup=google", { waitUntil: "networkidle" });

  await expect(page).toHaveURL(/\/new-app\?signup=google$/u);
  await expect(page.getByTestId("not-found-route-content")).toBeVisible();
  const accountSection = page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID);
  await expect(accountSection.getByText("The app is still internal.")).toBeVisible();
  await expect(accountSection.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
  await expect(accountSection.locator("input")).toHaveCount(0);
  await expect(accountSection).toHaveScreenshot("not-found-protected-google-signup-closed.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.1,
    scale: "css",
  });
});
