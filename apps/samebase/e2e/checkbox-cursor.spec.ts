import { expect, test } from "./visualFixtureTest";

test("checkbox controls use interactive cursor affordances", async ({ page }) => {
  await page.goto("/visual-fixture?mode=vault-dashboard-delete-open", {
    waitUntil: "networkidle",
  });

  await expect(page.locator('label[for="remove-convex-provision"]')).toHaveCSS("cursor", "pointer");

  await page.goto("/visual-fixture?mode=file-view-compare-sidebar", {
    waitUntil: "networkidle",
  });

  await expect(page.getByRole("checkbox").first()).toHaveCSS("cursor", "not-allowed");
  await expect(page.locator('label[for="fixture-compare-show-patch"]')).toHaveCSS(
    "cursor",
    "not-allowed",
  );

  const nativeInputCursors = await page.evaluate(() => {
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.id = "native-enabled-checkbox";
    const enabledLabel = document.createElement("label");
    enabledLabel.htmlFor = enabled.id;
    enabledLabel.textContent = "Native enabled";

    const disabled = document.createElement("input");
    disabled.type = "checkbox";
    disabled.id = "native-disabled-checkbox";
    disabled.disabled = true;
    const disabledLabel = document.createElement("label");
    disabledLabel.htmlFor = disabled.id;
    disabledLabel.textContent = "Native disabled";

    const wrappedLabel = document.createElement("label");
    const wrappedInput = document.createElement("input");
    wrappedInput.type = "checkbox";
    wrappedLabel.append(wrappedInput, "Native wrapped");

    document.body.append(enabled, enabledLabel, disabled, disabledLabel, wrappedLabel);

    return {
      enabled: window.getComputedStyle(enabled).cursor,
      enabledLabel: window.getComputedStyle(enabledLabel).cursor,
      disabled: window.getComputedStyle(disabled).cursor,
      disabledLabel: window.getComputedStyle(disabledLabel).cursor,
      wrappedLabel: window.getComputedStyle(wrappedLabel).cursor,
    };
  });

  expect(nativeInputCursors).toEqual({
    enabled: "pointer",
    enabledLabel: "pointer",
    disabled: "not-allowed",
    disabledLabel: "not-allowed",
    wrappedLabel: "pointer",
  });
});
