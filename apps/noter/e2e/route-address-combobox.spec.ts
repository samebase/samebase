import { expect, test, type Locator, type Page } from "@playwright/test";

async function openRouteAddressCombobox(page: Page): Promise<Locator> {
  await page.goto("/research/route-address-combobox", {
    waitUntil: "domcontentloaded",
  });

  const input = page.getByTestId("route-address-combobox-input");
  await expect(input).toBeVisible();

  return input;
}

test("route address combobox keeps the prefix visible when Backspace deletes a selection that crosses it", async ({
  page,
}) => {
  const input = await openRouteAddressCombobox(page);
  const prefix = await page.evaluate(() => `${window.location.origin}/`);

  await input.click();
  await expect(input).toHaveValue(`${prefix}research/route-address-combobox?`);

  const selectionEnd = prefix.length + 3;
  await input.evaluate((element, nextSelectionEnd) => {
    if (!(element instanceof HTMLInputElement)) {
      throw new Error("Expected route address combobox input.");
    }

    element.setSelectionRange(5, nextSelectionEnd);
  }, selectionEnd);

  await input.press("Backspace");

  await expect(input).toHaveValue(`${prefix}earch/route-address-combobox?`);
});
