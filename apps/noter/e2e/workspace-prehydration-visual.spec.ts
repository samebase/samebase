import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import type { WorkspaceSidebarState } from "../convex/workspaceSidebarStateModel";
import {
  APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
  APP_WORKSPACE_SIDEBAR_STORAGE_VERSION,
} from "../src/lib/appWorkspaceSidebarPreferences";
import { expectScreenshotsToMatch } from "./visualDiff";

const MOBILE_VIEWPORT_SIZE = {
  height: 844,
  width: 390,
};
const EDGE_CAPTURE_LEFT_INSET_PX = 1;
const EDGE_CAPTURE_WIDTH_PX = 3;
const EDGE_CAPTURE_HEIGHT_PX = 240;
const MOBILE_RIGHT_PANE_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: 240,
  leftMobileWidthPx: 240,
  mobilePane: "right",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: true,
  rightDesktopWidthPx: 288,
  rightMobileWidthPx: 288,
} satisfies WorkspaceSidebarState;

async function seedWorkspaceSidebarState(page: Page, state: WorkspaceSidebarState) {
  await page.addInitScript(
    ({ storageKey, storageVersion, workspaceSidebarState }) => {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          state: workspaceSidebarState,
          version: storageVersion,
        }),
      );
    },
    {
      storageKey: APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
      storageVersion: APP_WORKSPACE_SIDEBAR_STORAGE_VERSION,
      workspaceSidebarState: state,
    },
  );
}

async function blockHydrationScripts(page: Page) {
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "script") {
      await route.continue();
      return;
    }

    await route.fulfill({
      body: "",
      contentType: "text/javascript",
      status: 200,
    });
  });
}

async function waitForFonts(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function openMobileWorkspacePage({
  browser,
  hydrate,
}: {
  browser: Browser;
  hydrate: boolean;
}) {
  const page = await browser.newPage({
    viewport: MOBILE_VIEWPORT_SIZE,
  });
  await seedWorkspaceSidebarState(page, MOBILE_RIGHT_PANE_STATE);
  if (!hydrate) {
    await blockHydrationScripts(page);
  }

  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });
  await waitForFonts(page);
  await expect(page.locator('[data-workspace-layout-v2="responsive"]').first()).toHaveAttribute(
    "data-mobile-pane",
    "right",
  );
  if (hydrate) {
    await expect(page.getByTestId("workspace-layout-v2-pane-main")).toHaveAttribute(
      "data-workspace-layout-v2-measured",
      "",
    );
  }

  return page;
}

async function captureRightPaneLeadingEdge(page: Page) {
  const rightPaneBox = await page.getByTestId("workspace-layout-v2-pane-right").boundingBox();
  if (rightPaneBox === null) {
    throw new Error("Expected the right workspace pane to have a bounding box.");
  }

  const viewportSize = page.viewportSize();
  if (viewportSize === null) {
    throw new Error("Expected the page to have a viewport size.");
  }

  const clipX = Math.max(0, Math.floor(rightPaneBox.x) - EDGE_CAPTURE_LEFT_INSET_PX);
  const clipWidth = Math.min(EDGE_CAPTURE_WIDTH_PX, viewportSize.width - clipX);

  return page.screenshot({
    animations: "disabled",
    caret: "hide",
    clip: {
      // The public sidebar body can legitimately change after the app bundle
      // runs. A pane-position jump still moves this top boundary and its controls.
      height: Math.min(EDGE_CAPTURE_HEIGHT_PX, viewportSize.height),
      width: clipWidth,
      x: clipX,
      y: 0,
    },
    scale: "css",
  });
}

test("mobile workspace prehydration paints the sidebar edge exactly like hydration", async ({
  browser,
}, testInfo: TestInfo) => {
  const prehydratedPage = await openMobileWorkspacePage({
    browser,
    hydrate: false,
  });
  const hydratedPage = await openMobileWorkspacePage({
    browser,
    hydrate: true,
  });

  try {
    const prehydratedScreenshot = await captureRightPaneLeadingEdge(prehydratedPage);
    const hydratedScreenshot = await captureRightPaneLeadingEdge(hydratedPage);

    await expectScreenshotsToMatch({
      actual: prehydratedScreenshot,
      artifactPrefix: "workspace-mobile-prehydration-edge",
      artifactWritePaths: {
        actual: testInfo.outputPath("workspace-mobile-prehydration-edge-prehydrated.png"),
        diff: testInfo.outputPath("workspace-mobile-prehydration-edge-diff.png"),
        diffMask: testInfo.outputPath("workspace-mobile-prehydration-edge-diff-mask.png"),
        expected: testInfo.outputPath("workspace-mobile-prehydration-edge-hydrated.png"),
      },
      expected: hydratedScreenshot,
      maxDiffPixelRatio: 0,
      pixelmatchOptions: {
        includeAA: true,
        threshold: 0,
      },
      testInfo,
    });
  } finally {
    await prehydratedPage.close();
    await hydratedPage.close();
  }
});
