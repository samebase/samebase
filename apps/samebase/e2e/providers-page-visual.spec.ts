import { expect, test } from "./visualFixtureTest";

test("providers page connected fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1400 });
  await page.goto("/visual-fixture?mode=providers-page-connected", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("provider-connections-page")).toHaveScreenshot(
    "providers-page-connected.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});

test("providers page MCP client grants", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/visual-fixture?mode=providers-page-connected", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("region", { name: "MCP clients" })).toHaveScreenshot(
    "providers-page-mcp-clients-mobile.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});
