import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import type { WorkspaceSidebarState } from "../convex/workspaceSidebarStateModel";
import {
  APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
  APP_WORKSPACE_SIDEBAR_STORAGE_VERSION,
} from "../src/lib/appWorkspaceSidebarPreferences";
import {
  PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID,
  PUBLIC_LANDING_PASSWORD_AUTH_SECTION_TEST_ID,
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

[data-testid="${PUBLIC_LANDING_PASSWORD_AUTH_SECTION_TEST_ID}"] {
  display: none !important;
}

[data-testid="${PUBLIC_LANDING_LOGO_STAGE_TEST_ID}"] {
  visibility: hidden !important;
}

[data-testid="workspace-layout-v2-left-resize"],
[data-testid="workspace-layout-v2-right-resize"] {
  visibility: hidden !important;
}
`;

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

  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });
  await maskHydrationOnlyVisualDifferences(page);
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
