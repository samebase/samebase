import { expect, test, type Page } from "@playwright/test";

const appBootFailureDesktopScenario = {
  mode: "app-boot-failure-stale",
  heading: "Samebase updated while this tab was open.",
  description:
    "This device is still trying to load older app files. Reload first. If that does not recover, reset the saved browser data for Samebase on this device.",
  errorMessage: "Failed to fetch dynamically imported module",
} as const;

const appBootFailureMobileScenario = {
  mode: "app-boot-failure-generic",
  heading: "Samebase could not finish loading.",
  description:
    "The app hit an unexpected startup error. Reload first. If it keeps happening, reset the saved browser data for Samebase on this device.",
  errorMessage: "Unexpected token",
} as const;

async function captureAppBootFailureVisual(
  page: Page,
  scenario: {
    mode: string;
    heading: string;
    description: string;
    errorMessage: string;
  },
  expectedButtonLayout: "row" | "stack",
) {
  await page.goto(`/visual-fixture?mode=${scenario.mode}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const recoveryLabel = page.getByText("App Recovery");
  const heading = page.getByRole("heading", {
    level: 1,
    name: scenario.heading,
  });
  const description = page.getByText(scenario.description);
  const reloadButton = page.getByRole("button", { name: "Reload app" });
  const resetButton = page.getByRole("button", { name: "Reset local data" });
  const warning = page.getByText(
    "Reset local data clears saved browser storage for Samebase on this device and may sign you out.",
  );
  const build = page.getByText(/^Build:/);
  const error = page.getByText(`Error: ${scenario.errorMessage}`);

  await expect(recoveryLabel).toBeVisible();
  await expect(heading).toBeVisible();
  await expect(description).toBeVisible();
  await expect(reloadButton).toBeVisible();
  await expect(resetButton).toBeVisible();
  await expect(warning).toBeVisible();
  await expect(build).toBeVisible();
  await expect(error).toBeVisible();

  const reloadBox = await reloadButton.boundingBox();
  const resetBox = await resetButton.boundingBox();

  if (reloadBox === null || resetBox === null) {
    throw new Error("Expected recovery action buttons to have bounding boxes.");
  }

  if (expectedButtonLayout === "row") {
    expect(Math.abs(reloadBox.y - resetBox.y)).toBeLessThanOrEqual(1);
    expect(resetBox.x).toBeGreaterThan(reloadBox.x + reloadBox.width / 2);
    return;
  }

  expect(Math.abs(reloadBox.x - resetBox.x)).toBeLessThanOrEqual(1);
  expect(resetBox.y).toBeGreaterThan(reloadBox.y + reloadBox.height / 2);
}

test("app boot failure visual fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  await captureAppBootFailureVisual(page, appBootFailureDesktopScenario, "row");
});

test("app boot failure visual fixture (mobile)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await captureAppBootFailureVisual(page, appBootFailureMobileScenario, "stack");
});
