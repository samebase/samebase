import { expect, test, type Page } from "@playwright/test";

async function ensureMachinesRouteReady(page: Page): Promise<void> {
  const autofillButton = page.getByRole("button", {
    name: "Autofill & sign in",
  });

  try {
    await autofillButton.waitFor({ state: "visible", timeout: 5_000 });
    await autofillButton.click();
  } catch {
    // The page may already be authenticated and rendering the machines shell.
  }

  await expect(page.locator('[data-sidebar-shell="mobile"]')).toBeVisible();
}

test("mobile machines route keeps the left sidebar open after reload", async ({
  page,
}) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width >= 768, "mobile-only repro");

  await page.goto("/machines", {
    waitUntil: "domcontentloaded",
  });
  await ensureMachinesRouteReady(page);

  const shell = page.locator('[data-sidebar-shell="mobile"]');
  const leftTrigger = page.locator(
    '[data-sidebar="trigger"][data-side="left"]',
  );
  const initialPane = await shell.getAttribute("data-mobile-pane");
  if (initialPane !== "left") {
    await leftTrigger.click();
  }

  await expect(shell).toHaveAttribute("data-mobile-pane", "left");
  await page.reload({
    waitUntil: "networkidle",
  });
  await expect(shell).toHaveAttribute("data-mobile-pane", "left");
});
