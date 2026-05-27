import { expect, test, type Locator } from "@playwright/test";
import { APP_BUILD_STATUS_BAR_TEST_ID } from "../src/lib/appBuild";
import { INDEXED_DB_ROUTE } from "../src/lib/indexedDbRoute";
import { LOCAL_STORAGE_ROUTE } from "../src/lib/localStorageRoute";
import { APP_WORKSPACE_SIDEBAR_STORAGE_KEY } from "../src/lib/appWorkspaceSidebarPreferences";
import { PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID } from "../src/lib/publicLanding";

const localStorageRouteScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0.03,
} as const;

async function readPreviewLinkStyle(link: Locator) {
  return link.evaluate((element) => {
    const style = window.getComputedStyle(element);

    return {
      color: style.color,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      textDecorationColor: style.textDecorationColor,
      textDecorationLine: style.textDecorationLine,
      textUnderlineOffset: style.textUnderlineOffset,
    };
  });
}

test("localStorage route shows raw strings and formatted JSON values", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("noter.alpha", "plain value");
    window.localStorage.setItem(
      "noter.json",
      JSON.stringify({
        enabled: true,
        nested: {
          count: 2,
        },
      }),
    );
    window.localStorage.setItem("noter.multiline", "line one\nline two\nline three");
  });

  await page.goto("/localStorage", { waitUntil: "networkidle" });

  await expect(page.getByTestId("app-workspace")).toBeVisible();
  await expect(page.getByTestId("local-storage-sidebar-file")).toHaveText(LOCAL_STORAGE_ROUTE);
  await expect(page.getByTestId("indexed-db-sidebar-file")).toHaveText(INDEXED_DB_ROUTE);
  await expect(page.getByTestId("indexed-db-sidebar-file")).toHaveAttribute(
    "href",
    INDEXED_DB_ROUTE,
  );
  await expect(
    page.getByTestId("local-storage-entry-key").filter({
      hasText: "noter.multiline",
    }),
  ).toBeVisible();
  await expect(
    page.getByTestId("local-storage-entry-value").filter({
      hasText: `"nested": {\n    "count": 2\n  }`,
    }),
  ).toBeVisible();
  await expect(
    page.getByTestId("local-storage-entry-value").filter({
      hasText: "line one\nline two\nline three",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("workspace-layout-v2-pane-main")).toHaveScreenshot(
    "local-storage-workspace.png",
    localStorageRouteScreenshotOptions,
  );
});

test("storage sidebar previews linked pages on hover", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(LOCAL_STORAGE_ROUTE, { waitUntil: "networkidle" });
  const origin = new URL(page.url()).origin;
  const leftSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  const rightSidebar = page.getByTestId("workspace-layout-v2-pane-right");
  const storageRouteLink = page.getByTestId("indexed-db-sidebar-file");
  const rightSidebarLink = rightSidebar
    .getByTestId(APP_BUILD_STATUS_BAR_TEST_ID)
    .getByRole("link", { name: "/terms", exact: true });

  await expect(storageRouteLink).toBeVisible();
  await expect(rightSidebarLink).toBeVisible();
  await expect
    .poll(() => readPreviewLinkStyle(storageRouteLink))
    .toEqual(await readPreviewLinkStyle(rightSidebarLink));

  await storageRouteLink.hover();
  await expect(page).toHaveURL(`${origin}${INDEXED_DB_ROUTE}`);
  await expect(page.getByTestId("indexed-db-sidebar-file")).toHaveAttribute("aria-current", "page");
  await page.mouse.down();
  try {
    await expect(leftSidebar).toHaveScreenshot(
      "storage-sidebar-link-click-state.png",
      localStorageRouteScreenshotOptions,
    );
  } finally {
    await page.mouse.up();
  }

  await page.getByTestId("workspace-layout-v2-pane-main").hover({
    position: { x: 16, y: 16 },
  });
  await expect(page).toHaveURL(`${origin}${LOCAL_STORAGE_ROUTE}`);
});

test("localStorage route reflects sidebar persistence without manual refresh", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.clear();
  });

  await page.goto("/localStorage?dev", { waitUntil: "networkidle" });

  const leftResizeHandle = page.getByTestId("workspace-layout-v2-left-resize");
  await expect(leftResizeHandle).toBeVisible();

  const initialWidthText = await leftResizeHandle.getAttribute("aria-valuenow");
  if (initialWidthText === null) {
    throw new Error("Expected left resize handle width");
  }

  const initialWidthPx = Number(initialWidthText);
  expect(Number.isFinite(initialWidthPx)).toBe(true);

  await leftResizeHandle.focus();
  await page.keyboard.press("ArrowRight");

  await expect(
    page.getByTestId("local-storage-entry-key").filter({
      hasText: APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
    }),
  ).toBeVisible();
  await expect(
    page.getByTestId("local-storage-entry-value").filter({
      hasText: `"leftDesktopWidthPx": ${initialWidthPx + 24}`,
    }),
  ).toBeVisible();
});

test("localStorage right sidebar omits the route shortcut", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/localStorage", { waitUntil: "networkidle" });

  const rightSidebar = page.getByTestId("workspace-layout-v2-pane-right");
  const publicLinks = rightSidebar.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);
  const accountSection = rightSidebar.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID);
  await expect(accountSection).toBeVisible();
  await expect(accountSection.getByRole("button", { name: "not logged in" })).toBeVisible();
  await expect(publicLinks.locator("#public-local-storage-route-link")).toHaveCount(0);
  await expect(
    publicLinks.getByRole("link", {
      name: LOCAL_STORAGE_ROUTE,
      exact: true,
    }),
  ).toHaveCount(0);

  await page.goto("/localStorage?dev", { waitUntil: "networkidle" });

  await expect(accountSection).toBeVisible();
  await expect(publicLinks.locator("#public-local-storage-route-link")).toHaveCount(0);
  await expect(
    publicLinks.getByRole("link", {
      name: LOCAL_STORAGE_ROUTE,
      exact: true,
    }),
  ).toHaveCount(0);
});
