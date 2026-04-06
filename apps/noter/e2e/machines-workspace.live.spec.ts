import { expect, test, type Page } from "@playwright/test";
import { dispatchHumanTouchSwipe } from "./touchGestures";

const MOBILE_PANE_TRANSITION_WAIT_MS = 220;

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

  await expect(page.getByTestId("machines-workspace")).toBeVisible();
  await expect(page.getByTestId("machines-workspace-shell")).toBeVisible();
}

async function swipeFromMainToLeft(page: Page): Promise<void> {
  await dispatchHumanTouchSwipe(
    page,
    page.getByTestId("workspace-layout-v2-pane-main"),
    {
      startX: 80,
      startY: 220,
      steps: [
        { delayMs: 25, xOffset: 72, yOffset: 2 },
        { delayMs: 30, xOffset: 168, yOffset: 4 },
        { delayMs: 30, xOffset: 260, yOffset: 5 },
        { delayMs: 25, xOffset: 320, yOffset: 6 },
      ],
    },
  );
}

async function swipeFromRightToMain(page: Page): Promise<void> {
  await dispatchHumanTouchSwipe(
    page,
    page.getByTestId("workspace-layout-v2-pane-right"),
    {
      startX: 12,
      startY: 40,
      steps: [
        { delayMs: 25, xOffset: 72, yOffset: 2 },
        { delayMs: 30, xOffset: 168, yOffset: 4 },
        { delayMs: 30, xOffset: 260, yOffset: 5 },
        { delayMs: 25, xOffset: 320, yOffset: 6 },
      ],
    },
  );
}

async function ensureLeftPaneOpen(page: Page): Promise<void> {
  const shell = page.getByTestId("machines-workspace-shell");
  const initialPane = await shell.getAttribute("data-mobile-pane");

  if (initialPane === "right") {
    await swipeFromRightToMain(page);
    await expect(shell).toHaveAttribute("data-mobile-pane", "main");
    await page.waitForTimeout(MOBILE_PANE_TRANSITION_WAIT_MS);
  }

  if (initialPane !== "left") {
    await swipeFromMainToLeft(page);
  }

  await expect(shell).toHaveAttribute("data-mobile-pane", "left");
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

  const shell = page.getByTestId("machines-workspace-shell");
  await ensureLeftPaneOpen(page);
  await page.reload({
    waitUntil: "networkidle",
  });
  await ensureMachinesRouteReady(page);
  await expect(shell).toHaveAttribute("data-mobile-pane", "left");
});
