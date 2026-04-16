import { expect, test } from "@playwright/test";

test("unknown routes render the routed not-found page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/missing", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const content = page.getByTestId("not-found-route-content");
  await expect(content).toBeVisible();
  await expect(content).toContainText("Page not found");
  await expect(content).toContainText("/missing");
  await expect(page.getByRole("link", { name: "Go home" })).toBeVisible();
});

test("missing published-file routes show the waitlist state instead of the generic 404", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/p/octo/repo/main/missing-demo.md", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const content = page.getByTestId("published-file-unavailable-content");
  await expect(content).toBeVisible();
  await expect(content).toContainText("This file is not public");
  await expect(content).toContainText("/p/octo/repo/main/missing-demo.md");
  await expect(content).toContainText("Join Waitlist");
  await expect(content).toHaveScreenshot("published-file-unavailable.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});
