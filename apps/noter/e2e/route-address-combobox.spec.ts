import { expect, test, type Locator, type Page } from "@playwright/test";

async function openRouteAddressCombobox(page: Page): Promise<Locator> {
  await page.goto("/research/route-address-combobox", {
    waitUntil: "domcontentloaded",
  });

  const input = page.getByTestId("route-address-combobox-input");
  await expect(input).toBeVisible();

  return input;
}

async function readRouteAddressPrefix(page: Page): Promise<string> {
  return page.evaluate(() => `${window.location.origin}/`);
}

async function setInputSelection(
  input: Locator,
  selection: {
    end: number;
    start: number;
  },
): Promise<void> {
  await input.evaluate((element, nextSelection) => {
    if (!(element instanceof HTMLInputElement)) {
      throw new Error("Expected route address combobox input.");
    }

    element.setSelectionRange(nextSelection.start, nextSelection.end);
  }, selection);
}

async function expectInputSelection(input: Locator, position: number): Promise<void> {
  await expect(input).toHaveJSProperty("selectionStart", position);
  await expect(input).toHaveJSProperty("selectionEnd", position);
}

async function expectNoPageErrorDuring(page: Page, action: () => Promise<void>): Promise<void> {
  const errors: Error[] = [];
  const rememberError = (error: Error) => {
    errors.push(error);
  };

  page.on("pageerror", rememberError);
  try {
    await action();
    await page.waitForTimeout(0);
  } finally {
    page.off("pageerror", rememberError);
  }

  expect(errors.map((error) => error.message)).toEqual([]);
}

async function focusRouteAddressInput(page: Page) {
  const input = await openRouteAddressCombobox(page);
  const prefix = await readRouteAddressPrefix(page);
  const focusedInputValue = `${prefix}research/route-address-combobox?`;

  await input.click();
  await expect(input).toHaveValue(focusedInputValue);

  return {
    focusedInputValue,
    input,
    prefix,
  };
}

test("route address combobox keeps the prefix visible when Backspace deletes a selection that crosses it", async ({
  page,
}) => {
  const { focusedInputValue, input, prefix } = await focusRouteAddressInput(page);

  const selectionEnd = prefix.length + 3;
  await setInputSelection(input, {
    end: selectionEnd,
    start: 5,
  });

  await expectNoPageErrorDuring(page, () => input.press("Backspace"));

  expect(focusedInputValue.slice(selectionEnd)).toBe("earch/route-address-combobox?");
  await expect(input).toHaveValue(`${prefix}earch/route-address-combobox?`);
  await expectInputSelection(input, prefix.length);
});

test("route address combobox ignores Backspace at the protected prefix boundary", async ({
  page,
}) => {
  const { focusedInputValue, input, prefix } = await focusRouteAddressInput(page);

  await setInputSelection(input, {
    end: prefix.length,
    start: prefix.length,
  });

  await expectNoPageErrorDuring(page, () => input.press("Backspace"));

  await expect(input).toHaveValue(focusedInputValue);
  await expectInputSelection(input, prefix.length);
});

test("route address combobox clamps modifier Backspace to the route boundary", async ({ page }) => {
  const { input, prefix } = await focusRouteAddressInput(page);

  await setInputSelection(input, {
    end: prefix.length + "research/route-address-combobox?".length,
    start: prefix.length + "research/route-address-combobox?".length,
  });

  await expectNoPageErrorDuring(page, () => input.press("ControlOrMeta+Backspace"));

  await expect(input).toHaveValue(prefix);
  await expectInputSelection(input, prefix.length);
});

test("route address combobox keeps the prefix visible when Delete removes a selection that crosses it", async ({
  page,
}) => {
  const { input, prefix } = await focusRouteAddressInput(page);

  await setInputSelection(input, {
    end: prefix.length + 3,
    start: 5,
  });

  await expectNoPageErrorDuring(page, () => input.press("Delete"));

  await expect(input).toHaveValue(`${prefix}earch/route-address-combobox?`);
  await expectInputSelection(input, prefix.length);
});

test("route address combobox cuts only route text when Cut crosses the prefix and preserves undo", async ({
  page,
}) => {
  const { focusedInputValue, input, prefix } = await focusRouteAddressInput(page);

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: await page.evaluate(() => window.location.origin),
  });
  const selectionStart = 5;
  const selectionEnd = prefix.length + 3;
  await setInputSelection(input, {
    end: selectionEnd,
    start: selectionStart,
  });

  await expectNoPageErrorDuring(page, () => input.press("ControlOrMeta+X"));

  await expect(input).toHaveValue(`${prefix}earch/route-address-combobox?`);
  await expectInputSelection(input, prefix.length);
  await expect(page.evaluate(() => navigator.clipboard.readText())).resolves.toBe("res");

  await expectNoPageErrorDuring(page, () => input.press("ControlOrMeta+Z"));

  await expect(input).toHaveValue(focusedInputValue);
  await expect(input).toHaveJSProperty("selectionStart", prefix.length);
  await expect(input).toHaveJSProperty("selectionEnd", selectionEnd);
});

test("route address combobox replaces only route text when typing over a selection that crosses the prefix", async ({
  page,
}) => {
  const { input, prefix } = await focusRouteAddressInput(page);

  await setInputSelection(input, {
    end: prefix.length + 3,
    start: 5,
  });

  await expectNoPageErrorDuring(page, () => input.press("x"));

  await expect(input).toHaveValue(`${prefix}xearch/route-address-combobox?`);
  await expectInputSelection(input, prefix.length + 1);
});

test("route address combobox replaces only route text when pasting over a selection that crosses the prefix", async ({
  page,
}) => {
  const { input, prefix } = await focusRouteAddressInput(page);

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: await page.evaluate(() => window.location.origin),
  });
  await page.evaluate(() => navigator.clipboard.writeText("route"));
  await setInputSelection(input, {
    end: prefix.length + 3,
    start: 5,
  });

  await expectNoPageErrorDuring(page, () => input.press("ControlOrMeta+V"));

  await expect(input).toHaveValue(`${prefix}routeearch/route-address-combobox?`);
  await expectInputSelection(input, prefix.length + "route".length);
});
