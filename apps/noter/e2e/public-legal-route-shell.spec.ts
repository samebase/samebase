import { expect, test, type Page } from "@playwright/test";

async function readTermsRouteState(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Terms of Service" }),
  ).toBeVisible();
  await expect(page.locator("#root .cm-static-markdown")).toBeVisible();

  return await page.evaluate(() => ({
    hasRoutedRoot: document.querySelector("#root main") !== null,
    hasStandaloneLegalShell:
      document.querySelector(".legal-shell") !== null ||
      document.body.textContent?.includes(
        "Generated from the noter markdown source",
      ) === true,
    headingClassName:
      document.querySelector("#root h1")?.getAttribute("class") ?? null,
    title: document.title,
  }));
}

test("direct terms loads use the same routed app surface as client navigation", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "/terms", exact: true }).first().click();
  await expect(page).toHaveURL(/\/terms$/);
  const clientNavigationState = await readTermsRouteState(page);

  await page.goto("/terms", { waitUntil: "networkidle" });
  const directLoadState = await readTermsRouteState(page);

  expect(directLoadState).toEqual(clientNavigationState);
  expect(directLoadState.hasRoutedRoot).toBe(true);
  expect(directLoadState.hasStandaloneLegalShell).toBe(false);
  expect(directLoadState.title).toBe("Terms of Service | noter");
});
