import { expect, test, type Page } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";

async function ensureMachinesRouteReady(page: Page): Promise<void> {
  await signInIfNeeded(page, "/machines");
  await expect(page.locator("[data-workspace-layout-v2]")).toBeVisible();
}

async function scrollWorkspaceCarouselToPane(page: Page, pane: "left" | "main" | "right") {
  await page.getByTestId("workspace-layout-v2-pane-main").evaluate((element, nextPane) => {
    const mainPane = element.querySelector(".snap-center");
    if (!(mainPane instanceof HTMLElement)) {
      throw new Error("Expected mobile carousel main pane.");
    }
    const panePeekPx = Number.parseFloat(window.getComputedStyle(element).paddingLeft);

    element.scrollLeft =
      nextPane === "left"
        ? panePeekPx
        : nextPane === "main"
          ? mainPane.offsetLeft - panePeekPx
          : element.scrollWidth - element.clientWidth;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  }, pane);

  await expect(page.locator("[data-workspace-layout-v2]")).toHaveAttribute(
    "data-mobile-pane",
    pane,
  );
}

test("mobile machines route keeps the left sidebar open after reload", async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width >= 768, "mobile-only repro");

  await page.goto("/machines", {
    waitUntil: "domcontentloaded",
  });
  await ensureMachinesRouteReady(page);

  const shell = page.locator("[data-workspace-layout-v2]");
  const leftPaneBox = await page.getByTestId("workspace-layout-v2-pane-left").boundingBox();
  test.skip(
    leftPaneBox === null || leftPaneBox.width < 1,
    "Machines route has no left sidebar in this live environment.",
  );

  const initialPane = await shell.getAttribute("data-mobile-pane");
  if (initialPane !== "left") {
    await scrollWorkspaceCarouselToPane(page, "left");
  }

  await expect(shell).toHaveAttribute("data-mobile-pane", "left");
  await page.reload({
    waitUntil: "networkidle",
  });
  await expect(shell).toHaveAttribute("data-mobile-pane", "left");
});
