import { expect, test } from "@playwright/test";

async function openDashboardFixture(page: import("@playwright/test").Page) {
  await page.goto("/visual-fixture.html?mode=dashboard-sidebar", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
}

test("account section toggles and user menu opens account details", async ({
  page,
}) => {
  await openDashboardFixture(page);

  const accountSectionTrigger = page.getByRole("button", { name: "Account" });
  const userMenuTrigger = page.getByRole("button", {
    name: "Toggle user menu",
  });

  await expect(userMenuTrigger).toBeVisible();
  await accountSectionTrigger.click();
  await expect(userMenuTrigger).toBeHidden();
  await accountSectionTrigger.click();
  await expect(userMenuTrigger).toBeVisible();

  await userMenuTrigger.click();
  await expect(
    page.getByRole("menuitem", { name: "Account details" }),
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();

  await page.getByRole("menuitem", { name: "Account details" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Sign-in details for this session.",
  );
});

test("providers section toggles provider rows", async ({ page }) => {
  await openDashboardFixture(page);

  const providersSectionTrigger = page.getByRole("button", {
    name: "Providers",
  });
  const githubProvider = page.getByText("GitHub", { exact: true });

  await expect(githubProvider).toBeHidden();
  await providersSectionTrigger.click();
  await expect(githubProvider).toBeVisible();
  await providersSectionTrigger.click();
  await expect(githubProvider).toBeHidden();
});

test("new project section toggles compact create controls", async ({
  page,
}) => {
  await openDashboardFixture(page);

  const newProjectSectionTrigger = page.getByRole("button", {
    name: "New Project",
  });
  const templateButton = page.getByRole("button", {
    name: /App/,
  });
  const moreActionsButton = page.getByRole("button", { name: "More actions" });
  const projectNameInput = page.getByRole("textbox");

  await expect(templateButton).toBeHidden();
  await newProjectSectionTrigger.click();
  await expect(templateButton).toBeVisible();
  await expect(projectNameInput).toBeVisible();

  await templateButton.click();
  await expect(page.getByRole("menuitem", { name: "Agent" })).toBeVisible();
  await page.keyboard.press("Escape");

  await moreActionsButton.click();
  await expect(
    page.getByRole("menuitem", { name: "Connect existing repo" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await newProjectSectionTrigger.click();
  await expect(templateButton).toBeHidden();
  await expect(projectNameInput).toBeHidden();
});
