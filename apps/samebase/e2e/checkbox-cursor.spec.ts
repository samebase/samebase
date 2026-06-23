import { expect, test } from "./visualFixtureTest";

test("checkbox controls use interactive cursor affordances", async ({ page }) => {
  await page.goto("/visual-fixture?mode=vault-branch-filters", {
    waitUntil: "networkidle",
  });

  await page.getByRole("button", { name: "Filters" }).click();
  await expect(page.getByRole("checkbox").first()).toHaveCSS("cursor", "pointer");

  await page.goto("/visual-fixture?mode=file-view-compare-sidebar", {
    waitUntil: "networkidle",
  });

  await expect(page.getByRole("checkbox").first()).toHaveCSS("cursor", "not-allowed");

  const nativeInputCursors = await page.evaluate(() => {
    const enabled = document.createElement("input");
    enabled.type = "checkbox";

    const disabled = document.createElement("input");
    disabled.type = "checkbox";
    disabled.disabled = true;

    document.body.append(enabled, disabled);

    return {
      enabled: window.getComputedStyle(enabled).cursor,
      disabled: window.getComputedStyle(disabled).cursor,
    };
  });

  expect(nativeInputCursors).toEqual({
    enabled: "pointer",
    disabled: "not-allowed",
  });
});
