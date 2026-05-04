import { expect, test } from "@playwright/test";

const localStorageRouteScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0.03,
} as const;

test("localStorage route shows exact raw values in the workspace shell", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("noter.alpha", "plain value");
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
      hasText: "line one\nline two\nline three",
    }),
  ).toBeVisible();
  await expect(page.locator("#root main")).toHaveScreenshot(
    "local-storage-workspace.png",
    localStorageRouteScreenshotOptions,
  );
});
