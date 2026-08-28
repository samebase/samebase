import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import type { WorkspaceSidebarState } from "../convex/userPreferenceModel";
import {
  APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
  APP_WORKSPACE_SIDEBAR_STORAGE_VERSION,
} from "../src/lib/appWorkspaceSidebarPreferences";
import {
  APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID,
  PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID,
} from "../src/lib/publicLanding";
import { PUBLIC_LANDING_LOGO_STAGE_TEST_ID } from "../src/lib/publicLandingLogo";
import { expectScreenshotsToMatch } from "./visualDiff";

const MOBILE_VIEWPORT_SIZE = {
  height: 844,
  width: 390,
};
const STABLE_VIEWPORT_CAPTURE = {
  height: 844,
  width: 390,
  x: 0,
  y: 0,
} as const;
const STABLE_WORKSPACE_PREHYDRATION_VISUAL_MASK_STYLE = `
[data-testid="${PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID}"] {
  display: none !important;
}

[data-testid="${APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID}"] {
  display: none !important;
}

[data-testid="${PUBLIC_LANDING_LOGO_STAGE_TEST_ID}"] {
  visibility: hidden !important;
}

[data-sidebar-layout-part="resize-handle"][data-resize-side="left"],
[data-sidebar-layout-part="resize-handle"][data-resize-side="right"] {
  visibility: hidden !important;
}
`;

const RENDERED_SEPARATOR_STYLE = {
  backgroundIsVisible: true,
  heightIsPositive: true,
  touchesExpectedEdge: true,
  width: "1px",
} as const;

type MobilePrehydrationVisualScenario = {
  edgePane: "right";
  id: string;
  mobilePane: "main" | "right";
  state: WorkspaceSidebarState;
};

const MOBILE_PREHYDRATION_VISUAL_SCENARIOS = [
  {
    edgePane: "right",
    id: "no-left-unmerged-right",
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
    id: "no-left-stale-left",
    mobilePane: "main",
    state: {
      leftDesktopOpen: true,
      leftDesktopWidthPx: 240,
      leftMobileWidthPx: 240,
      mobilePane: "left",
      mobileSurface: { kind: "unmerged" },
      rightDesktopOpen: true,
      rightDesktopWidthPx: 288,
      rightMobileWidthPx: 288,
    },
  },
  {
    edgePane: "right",
    id: "no-left-merged-right",
    mobilePane: "right",
    state: {
      leftDesktopOpen: true,
      leftDesktopWidthPx: 240,
      leftMobileWidthPx: 240,
      mobilePane: "right",
      mobileSurface: {
        kind: "merged",
        mainWidthPx: 260,
        side: "right",
      },
      rightDesktopOpen: true,
      rightDesktopWidthPx: 96,
      rightMobileWidthPx: 130,
    },
  },
] satisfies MobilePrehydrationVisualScenario[];

const CROSS_SIDE_MERGED_PREHYDRATION_SCENARIOS = [
  {
    mobilePane: "right",
    mergedSide: "left",
  },
  {
    mobilePane: "left",
    mergedSide: "right",
  },
] as const;

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

async function getHorizontalSeparatorStyles(page: Page) {
  return page
    .locator('[data-sidebar-layout-part="pane"][data-pane-side="main"]')
    .evaluate((element) => {
      const readSeparatorStyle = (pseudoElement: "::before" | "::after") => {
        const styles = window.getComputedStyle(element, pseudoElement);

        if (styles.content === "none") {
          return null;
        }

        return {
          backgroundIsVisible:
            styles.backgroundColor !== "rgba(0, 0, 0, 0)" &&
            styles.backgroundColor !== "transparent",
          heightIsPositive: Number.parseFloat(styles.height) > 0,
          touchesExpectedEdge:
            pseudoElement === "::before" ? styles.left === "0px" : styles.right === "0px",
          width: styles.width,
        };
      };

      return {
        left: readSeparatorStyle("::before"),
        right: readSeparatorStyle("::after"),
      };
    });
}

