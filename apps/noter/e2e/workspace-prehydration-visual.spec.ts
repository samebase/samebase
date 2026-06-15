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
const EDGE_CAPTURE_TOP_PX = 80;
const EDGE_CAPTURE_HEIGHT_PX = 160;

type MobilePrehydrationVisualScenario = {
  edgePane: "left" | "right";
  id: string;
  mobilePane: "left" | "right";
  state: WorkspaceSidebarState;
};

const MOBILE_PREHYDRATION_VISUAL_SCENARIOS = [
  {
    edgePane: "right",
    id: "unmerged-right",
    mobilePane: "right",
    state: {
      leftDesktopOpen: true,
      leftDesktopWidthPx: 240,
      leftMobileWidthPx: 240,
      mobilePane: "right",
      mobileSurface: { kind: "unmerged" },
      rightDesktopOpen: true,
      rightDesktopWidthPx: 288,
      rightMobileWidthPx: 288,
    },
  },
  {
    edgePane: "right",
    id: "merged-right",
    mobilePane: "right",
    state: {
      leftDesktopOpen: true,
      leftDesktopWidthPx: 240,
      leftMobileWidthPx: 240,
      mobilePane: "right",
      mobileSurface: {
        kind: "merged",
        mainWidthPx: 294,
        side: "right",
      },
      rightDesktopOpen: true,
      rightDesktopWidthPx: 96,
      rightMobileWidthPx: 96,
    },
  },
  {
    edgePane: "left",
    id: "merged-left",
    mobilePane: "left",
    state: {
      leftDesktopOpen: true,
      leftDesktopWidthPx: 96,
      leftMobileWidthPx: 96,
      mobilePane: "left",
      mobileSurface: {
        kind: "merged",
        mainWidthPx: 294,
        side: "left",
      },
      rightDesktopOpen: true,
      rightDesktopWidthPx: 288,
      rightMobileWidthPx: 288,
    },
  },
] satisfies MobilePrehydrationVisualScenario[];

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
  scenario,
}: {
  browser: Browser;
  hydrate: boolean;
  scenario: MobilePrehydrationVisualScenario;
}) {
  const page = await browser.newPage({
    viewport: MOBILE_VIEWPORT_SIZE,
  });
  await seedWorkspaceSidebarState(page, scenario.state);
  if (!hydrate) {
    await blockHydrationScripts(page);
  }

  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });
  await waitForFonts(page);
  await expect(page.locator('[data-workspace-layout-v2="responsive"]').first()).toHaveAttribute(
    "data-mobile-pane",
    scenario.mobilePane,
  );
  if (hydrate) {
    await expect(page.getByTestId("workspace-layout-v2-pane-main")).toHaveAttribute(
      "data-workspace-layout-v2-measured",
      "",
    );
  }

  return page;
}

async function getSidebarEdgeX(page: Page, edgePane: "left" | "right") {
  const paneBox = await page.getByTestId(`workspace-layout-v2-pane-${edgePane}`).boundingBox();
  if (paneBox === null) {
    throw new Error(`Expected the ${edgePane} workspace pane to have a bounding box.`);
  }

  if (edgePane === "left") {
    return Math.floor(paneBox.x + paneBox.width);
  }

  return Math.floor(paneBox.x);
}

async function captureSidebarEdge(page: Page, edgeX: number) {
  const viewportSize = page.viewportSize();
  if (viewportSize === null) {
    throw new Error("Expected the page to have a viewport size.");
  }

  const clipX = Math.max(0, edgeX - EDGE_CAPTURE_LEFT_INSET_PX);
  const clipWidth = Math.min(EDGE_CAPTURE_WIDTH_PX, viewportSize.width - clipX);

  return page.screenshot({
    animations: "disabled",
    caret: "hide",
    clip: {
      // Whole-page equality would include unrelated hydration differences such
      // as the auth control and logo implementation. This strip compares only
      // the separator edge after asserting that its viewport coordinate is the
      // same before and after hydration.
      height: Math.min(EDGE_CAPTURE_HEIGHT_PX, viewportSize.height - EDGE_CAPTURE_TOP_PX),
      width: clipWidth,
      x: clipX,
      y: EDGE_CAPTURE_TOP_PX,
    },
    scale: "css",
  });
}

for (const scenario of MOBILE_PREHYDRATION_VISUAL_SCENARIOS) {
  test(`mobile workspace prehydration paints ${scenario.id} exactly like hydration`, async ({
    browser,
  }, testInfo: TestInfo) => {
    const prehydratedPage = await openMobileWorkspacePage({
      browser,
      hydrate: false,
      scenario,
    });
    const hydratedPage = await openMobileWorkspacePage({
      browser,
      hydrate: true,
      scenario,
    });

    try {
      const prehydratedEdgeX = await getSidebarEdgeX(prehydratedPage, scenario.edgePane);
      const hydratedEdgeX = await getSidebarEdgeX(hydratedPage, scenario.edgePane);
      expect(prehydratedEdgeX).toBe(hydratedEdgeX);

      const prehydratedScreenshot = await captureSidebarEdge(prehydratedPage, hydratedEdgeX);
      const hydratedScreenshot = await captureSidebarEdge(hydratedPage, hydratedEdgeX);
      const artifactPrefix = `workspace-mobile-prehydration-${scenario.id}-edge`;

      await expectScreenshotsToMatch({
        actual: prehydratedScreenshot,
        artifactPrefix,
        artifactWritePaths: {
          actual: testInfo.outputPath(`${artifactPrefix}-prehydrated.png`),
          diff: testInfo.outputPath(`${artifactPrefix}-diff.png`),
          diffMask: testInfo.outputPath(`${artifactPrefix}-diff-mask.png`),
          expected: testInfo.outputPath(`${artifactPrefix}-hydrated.png`),
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
}
