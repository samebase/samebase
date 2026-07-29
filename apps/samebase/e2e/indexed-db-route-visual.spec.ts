import { expect, test, type Page } from "@playwright/test";
import { INDEXED_DB_ROUTE } from "../src/lib/indexedDbRoute";
import { LOCAL_STORAGE_ROUTE } from "../src/lib/localStorageRoute";
import { signInIfNeeded } from "./liveHelpers";

const AUTHENTICATED_APP_ACCOUNT_SECTION_TEST_ID = "dashboard-sidebar-account-section";
const indexedDbRouteScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0.03,
} as const;

async function deleteIndexedDbDatabase(page: Page, databaseName: string): Promise<void> {
  await page.evaluate(
    (name) =>
      new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(name);
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
        request.onsuccess = () => resolve();
      }),
    databaseName,
  );
}

async function seedIndexedDbRouteDatabase(page: Page): Promise<void> {
  const databaseName = "samebaseIndexedDbRouteTest";

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await deleteIndexedDbDatabase(page, databaseName);
  await page.evaluate(
    (name) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore("notes");
          db.createObjectStore("settings");
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["notes", "settings"], "readwrite");
          transaction.objectStore("notes").put("line one\nline two", "samebase.multiline");
          transaction.objectStore("settings").put(
            {
              enabled: true,
              nested: {
                count: 2,
              },
            },
            "samebase.json",
          );
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => {
            db.close();
            reject(transaction.error);
          };
        };
      }),
    databaseName,
  );
}

async function signInForIndexedDbRoute(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page);
}

test("indexedDB route shows database store keys and formatted values", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInForIndexedDbRoute(page);
  await seedIndexedDbRouteDatabase(page);

  await page.goto(INDEXED_DB_ROUTE, { waitUntil: "networkidle" });

  await expect(page.getByTestId("app-workspace")).toBeVisible();
  await expect(page.getByTestId("indexed-db-sidebar-file")).toHaveText(INDEXED_DB_ROUTE);
  await expect(page.getByTestId("local-storage-sidebar-file")).toHaveText(LOCAL_STORAGE_ROUTE);
  const rightSidebar = page.getByTestId("workspace-layout-v2-pane-right");
  const accountSection = rightSidebar.getByTestId(AUTHENTICATED_APP_ACCOUNT_SECTION_TEST_ID);
  await expect(accountSection).toBeVisible();
  await expect(
    accountSection.getByText("Sign in or create an account", { exact: true }),
  ).toHaveCount(0);
  await expect(rightSidebar.getByRole("link", { name: "/terms", exact: true })).toHaveAttribute(
    "href",
    "/terms",
  );
  await expect(page.getByTestId("local-storage-sidebar-file")).toHaveAttribute(
    "href",
    LOCAL_STORAGE_ROUTE,
  );
  const settingsRow = page.getByRole("row", {
    name: /samebaseIndexedDbRouteTest settings samebase\.json/,
  });
  const notesRow = page.getByRole("row", {
    name: /samebaseIndexedDbRouteTest notes samebase\.multiline/,
  });

  await expect(settingsRow.getByTestId("indexed-db-entry-database")).toHaveText(
    "samebaseIndexedDbRouteTest",
  );
  await expect(settingsRow.getByTestId("indexed-db-entry-store")).toHaveText("settings");
  await expect(settingsRow.getByTestId("indexed-db-entry-key")).toHaveText("samebase.json");
  await expect(settingsRow.getByTestId("indexed-db-entry-value")).toContainText(
    `"nested": {\n    "count": 2\n  }`,
  );
  await expect(notesRow.getByTestId("indexed-db-entry-value")).toContainText("line one\nline two");
  await expect(page.getByTestId("workspace-layout-v2-pane-main")).toHaveScreenshot(
    "indexed-db-workspace.png",
    indexedDbRouteScreenshotOptions,
  );
});
