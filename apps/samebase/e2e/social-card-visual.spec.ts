import { expect, test } from "./visualFixtureTest";
import { SOCIAL_CARD_HEIGHT, SOCIAL_CARD_WIDTH } from "../src/components/socialLogoAssets";

const strictScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0,
  maxDiffPixels: 0,
} as const;

test("social card visual fixture renders the generated PNG", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/visual-fixture?mode=social-card", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const card = page.getByTestId("social-card-generated-png");
  await expect(card).toBeVisible();
  await expect(card).toHaveJSProperty("naturalWidth", SOCIAL_CARD_WIDTH);
  await expect(card).toHaveJSProperty("naturalHeight", SOCIAL_CARD_HEIGHT);

  await expect(card).toHaveScreenshot("social-card.png", strictScreenshotOptions);
});
