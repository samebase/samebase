import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("appending a final markdown link does not duplicate the previous last line", async ({
  page,
}) => {
  await page.goto("/visual-fixture?mode=deleted-markdown-link");
  await page.waitForLoadState("networkidle");

  const xUrl = page.locator("text=https://x.com/matteocollina/status/2033590124919787819");
  await expect(xUrl).toHaveCount(1);
  await expect(page.locator(".cm-changedLine")).toContainText("https://tree.md/");

  const visibleDeletedChunks = await page
    .locator(".cm-deletedChunk")
    .evaluateAll(
      (elements) =>
        elements.filter((element) => window.getComputedStyle(element).display !== "none").length,
    );
  expect(visibleDeletedChunks).toBe(0);

  const renderedUrl = page
    .locator(".cm-url")
    .filter({
      hasText: "https://x.com/matteocollina/status/2033590124919787819",
    })
    .first();
  await expect(renderedUrl).toContainText("https://x.com/matteocollina/status/2033590124919787819");

  const renderedUrlStyles = await renderedUrl.evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      cursor: styles.cursor,
      textDecorationLine: styles.textDecorationLine,
    };
  });

  expect(renderedUrlStyles.cursor).toBe("pointer");
  expect(renderedUrlStyles.textDecorationLine).toBe("underline");
});

test("adding only a trailing newline still renders a visible diff", async ({ page }) => {
  await page.goto("/visual-fixture?mode=trailing-newline-only");
  await page.waitForLoadState("networkidle");

  const xUrlCount = await page
    .locator("text=https://x.com/matteocollina/status/2033590124919787819")
    .count();
  expect(xUrlCount).toBeGreaterThan(0);

  const visibleDeletedChunks = await page
    .locator(".cm-deletedChunk")
    .evaluateAll(
      (elements) =>
        elements.filter((element) => window.getComputedStyle(element).display !== "none").length,
    );
  const changedLineCount = await page.locator(".cm-changedLine").count();

  expect(visibleDeletedChunks + changedLineCount).toBeGreaterThan(0);
});
