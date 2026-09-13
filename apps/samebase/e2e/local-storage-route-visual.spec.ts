import { expect, test, type Locator, type Page } from "@playwright/test";
import { APP_BUILD_STATUS_BAR_TEST_ID } from "../src/lib/appBuild";
import { INDEXED_DB_ROUTE } from "../src/lib/indexedDbRoute";
import { LOCAL_STORAGE_ROUTE } from "../src/lib/localStorageRoute";
import { signInIfNeeded } from "./liveHelpers";

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

test("localStorage route shows raw strings and formatted JSON values @opt-in", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInForLocalStorageRoute(page);
  await seedLocalStorageRouteValues(page);

  await page.goto(LOCAL_STORAGE_ROUTE, { waitUntil: "networkidle" });

  await expect(page.locator('[data-sidebar-layout-part="root"]')).toBeVisible();
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
  await expect(page.locator('[data-sidebar-layout-part="carousel"]')).toHaveScreenshot(
    "local-storage-workspace.png",
    localStorageRouteScreenshotOptions,
  );
});

test("storage sidebar links navigate through the same styled link surface @opt-in", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInForLocalStorageRoute(page);
  await page.goto(LOCAL_STORAGE_ROUTE, { waitUntil: "networkidle" });
  const origin = new URL(page.url()).origin;
  const rightSidebar = page.locator('[data-sidebar-layout-part="pane"][data-pane-side="right"]');
  const storageRouteLink = page.getByTestId("indexed-db-sidebar-file");
  const rightSidebarLink = rightSidebar
    .getByTestId(APP_BUILD_STATUS_BAR_TEST_ID)
    .getByRole("link", { name: "/terms", exact: true });

  await expect(storageRouteLink).toBeVisible();
  const localStorageLink = page.getByTestId("local-storage-sidebar-file");
  await expect(localStorageLink).toHaveAttribute("aria-current", "page");
  await expect(localStorageLink).toHaveCSS("padding", "2px 6px");
  await expect(localStorageLink).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(rightSidebarLink).toBeVisible();
  await expect
    .poll(() => readPreviewLinkStyle(storageRouteLink))
    .toEqual(await readPreviewLinkStyle(rightSidebarLink));

  await storageRouteLink.hover();
  await expect(page).toHaveURL(`${origin}${LOCAL_STORAGE_ROUTE}`);
  await storageRouteLink.click();
  await expect(page).toHaveURL(`${origin}${INDEXED_DB_ROUTE}`);
  await expect(page.getByTestId("indexed-db-sidebar-file")).toHaveAttribute("aria-current", "page");
  await expect(storageRouteLink).toHaveCSS("padding", "2px 6px");
  await expect(localStorageLink).not.toHaveAttribute("aria-current", "page");
});

test("localStorage route reflects same-tab storage writes without manual refresh @opt-in", async ({
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
