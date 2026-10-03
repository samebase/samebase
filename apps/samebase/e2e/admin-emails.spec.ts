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
  const statusFilter = monitor.getByRole("combobox", { name: "Status", exact: true });
  const selectedStatus = statusFilter.locator('[data-slot="select-value"]');
  await expect(statusFilter).toBeVisible();
  await expect(monitor).toHaveAttribute("data-posthog-block", "true");

  await statusFilter.click();
  await page.getByRole("option", { name: "Received", exact: true }).click();
  await expect(selectedStatus).toHaveText("Received");
  await expect(statusFilter).toBeFocused();
  await statusFilter.press("Enter");
  await page.getByRole("option", { name: "All statuses", exact: true }).click();
  await expect(selectedStatus).toHaveText("All statuses");

  const themeColors = await monitor.evaluate((element) => {
    const theme = getComputedStyle(element);
    const probe = document.createElement("span");
    probe.style.borderBottomColor = `hsl(${theme.getPropertyValue("--border")})`;
    probe.style.color = `hsl(${theme.getPropertyValue("--muted-foreground")})`;
    element.append(probe);
    try {
      const border = getComputedStyle(probe).borderBottomColor;
      const muted = getComputedStyle(probe).color;
      probe.style.color = `hsl(${theme.getPropertyValue("--destructive")})`;
      return { border, muted, destructive: getComputedStyle(probe).color };
    } finally {
      probe.remove();
    }
  });
  const tableHeader = monitor.locator("thead");
  const messageHeader = monitor.getByRole("columnheader", { name: "Message", exact: true });
  await expect(tableHeader).toHaveCSS("border-bottom-width", "1px");
  await expect(tableHeader).toHaveCSS("border-bottom-color", themeColors.border);
  await expect(messageHeader).toHaveCSS("color", themeColors.muted);

  await messageHeader.evaluate((element) => element.classList.add("text-destructive"));
  try {
    await expect(messageHeader).toHaveCSS("color", themeColors.destructive);
  } finally {
    await messageHeader.evaluate((element) => element.classList.remove("text-destructive"));
  }

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
  await expect(statusFilter).toHaveCSS("font-size", "16px");
  await expect(monitor).toHaveScreenshot("admin-emails-mobile.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
});
