import { devices, expect, test, type Page } from "@playwright/test";

const { defaultBrowserType: _pixel7BrowserType, ...pixel7Device } =
  devices["Pixel 7"];

async function gotoFileViewFixture(page: Page) {
  await page.goto("/visual-fixture.html?mode=fileview-layout-persistence", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
}

async function scrollFileViewCarouselToPane(
  page: Page,
  pane: "left" | "main" | "right",
) {
  await page
    .getByTestId("workspace-layout-v2-pane-main")
    .evaluate((element, nextPane) => {
      const paneIndex = nextPane === "left" ? 0 : nextPane === "main" ? 1 : 2;
      element.scrollLeft = element.clientWidth * paneIndex;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    }, pane);

  await expect(page.locator("[data-mobile-pane]").first()).toHaveAttribute(
    "data-mobile-pane",
    pane,
  );
}

async function getFixtureViewportClip(page: Page) {
  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  const bounds = await fixture.boundingBox();

  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error(
      "Expected fileview layout fixture bounds for screenshot clip",
    );
  }

  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(
      Math.min(bounds.height, page.viewportSize()?.height ?? 0),
    ),
  };
}

test("fileview desktop shell with right tree", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/visual-fixture.html?mode=fileview-layout", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  await expect(
    page.getByRole("button", { name: "Open bottom panel" }),
  ).toHaveCount(0);

  await expect(fixture).toHaveScreenshot(
    "fileview-layout-shell-right-tree.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});

test.describe("fileview mobile", () => {
  test.use({
    ...pixel7Device,
  });

  test("carousel keeps the visible main surface unobscured when the right pane is open", async ({
    page,
  }) => {
    await gotoFileViewFixture(page);

    const header = page.getByTestId("fileview-layout-header");

    await scrollFileViewCarouselToPane(page, "right");

    await expect(page.getByTestId("workspace-sidebar-main-scrim")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("fileview-layout-body-button")).toBeVisible();
    await expect
      .poll(async () =>
        header.evaluate(
          (element) => window.getComputedStyle(element).scrollSnapStop,
        ),
      )
      .toBe("always");

    await expect(page).toHaveScreenshot(
      "fileview-layout-mobile-sidebar-open.png",
      {
        animations: "disabled",
        caret: "hide",
        clip: await getFixtureViewportClip(page),
        fullPage: false,
        scale: "css",
        maxDiffPixelRatio: 0.03,
      },
    );
  });
});
