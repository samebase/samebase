import { expect, test, type Locator, type Page } from "@playwright/test";

async function openRouteUrlEditor(page: Page): Promise<Locator> {
  await page.goto("/privacy", {
    waitUntil: "domcontentloaded",
  });

  const input = page.getByTestId("route-url-editor-display");
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
      throw new Error("Expected route URL editor input.");
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
  const displayInput = await openRouteUrlEditor(page);
  const prefix = await readRouteAddressPrefix(page);
  const focusedInputValue = `${prefix}privacy?`;

  await displayInput.evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) {
      throw new Error("Expected route URL editor display input.");
    }

    element.blur();
  });
  await displayInput.focus();
  const input = page.getByTestId("route-url-editor-input");
  await expect(input).toHaveValue(focusedInputValue);

  return {
    focusedInputValue,
    input,
    prefix,
  };
}

test("route URL editor keeps the prefix visible when Backspace deletes a selection that crosses it", async ({
  page,
}) => {
  const { focusedInputValue, input, prefix } = await focusRouteAddressInput(page);

  const selectionEnd = prefix.length + 3;
  await setInputSelection(input, {
    end: selectionEnd,
    start: 5,
  });

  await expectNoPageErrorDuring(page, () => input.press("Backspace"));

  expect(focusedInputValue.slice(selectionEnd)).toBe("vacy?");
  await expect(input).toHaveValue(`${prefix}vacy?`);
  await expectInputSelection(input, prefix.length);
});

test("route URL editor ignores Backspace at the protected prefix boundary", async ({ page }) => {
  const { focusedInputValue, input, prefix } = await focusRouteAddressInput(page);

  await setInputSelection(input, {
    end: prefix.length,
    start: prefix.length,
  });

  await expectNoPageErrorDuring(page, () => input.press("Backspace"));

  await expect(input).toHaveValue(focusedInputValue);
  await expectInputSelection(input, prefix.length);
});

test("route URL editor keeps focus and advances the cursor after selecting suggestions", async ({
  page,
}) => {
  const { input, prefix } = await focusRouteAddressInput(page);

  await input.press("ControlOrMeta+ArrowLeft");
  await page.getByRole("option", { exact: true, name: "/logo" }).click();

  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${prefix}logo?`);
  await expectInputSelection(input, `${prefix}logo?`.length);
  await expect(page.getByRole("option", { exact: true, name: "?top=" })).toBeVisible();

  await page.getByRole("option", { exact: true, name: "?top=" }).click();

  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${prefix}logo?top=`);
  await expectInputSelection(input, `${prefix}logo?top=`.length);
  await expect(page.getByRole("option", { exact: true, name: "blue-" })).toBeVisible();

  await page.getByRole("option", { exact: true, name: "blue-" }).click();

  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${prefix}logo?top=blue-`);
  await expectInputSelection(input, `${prefix}logo?top=blue-`.length);
  await expect(page.getByRole("option", { exact: true, name: "blue-200" })).toBeVisible();

  await page.getByRole("option", { exact: true, name: "blue-200" }).click();

  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${prefix}logo?top=blue-200&`);
  await expectInputSelection(input, `${prefix}logo?top=blue-200&`.length);
  await expect(page.getByRole("option", { exact: true, name: "&secondary=" })).toBeVisible();
});

test("route URL editor clamps modifier Backspace to the route boundary", async ({ page }) => {
  const { input, prefix } = await focusRouteAddressInput(page);

  await setInputSelection(input, {
    end: prefix.length + "privacy?".length,
    start: prefix.length + "privacy?".length,
  });

  await expectNoPageErrorDuring(page, () => input.press("ControlOrMeta+Backspace"));

  await expect(input).toHaveValue(prefix);
  await expectInputSelection(input, prefix.length);
});

test("route URL editor keeps the prefix visible when Delete removes a selection that crosses it", async ({
  page,
}) => {
  const { input, prefix } = await focusRouteAddressInput(page);

  await setInputSelection(input, {
    end: prefix.length + 3,
    start: 5,
  });

  await expectNoPageErrorDuring(page, () => input.press("Delete"));

  await expect(input).toHaveValue(`${prefix}vacy?`);
  await expectInputSelection(input, prefix.length);
});

test("route URL editor cuts only route text when Cut crosses the prefix and preserves undo", async ({
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

  await expect(input).toHaveValue(`${prefix}vacy?`);
  await expectInputSelection(input, prefix.length);
  await expect(page.evaluate(() => navigator.clipboard.readText())).resolves.toBe("pri");

  await expectNoPageErrorDuring(page, () => input.press("ControlOrMeta+Z"));

  await expect(input).toHaveValue(focusedInputValue);
  await expect(input).toHaveJSProperty("selectionStart", prefix.length);
  await expect(input).toHaveJSProperty("selectionEnd", selectionEnd);
});

test("route URL editor replaces only route text when typing over a selection that crosses the prefix", async ({
  page,
}) => {
  const { input, prefix } = await focusRouteAddressInput(page);

  await setInputSelection(input, {
    end: prefix.length + 3,
    start: 5,
  });

  await expectNoPageErrorDuring(page, () => input.press("x"));

  await expect(input).toHaveValue(`${prefix}xvacy?`);
  await expectInputSelection(input, prefix.length + 1);
});

test("route URL editor replaces only route text when pasting over a selection that crosses the prefix", async ({
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

  await expect(input).toHaveValue(`${prefix}routevacy?`);
  await expectInputSelection(input, prefix.length + "route".length);
});
