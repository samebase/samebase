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
