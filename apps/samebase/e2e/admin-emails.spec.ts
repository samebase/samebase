import { expect, test } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";

test("staff email monitor uses the authenticated app route and sidebar @opt-in", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/emails", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Page not available" })).toBeVisible();
  await expect(page.getByTestId("admin-emails-page")).toHaveCount(0);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/admin/emails");

  const monitor = page.getByTestId("admin-emails-page");
  await expect(monitor.getByRole("heading", { name: "Emails", exact: true })).toBeVisible();
  await expect(monitor.getByRole("combobox", { name: "Inbox", exact: true })).toBeVisible();
  await expect(monitor.getByRole("combobox", { name: "Status", exact: true })).toBeVisible();
  await expect(monitor).toHaveAttribute("data-posthog-mask", "true");

  const sidebar = page.locator('[data-sidebar-layout-part="pane"][data-pane-side="right"]');
  await expect(sidebar.getByTestId("dashboard-sidebar-account-section")).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Emails", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(sidebar.getByRole("link", { name: "Users", exact: true })).toBeVisible();
  await expect(monitor).toHaveScreenshot("admin-emails.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(monitor).toHaveScreenshot("admin-emails-mobile.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
});
