import { devices, expect, test } from "@playwright/test";

const screenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0.03,
} as const;

test("account deletion running timeline", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/visual-fixture?mode=account-deletion-running", {
    waitUntil: "networkidle",
  });

  const status = page.getByTestId("account-deletion-page");
  await expect(status).toContainText("Check billing");
  const vaults = status.locator('[data-account-deletion-data-group="vaultsAndStagedChanges"]');
  await expect(vaults.locator(".animate-spin")).toBeVisible();
  await expect(vaults).toContainText("1 vault deleted");
  await expect(vaults).toContainText("Deleting staged changes");
  await expect(status).toHaveScreenshot("account-deletion-running-desktop.png", screenshotOptions);
});

test("account deletion running timeline on mobile", async ({ browser }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("Playwright baseURL is required for the mobile account deletion visual.");
  }
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    baseURL,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    await page.goto("/visual-fixture?mode=account-deletion-running", {
      waitUntil: "networkidle",
    });
    const status = page.getByTestId("account-deletion-page");
    await expect(status).toContainText("Check billing");
    const vaults = status.locator('[data-account-deletion-data-group="vaultsAndStagedChanges"]');
    await expect(vaults.locator(".animate-spin")).toBeVisible();
    await expect(vaults).toContainText("1 vault deleted");
    await expect(vaults).toContainText("Deleting staged changes");
    await expect(status).toHaveScreenshot("account-deletion-running-mobile.png", screenshotOptions);
  } finally {
    await context.close();
  }
});

test("account deletion attention timeline", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/visual-fixture?mode=account-deletion-attention", {
    waitUntil: "networkidle",
  });

  const status = page.getByTestId("account-deletion-page");
  await expect(status).toContainText("Check billing");
  await expect(
    status.getByRole("heading", { name: "Account deletion needs attention" }),
  ).toBeVisible();
  const vaults = status.locator('[data-account-deletion-data-group="vaultsAndStagedChanges"]');
  await expect(vaults.locator(".animate-spin")).toHaveCount(0);
  await expect(vaults).toContainText("1 vault deleted");
  await expect(vaults).toContainText("Stopped while deleting staged changes");
  await expect(status).toHaveScreenshot(
    "account-deletion-attention-desktop.png",
    screenshotOptions,
  );
});

test("account deletion attention timeline on mobile", async ({ browser }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("Playwright baseURL is required for the mobile account deletion visual.");
  }
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    baseURL,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    await page.goto("/visual-fixture?mode=account-deletion-attention", {
      waitUntil: "networkidle",
    });
    const status = page.getByTestId("account-deletion-page");
    await expect(status).toContainText("Check billing");
    await expect(
      status.getByRole("heading", { name: "Account deletion needs attention" }),
    ).toBeVisible();
    const vaults = status.locator('[data-account-deletion-data-group="vaultsAndStagedChanges"]');
    await expect(vaults.locator(".animate-spin")).toHaveCount(0);
    await expect(vaults).toContainText("1 vault deleted");
    await expect(vaults).toContainText("Stopped while deleting staged changes");
    await expect(status).toHaveScreenshot(
      "account-deletion-attention-mobile.png",
      screenshotOptions,
    );
  } finally {
    await context.close();
  }
});
