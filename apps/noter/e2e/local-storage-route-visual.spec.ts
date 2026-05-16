import { expect, test } from "@playwright/test";
import { LOCAL_STORAGE_ROUTE } from "../src/lib/localStorageRoute";
import { PUBLIC_LAYOUT_SIDEBAR_STORAGE_KEY } from "../src/lib/publicLayoutSidebarPreferences";

const localStorageRouteScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0.03,
} as const;

test("localStorage route shows raw strings and formatted JSON values", async ({
  page,
}) => {
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
    window.localStorage.setItem(
      "noter.multiline",
      "line one\nline two\nline three",
    );
  });

  await page.goto("/localStorage", { waitUntil: "networkidle" });

  await expect(page.getByTestId("local-storage-route")).toBeVisible();
  await expect(page.getByTestId("local-storage-sidebar-file")).toHaveText(
    "localStorage",
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
  await expect(page.locator("main")).toHaveScreenshot(
    "local-storage-workspace.png",
    localStorageRouteScreenshotOptions,
  );
});

test("localStorage route reflects sidebar persistence without manual refresh", async ({
  page,
}) => {
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
      hasText: PUBLIC_LAYOUT_SIDEBAR_STORAGE_KEY,
    }),
  ).toBeVisible();
  await expect(
    page.getByTestId("local-storage-entry-value").filter({
      hasText: `"leftDesktopWidthPx": ${initialWidthPx + 24}`,
    }),
  ).toBeVisible();
});

test("localStorage right sidebar reserves the dev link row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/localStorage", { waitUntil: "networkidle" });

  const publicLinks = page
    .getByTestId("workspace-layout-v2-pane-right")
    .getByTestId("app-build-status-bar");
  await expect(
    publicLinks.getByRole("link", {
      name: LOCAL_STORAGE_ROUTE,
      exact: true,
    }),
  ).toHaveCount(0);

  const hiddenLocalStorageRow = publicLinks.locator(
    "#public-local-storage-route-link",
  );
  await expect(hiddenLocalStorageRow).toHaveAttribute("aria-hidden", "true");
  await expect(hiddenLocalStorageRow).toHaveAttribute("tabindex", "-1");
  await expect(hiddenLocalStorageRow).toHaveText(LOCAL_STORAGE_ROUTE);

  await page.goto("/localStorage?dev", { waitUntil: "networkidle" });

  await expect(
    publicLinks.getByRole("link", {
      name: LOCAL_STORAGE_ROUTE,
      exact: true,
    }),
  ).toHaveAttribute("href", `${LOCAL_STORAGE_ROUTE}?dev`);
});
