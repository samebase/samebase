import { expect, test } from "./visualFixtureTest";

const SCENARIOS = [
  {
    mode: "inline",
    snapshotName: "commit-review-inline.png",
  },
  {
    mode: "deleted",
    snapshotName: "commit-review-deleted.png",
  },
  {
    mode: "unchanged",
    snapshotName: "commit-review-unchanged.png",
  },
] as const;

for (const scenario of SCENARIOS) {
  test(`commit review fixture (${scenario.mode})`, async ({ page }) => {
    await page.goto(`/visual-fixture?mode=${scenario.mode}`);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForLoadState("networkidle");
    const fixture = page.getByTestId("commit-review-visual-fixture");
    await expect(fixture).toHaveScreenshot(scenario.snapshotName, {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    });
  });
}

test("commit review conflict split responds to pane width", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/visual-fixture?mode=conflict");
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("commit-review-visual-fixture");
  const mainPane = page.getByTestId("commit-review-visual-main-pane");
  const conflictSplit = page.getByTestId("commit-review-conflict-split");
  const beforePanel = conflictSplit.getByText("Base -> Yours", { exact: true }).locator("..");
  const afterPanel = conflictSplit.getByText("Base -> Upstream", { exact: true }).locator("..");

  await fixture.evaluate((element) => {
    element.style.width = "900px";
  });
  await expect
    .poll(async () => (await mainPane.boundingBox())?.width ?? Infinity)
    .toBeLessThan(768);
  await expect
    .poll(async () => {
      const [beforeBox, afterBox] = await Promise.all([
        beforePanel.boundingBox(),
        afterPanel.boundingBox(),
      ]);
      if (beforeBox === null || afterBox === null) {
        return false;
      }

      return afterBox.y >= beforeBox.y + beforeBox.height;
    })
    .toBe(true);
  await expect(fixture).toHaveScreenshot("commit-review-conflict-narrow.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });

  await fixture.evaluate((element) => {
    element.style.width = "";
  });
  await expect.poll(async () => (await mainPane.boundingBox())?.width ?? 0).toBeGreaterThan(768);
  await expect
    .poll(async () => {
      const [beforeBox, afterBox] = await Promise.all([
        beforePanel.boundingBox(),
        afterPanel.boundingBox(),
      ]);
      if (beforeBox === null || afterBox === null) {
        return false;
      }

      return Math.abs(afterBox.y - beforeBox.y) <= 1 && afterBox.x >= beforeBox.x + beforeBox.width;
    })
    .toBe(true);
  await expect(fixture).toHaveScreenshot("commit-review-conflict.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("commit review fixture exposes deleted sidebar revert action", async ({ page }) => {
  await page.goto("/visual-fixture?mode=deleted");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForLoadState("networkidle");

  const sidebar = page.getByTestId("commit-review-visual-sidebar");
  await sidebar.getByText("components.json", { exact: true }).click({
    button: "right",
  });

  await expect(page.getByRole("button", { name: "Revert deletion" })).toBeVisible();
  await expect(page).toHaveScreenshot("commit-review-deleted-sidebar-context-menu.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test.describe("mobile commit review fixture", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });

  test("exposes deleted sidebar revert action", async ({ page }) => {
    await page.goto("/visual-fixture?mode=deleted");
    await page.waitForLoadState("networkidle");

    const deletedFile = page
      .getByTestId("commit-review-visual-sidebar")
      .getByText("components.json", { exact: true });

    await deletedFile.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const touch = new Touch({
        identifier: 1,
        target: element,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        pageX: rect.left + rect.width / 2,
        pageY: rect.top + rect.height / 2,
        screenX: rect.left + rect.width / 2,
        screenY: rect.top + rect.height / 2,
        radiusX: 2,
        radiusY: 2,
        rotationAngle: 0,
        force: 1,
      });

      element.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          cancelable: true,
          touches: [touch],
          targetTouches: [touch],
          changedTouches: [touch],
        }),
      );
    });
    await page.waitForTimeout(600);
    await deletedFile.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const touch = new Touch({
        identifier: 1,
        target: element,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        pageX: rect.left + rect.width / 2,
        pageY: rect.top + rect.height / 2,
        screenX: rect.left + rect.width / 2,
        screenY: rect.top + rect.height / 2,
        radiusX: 2,
        radiusY: 2,
        rotationAngle: 0,
        force: 1,
      });

      element.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          cancelable: true,
          touches: [],
          targetTouches: [],
          changedTouches: [touch],
        }),
      );
    });

    await expect(page.getByRole("button", { name: "Revert deletion" })).toBeVisible();
    await expect(page).toHaveScreenshot("commit-review-deleted-sidebar-context-menu-mobile.png", {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    });
  });
});

test("commit review fixture renders deleted staged changes popup", async ({ page }) => {
  await page.goto("/visual-fixture?mode=deleted-staged-changes");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("commit-review-staged-changes-trigger")).toBeVisible();
  await expect(page.getByTestId("commit-review-staged-changes-popover")).toBeVisible();
  const deletedAgentsFile = page.getByRole("button", { name: "AGENTS.md" });
  await expect(deletedAgentsFile).toBeVisible();
  await expect(page.getByTestId("commit-review-visual-fixture")).toHaveScreenshot(
    "commit-review-deleted-staged-changes.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );

  await deletedAgentsFile.click();
  await expect(page.getByTestId("commit-review-staged-changes-location")).toContainText(
    "/vault/samebase/samebase/fs/main/AGENTS.md?diff",
  );
});
