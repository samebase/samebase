import { expect, test } from "@playwright/test";
import { SAMEBASE_PUBLIC_LINKS } from "../src/lib/publicLinks";

test("the public links page lists each short Samebase path", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/links?prod-ui", { waitUntil: "networkidle" });

  const linksPage = page.getByTestId("public-links-page");
  await expect(linksPage.getByRole("heading", { name: "/links" })).toBeVisible();

  for (const link of Object.values(SAMEBASE_PUBLIC_LINKS)) {
    await expect(
      linksPage.getByRole("link", { name: `${link.path} ${link.label}` }),
    ).toHaveAttribute("href", link.path);
  }

  await expect(page.getByTestId("workspace-layout-v2-pane-main")).toHaveScreenshot(
    "public-links-page.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
      timeout: 30_000,
    },
  );
});

test("each short Samebase path redirects to its official destination", async ({ request }) => {
  for (const link of Object.values(SAMEBASE_PUBLIC_LINKS)) {
    const response = await request.get(link.path, { maxRedirects: 0 });

    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toBe(link.destination);
  }
});
