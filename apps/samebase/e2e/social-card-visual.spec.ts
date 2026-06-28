import { expect, test } from "./visualFixtureTest";

const strictScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0,
  maxDiffPixels: 0,
} as const;

type SocialCardMetric = {
  metric: string | null;
  rightMargin: number;
};

function readRightMargin(metrics: readonly SocialCardMetric[], metricKey: string) {
  const metric = metrics.find((candidate) => candidate.metric === metricKey);
  if (!metric) {
    throw new Error(`Expected social card metric ${metricKey}.`);
  }

  return metric.rightMargin;
}

test("social card visual fixture renders the generated SVG", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/visual-fixture?mode=social-card", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const card = page.getByTestId("social-card-rendered-svg");
  await expect(card).toBeVisible();

  const metrics: SocialCardMetric[] = await card.evaluate((element) => {
    const measuredMetrics: SocialCardMetric[] = [];

    for (const metricElement of element.querySelectorAll("[data-social-card-metric]")) {
      if (!(metricElement instanceof SVGGraphicsElement)) {
        continue;
      }

      const metric = metricElement.getAttribute("data-social-card-metric");
      const box = metricElement.getBBox();
      const right = Math.round(box.x + box.width);
      measuredMetrics.push({
        metric,
        rightMargin: 1200 - right,
      });
    }

    return measuredMetrics;
  });

  const siteNameRightMargin = readRightMargin(metrics, "site-name");
  const taglineLineOneRightMargin = readRightMargin(metrics, "tagline-line-one");
  const taglineLineTwoRightMargin = readRightMargin(metrics, "tagline-line-two");

  expect(siteNameRightMargin).toBeGreaterThanOrEqual(120);
  expect(siteNameRightMargin).toBeLessThanOrEqual(140);
  expect(taglineLineOneRightMargin).toBeGreaterThanOrEqual(300);
  expect(taglineLineTwoRightMargin).toBeGreaterThanOrEqual(300);
  expect(Math.abs(taglineLineOneRightMargin - taglineLineTwoRightMargin)).toBeLessThanOrEqual(40);

  await expect(card).toHaveScreenshot("social-card.png", strictScreenshotOptions);
});
