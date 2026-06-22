import { expect, test, type Locator, type Page } from "@playwright/test";
import { APP_BUILD_STATUS_BAR_TEST_ID } from "../src/lib/appBuild";
import { INDEXED_DB_ROUTE } from "../src/lib/indexedDbRoute";
import { LOCAL_STORAGE_ROUTE } from "../src/lib/localStorageRoute";
import { signInIfNeeded } from "./liveHelpers";

const AUTHENTICATED_APP_ACCOUNT_SECTION_TEST_ID = "dashboard-sidebar-account-section";
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

async function signInForLocalStorageRoute(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page);
}

async function seedLocalStorageRouteValues(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.localStorage.setItem("samebase.alpha", "plain value");
    window.localStorage.setItem(
      "samebase.json",
      JSON.stringify({
        enabled: true,
        nested: {
          count: 2,
        },
      }),
    );
    window.localStorage.setItem("samebase.multiline", "line one\nline two\nline three");
  });
}

async function notifyStorageChanged(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new Event("storage"));
  });
}

test("localStorage route shows raw strings and formatted JSON values", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInForLocalStorageRoute(page);
  await seedLocalStorageRouteValues(page);

  await page.goto(LOCAL_STORAGE_ROUTE, { waitUntil: "networkidle" });

  await expect(page.getByTestId("app-workspace")).toBeVisible();
  await expect(page.getByTestId("local-storage-sidebar-file")).toHaveText(LOCAL_STORAGE_ROUTE);
  await expect(page.getByTestId("indexed-db-sidebar-file")).toHaveText(INDEXED_DB_ROUTE);
  await expect(page.getByTestId("indexed-db-sidebar-file")).toHaveAttribute(
    "href",
    INDEXED_DB_ROUTE,
  );
  await expect(
    page.getByTestId("local-storage-entry-key").filter({
      hasText: "samebase.multiline",
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

test("storage sidebar links navigate through the same styled link surface", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInForLocalStorageRoute(page);
  await page.goto(LOCAL_STORAGE_ROUTE, { waitUntil: "networkidle" });
  const origin = new URL(page.url()).origin;
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
  await expect(page).toHaveURL(`${origin}${LOCAL_STORAGE_ROUTE}`);
  await storageRouteLink.click();
  await expect(page).toHaveURL(`${origin}${INDEXED_DB_ROUTE}`);
  await expect(page.getByTestId("indexed-db-sidebar-file")).toHaveAttribute("aria-current", "page");
});

test("localStorage route reflects same-tab storage writes without manual refresh", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInForLocalStorageRoute(page);

  await page.goto("/localStorage?dev", { waitUntil: "networkidle" });

  await page.evaluate(() => {
    window.localStorage.setItem(
      "samebase.route-live-update",
      JSON.stringify({
        enabled: true,
        source: "same-tab-write",
      }),
    );
  });
  await notifyStorageChanged(page);

  await expect(
    page.getByTestId("local-storage-entry-key").filter({
      hasText: "samebase.route-live-update",
    }),
  ).toBeVisible();
  await expect(
    page.getByTestId("local-storage-entry-value").filter({
      hasText: `"source": "same-tab-write"`,
    }),
  ).toBeVisible();
});

test("localStorage right sidebar omits the route shortcut", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInForLocalStorageRoute(page);
  await page.goto(LOCAL_STORAGE_ROUTE, { waitUntil: "networkidle" });

  const rightSidebar = page.getByTestId("workspace-layout-v2-pane-right");
  const publicLinks = rightSidebar.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);
  const accountSection = rightSidebar.getByTestId(AUTHENTICATED_APP_ACCOUNT_SECTION_TEST_ID);
  await expect(accountSection).toBeVisible();
  await expect(accountSection.getByText("not logged in", { exact: true })).toHaveCount(0);
  await expect(accountSection.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(accountSection.locator("[aria-expanded]")).toHaveCount(0);
  await expect(rightSidebar.getByRole("link", { name: "Providers", exact: true })).toHaveAttribute(
    "href",
    "/providers",
  );
  await expect(rightSidebar.getByTestId("dashboard-sidebar-providers-section")).toHaveCount(0);
  await expect(accountSection).toHaveScreenshot("local-storage-signed-in-account-section.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
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
