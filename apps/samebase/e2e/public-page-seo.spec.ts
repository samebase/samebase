import { expect, test, type Page } from "@playwright/test";
import { prerenderPages } from "../prerender.config";
import { MCP_CONSENT_PAGE_METADATA, NOT_FOUND_PAGE_METADATA } from "../src/lib/pageMetadata";
import { MCP_CONSENT_APP_PATH } from "../shared/mcpOAuth";

// Without JavaScript, the page keeps the head of the HTML that the response carried: the
// prerendered file, or the server render.
test.use({ javaScriptEnabled: false });

async function readHead(page: Page) {
  return {
    title: await page.title(),
    description: await page.locator('meta[name="description"]').getAttribute("content"),
    robots: await page.locator('meta[name="robots"]').getAttribute("content"),
    canonical: await page.locator('link[rel="canonical"]').getAttribute("href"),
  };
}

for (const { path, expectedMetadata } of prerenderPages) {
  test(`the HTML of prerendered ${path} carries its metadata`, async ({ page }) => {
    const response = await page.goto(path);

    expect(response?.status()).toBe(200);
    expect(await readHead(page)).toEqual({
      title: expectedMetadata.title,
      description: expectedMetadata.description,
      robots: expectedMetadata.robots,
      canonical: new URL(path, "https://samebase.com").toString(),
    });
  });
}

test("the server render of the MCP consent page carries its metadata", async ({ page }) => {
  const response = await page.goto(MCP_CONSENT_APP_PATH);

  expect(response?.status()).toBe(200);
  expect(await readHead(page)).toEqual({
    title: MCP_CONSENT_PAGE_METADATA.title,
    description: MCP_CONSENT_PAGE_METADATA.description,
    robots: MCP_CONSENT_PAGE_METADATA.robots,
    canonical: new URL(MCP_CONSENT_APP_PATH, "https://samebase.com").toString(),
  });
});

test("the server answers an unknown path with a 404 page that asks for no index", async ({
  page,
}) => {
  const response = await page.goto("/no-such-samebase-page");

  expect(response?.status()).toBe(404);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  expect(await page.title()).toBe(NOT_FOUND_PAGE_METADATA.title);
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toBe(
    NOT_FOUND_PAGE_METADATA.robots,
  );
});
