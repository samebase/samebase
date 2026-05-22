import { expect, test } from "@playwright/test";

test("route URL editor fixture navigates committed same-origin hrefs", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 360 });
  await page.goto("/visual-fixture?mode=route-url-editor", {
    waitUntil: "domcontentloaded",
  });

  const input = page.getByTestId("route-url-editor-input");
  const currentHref = page.getByTestId("route-url-editor-fixture-current-href");

  await expect(input).toHaveValue("/visual-fixture?mode=route-url-editor&draft=pwa#address");
  await expect(currentHref).toHaveText("/visual-fixture?mode=route-url-editor&draft=pwa#address");

  await input.fill("/visual-fixture?mode=route-url-editor&draft=edited#done");
  await input.press("Enter");

  await expect(input).toHaveValue("/visual-fixture?mode=route-url-editor&draft=edited#done");
  await expect(currentHref).toHaveText("/visual-fixture?mode=route-url-editor&draft=edited#done");
});

test("route URL editor fixture rejects external origins", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 360 });
  await page.goto("/visual-fixture?mode=route-url-editor", {
    waitUntil: "domcontentloaded",
  });

  const input = page.getByTestId("route-url-editor-input");
  const currentHref = page.getByTestId("route-url-editor-fixture-current-href");

  await input.fill("https://example.com/noter");
  await input.press("Enter");

  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(currentHref).toHaveText("/visual-fixture?mode=route-url-editor&draft=pwa#address");
});