async function waitForFonts(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function maskHydrationOnlyVisualDifferences(page: Page) {
  await page.addStyleTag({
    content: STABLE_WORKSPACE_PREHYDRATION_VISUAL_MASK_STYLE,
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

  await page.goto("/terms", {
    waitUntil: "domcontentloaded",
  });
  await maskHydrationOnlyVisualDifferences(page);
  await waitForFonts(page);
  await expect(page.locator('[data-sidebar-layout-part="viewport"]').first()).toHaveAttribute(
    "data-mobile-pane",
    scenario.mobilePane,
  );
  if (hydrate) {
    await expect(page.locator('[data-sidebar-layout-part="carousel"]')).toHaveAttribute(
      "data-viewport-measured",
      "",
    );
  }

  return page;
}

async function getSidebarEdgeX(page: Page, edgePane: "left" | "right") {
  const paneBox = await page
    .locator(`[data-sidebar-layout-part="pane"][data-pane-side="${edgePane}"]`)
    .boundingBox();
  if (paneBox === null) {
    throw new Error(`Expected the ${edgePane} workspace pane to have a bounding box.`);
  }

  if (edgePane === "left") {
    return Math.floor(paneBox.x + paneBox.width);
  }

  return Math.floor(paneBox.x);
}

async function captureStableWorkspaceViewport(page: Page) {
  const viewportSize = page.viewportSize();
  if (viewportSize === null) {
    throw new Error("Expected the page to have a viewport size.");
  }

  return page.screenshot({
    animations: "disabled",
    caret: "hide",
    clip: {
      // The test stylesheet removes hydration-only auth content and hides the
      // SVG/canvas logo renderer difference while preserving the logo's layout
      // space. The remaining viewport should be pixel-identical if
      // prehydration picked the same pane geometry as React hydration.
      height: Math.min(STABLE_VIEWPORT_CAPTURE.height, viewportSize.height),
      width: Math.min(STABLE_VIEWPORT_CAPTURE.width, viewportSize.width),
      x: STABLE_VIEWPORT_CAPTURE.x,
      y: STABLE_VIEWPORT_CAPTURE.y,
    },
    scale: "css",
  });
}

for (const scenario of MOBILE_PREHYDRATION_VISUAL_SCENARIOS) {
  test(`mobile workspace prehydration paints ${scenario.id} exactly like hydration`, async ({
    browser,
  }, testInfo: TestInfo) => {
    let prehydratedPage: Page | null = null;
    let hydratedPage: Page | null = null;

    try {
      prehydratedPage = await openMobileWorkspacePage({
        browser,
        hydrate: false,
        scenario,
      });
      hydratedPage = await openMobileWorkspacePage({
        browser,
        hydrate: true,
        scenario,
      });

      const prehydratedEdgeX = await getSidebarEdgeX(prehydratedPage, scenario.edgePane);
      const hydratedEdgeX = await getSidebarEdgeX(hydratedPage, scenario.edgePane);
      expect(prehydratedEdgeX).toBe(hydratedEdgeX);

      const prehydratedScreenshot = await captureStableWorkspaceViewport(prehydratedPage);
      const hydratedScreenshot = await captureStableWorkspaceViewport(hydratedPage);
      const artifactPrefix = `workspace-mobile-prehydration-${scenario.id}-viewport`;

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
      await prehydratedPage?.close();
      await hydratedPage?.close();
    }
  });
}

for (const scenario of CROSS_SIDE_MERGED_PREHYDRATION_SCENARIOS) {
  test(`mobile workspace prehydration keeps merged ${scenario.mergedSide} outer separators off the ${scenario.mobilePane} view`, async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT_SIZE);
    await seedWorkspaceSidebarState(page, {
      leftDesktopOpen: true,
      leftDesktopWidthPx: 240,
      leftMobileWidthPx: 130,
      mobilePane: scenario.mobilePane,
      mobileSurface: {
        kind: "merged",
        mainWidthPx: 260,
        side: scenario.mergedSide,
      },
      rightDesktopOpen: true,
      rightDesktopWidthPx: 288,
      rightMobileWidthPx: 130,
    });
    await blockHydrationScripts(page);

    await page.goto("/logo?dev", {
      waitUntil: "domcontentloaded",
    });

    const layout = page.locator('[data-sidebar-layout-part="viewport"]').first();
    await expect(layout).toHaveAttribute("data-mobile-pane", scenario.mobilePane);
    await expect(layout).toHaveAttribute(
      "data-sidebar-layout-mobile-merged-side",
      scenario.mergedSide,
    );
    await expect
      .poll(async () => getHorizontalSeparatorStyles(page))
      .toEqual(
        scenario.mobilePane === "left"
          ? {
              left: RENDERED_SEPARATOR_STYLE,
              right: null,
            }
          : {
              left: null,
              right: RENDERED_SEPARATOR_STYLE,
            },
      );

    const mainPaneBox = await page
      .locator('[data-sidebar-layout-part="pane"][data-pane-side="main"]')
      .boundingBox();
    if (mainPaneBox === null) {
      throw new Error("Expected the prehydrated main pane to have a bounding box.");
    }

    if (scenario.mobilePane === "left") {
      expect(Math.round(mainPaneBox.x + mainPaneBox.width)).toBe(MOBILE_VIEWPORT_SIZE.width);
    } else {
      expect(Math.round(mainPaneBox.x)).toBe(0);
    }
  });
}
