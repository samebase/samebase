import { expect, test, type Page } from "@playwright/test";
import type { RepositoryOverviewVisualMode } from "../src/repository/dashboard/RepositoryOverviewVisualFixture";
import type { WorkspaceSidebarState } from "../convex/userPreferenceModel";
import { seedVisualFixtureWorkspaceSidebarState } from "./visualFixtureTest";

const MOBILE_MINIMUM_SIDEBAR_WIDTH_PX = 130;
const NO_STACK_LINE = "The team's Alchemy state store holds no stack for this repository.";
const STORE_READ_FAILED = "Could not read the team's Alchemy state store.";
const REPOSITORY_OVERVIEW_V2_SIDEBAR_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: 240,
  leftMobileWidthPx: 240,
  mobilePane: "main",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: false,
  rightDesktopWidthPx: 288,
  rightMobileWidthPx: 288,
} satisfies WorkspaceSidebarState;

type RepositoryOverviewV2VisualMode = RepositoryOverviewVisualMode;

async function openRepositoryOverviewV2(
  page: Page,
  mode: RepositoryOverviewV2VisualMode,
  sidebarState: WorkspaceSidebarState = REPOSITORY_OVERVIEW_V2_SIDEBAR_STATE,
) {
  await page.route("https://samebase.com/favicon.ico", async (route) => {
    await route.fulfill({
      body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#30383a"/><path d="M4 5h8v2H6v2h6v2H4z" fill="white"/></svg>`,
      contentType: "image/svg+xml",
    });
  });
  await seedVisualFixtureWorkspaceSidebarState(page, sidebarState);
  await page.goto(`/visual-fixture?mode=${mode}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture =
    mode === "repository-overview-v2-convex-schema"
      ? page.getByTestId(mode)
      : mode.includes("-dialog")
        ? page.getByRole("dialog")
        : page.locator('[data-sidebar-layout-part="root"]');
  await expect(fixture).toBeVisible();
  return fixture;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("uses the overview repository rows on the canonical root route", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 640 });
  const fixture = await openRepositoryOverviewV2(page, "repository-overview-v2-root");
  const repositoryNavigation = fixture.getByRole("navigation", { name: "Repositories" });

  const samebaseLink = repositoryNavigation.getByRole("link", {
    name: "samebase/samebase, 4/4 passed, 3 open pull requests",
    exact: true,
  });
  await expect(samebaseLink).toHaveAttribute("href", "/repo/samebase/samebase");
  await expect(
    repositoryNavigation.getByRole("link", {
      name: "samebase/marketing-site, 4/4 passed, 3 open pull requests",
      exact: true,
    }),
  ).toHaveAttribute("href", "/repo/samebase/marketing-site");
  await expect(
    repositoryNavigation.getByRole("link", {
      name: "noter/guestbook, 4/4 passed",
      exact: true,
    }),
  ).toHaveAttribute("href", "/repo/noter/guestbook");
  const emptyOwnerButton = repositoryNavigation.getByRole("button", {
    name: "empty-owner",
    exact: true,
  });
  const noterButton = repositoryNavigation.getByRole("button", { name: "noter", exact: true });
  const samebaseButton = repositoryNavigation.getByRole("button", {
    name: "samebase",
    exact: true,
  });
  await expect(emptyOwnerButton).toHaveAttribute("aria-expanded", "true");
  await expect(noterButton).toHaveAttribute("aria-expanded", "true");
  await expect(samebaseButton).toHaveAttribute("aria-expanded", "true");
  await expect(fixture.getByText("No repositories", { exact: true })).toBeVisible();
  await expect(fixture).toHaveScreenshot("repository-overview-v2-root.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("centers the root repository list in a wide main pane", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 640 });
  const fixture = await openRepositoryOverviewV2(page, "repository-overview-v2-root");

  await expect(fixture).toHaveScreenshot("repository-overview-v2-root-wide.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("shows an old app with no stack on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const fixture = await openRepositoryOverviewV2(page, "repository-overview-v2");
  const repositoryNavigation = fixture.getByRole("navigation", { name: "Repositories" });
  const currentRepositoryLabel = repositoryNavigation
    .locator('a[aria-current="page"]')
    .getByText("samebase", { exact: true });
  await expect(currentRepositoryLabel).toHaveCSS("padding", "2px 6px");
  await expect(currentRepositoryLabel).toHaveCSS("font-weight", "400");
  await expect(currentRepositoryLabel).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await expect(
    repositoryNavigation.getByRole("button", { name: "empty-owner", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(
    repositoryNavigation.getByRole("button", { name: "noter", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(
    repositoryNavigation.getByRole("button", { name: "samebase", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    repositoryNavigation.getByRole("link", {
      name: "noter/guestbook, 4/4 passed, 3 open pull requests",
    }),
  ).toHaveCount(0);

  await expect(fixture.getByRole("link", { name: "main", exact: true })).toHaveAttribute(
    "href",
    "https://github.com/samebase/samebase/tree/main",
  );
  await expect(fixture.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute(
    "href",
    "/repo/samebase/samebase",
  );
  await expect(fixture.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute(
    "href",
    "/repo/samebase/samebase/settings",
  );
  await expect(
    fixture.getByRole("link", { name: "Open pull request #1260 on GitHub" }),
  ).toHaveAttribute("href", "https://github.com/samebase/samebase/pull/1260");
  await expect(fixture.getByRole("button", { name: "Filters" })).toHaveCount(0);
  await expect(fixture.locator('[data-pull-request-number="1258"]')).toBeVisible();
  await expect(fixture.getByText("Keep repository provider observations explicit")).toBeVisible();
  await expect(fixture.getByText(NO_STACK_LINE, { exact: true })).toBeVisible();
  await expect(fixture.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(fixture.getByRole("group", { name: /^Cloudflare Worker / })).toHaveCount(0);
  await expect(fixture.getByRole("group", { name: /^Convex deployment / })).toHaveCount(0);
  await expect(fixture).toHaveScreenshot("repository-overview-v2-desktop.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("keeps the Data and Schema routes of a stack's production deployment", async ({ page }) => {
  const fixture = await openRepositoryOverviewV2(page, "repository-overview-v2-r2");

  await fixture.getByRole("button", { name: "Open clear-butterfly-858 actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Data" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Schema" }).click();

  await expect(page).toHaveURL(
    "/repo/samebase/samebase/schema/main/project/convex-project-samebase",
  );
});

test("shows one card per Alchemy stack on desktop and mobile", async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const fixture = await openRepositoryOverviewV2(page, "repository-overview-v2-r2");
    await expect(
      fixture.getByRole("link", { name: "scout-workspaces-prod", exact: true }),
    ).toBeVisible();
    await expect(fixture).toHaveScreenshot(`repository-overview-v2-r2-${viewport.width}.png`, {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    });
  }
});

test("shows the stack card of a pull request preview on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await openRepositoryOverviewV2(page, "repository-overview-v2-r2");
  const pullRequestRow = fixture.locator('[data-pull-request-number="1260"]');

  await pullRequestRow.getByRole("button", { name: "Show pull request #1260 details" }).click();
  await expect(
    pullRequestRow.getByRole("group", { name: "Alchemy stack samebase/samebase" }),
  ).toBeVisible();
  await expect(pullRequestRow.getByRole("group", { name: /^Alchemy stack / })).toHaveCount(1);
  await expect(pullRequestRow).toHaveScreenshot(
    "repository-overview-v2-r2-pull-request-mobile.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    },
  );
});

test("loads the next pull request page at the scroll end", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 520 });
  const fixture = await openRepositoryOverviewV2(page, "repository-overview-v2-auto-pagination");
  const pullRequests = fixture.getByRole("region", { name: "Open pull requests" });
  const sentinel = pullRequests.locator("[data-pull-request-load-more-sentinel]");

  await expect(
    pullRequests.getByRole("heading", { name: "8 open pull requests", exact: true }),
  ).toBeVisible();
  await expect(pullRequests.locator("[data-pull-request-number]")).toHaveCount(6);
  await expect(pullRequests.getByRole("button", { name: "Load more" })).toHaveCount(0);
  await expect(sentinel).toHaveCount(1);

  await sentinel.evaluate((element) => element.scrollIntoView({ block: "end" }));
  await expect(pullRequests.locator("[data-pull-request-number]")).toHaveCount(8);
  await expect(sentinel).toHaveCount(0);
});

test("keeps the overview hierarchy and pull request actions clear on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await openRepositoryOverviewV2(page, "repository-overview-v2");

  const firstPullRequest = fixture.getByRole("button", {
    name: /Show the exact preview for each pull request/,
  });
  await expect(firstPullRequest).toBeVisible();
  const firstPullRequestRow = firstPullRequest.locator("xpath=ancestor::article");
  await expect(firstPullRequestRow).toContainText("+40");
  await expect(firstPullRequestRow).toContainText("−10");
  await expect(firstPullRequestRow).toContainText("3 files");

  await firstPullRequest.click();
  await expect(firstPullRequestRow.getByText("needs review", { exact: true })).toBeVisible();
  await expect(firstPullRequestRow.getByRole("group", { name: /^Alchemy stack / })).toHaveCount(0);
  await expect(firstPullRequestRow.getByRole("group", { name: "Other previews" })).toHaveCount(0);
  await expect(fixture.getByText(NO_STACK_LINE, { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(fixture).toHaveScreenshot("repository-overview-v2-mobile.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("keeps repository identity and removal in mobile settings", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await openRepositoryOverviewV2(page, "repository-overview-v2-settings");

  await expect(fixture.getByRole("heading", { name: "Repository", exact: true })).toBeVisible();
  await expect(fixture.getByRole("button", { name: "Remove from Samebase" })).toBeEnabled();
  await expect(fixture.getByRole("heading", { name: "Connections" })).toHaveCount(0);
  await expect(fixture.getByRole("button", { name: "Add Cloudflare Worker" })).toHaveCount(0);
  await expect(fixture.getByRole("button", { name: "Add Convex project" })).toHaveCount(0);
  await expect(fixture).toHaveScreenshot("repository-overview-v2-settings-mobile.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("serves the Worker Previews migration guide", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs/cloudflare-previews-migration");
  await expect(page).toHaveURL(/\/docs\/cloudflare-previews-migration$/);
  await expect(
    page.getByRole("heading", { name: "Migrate to Cloudflare Worker Previews", exact: true }),
  ).toBeInViewport();
  await expect(page.getByRole("heading", { name: "Switch Cloudflare", exact: true })).toBeVisible();
  const markdownResponse = await page.request.get("/docs/cloudflare-previews-migration.md");
  expect(markdownResponse.status()).toBe(200);
  expect(await markdownResponse.text()).toContain("# Migrate to Cloudflare Worker Previews");
});

test("covers the mobile repository removal dialog", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRepositoryOverviewV2(page, "repository-overview-v2-delete-dialog");

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /Remove .* from Samebase/ })).toBeVisible();
  await expect(dialog.getByRole("checkbox")).toHaveCount(1);
  await expect(dialog).toHaveScreenshot("repository-overview-v2-delete-dialog-mobile.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("covers default-branch and pull-request check details", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  const fixture = await openRepositoryOverviewV2(page, "repository-overview-v2");

  await fixture.getByTitle("Show main checks").click();
  const defaultBranchPopover = page.getByRole("dialog", { name: "main checks" });
  await expect(defaultBranchPopover).toBeVisible();
  await expect(defaultBranchPopover).toHaveScreenshot(
    "repository-overview-v2-default-branch-checks.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    },
  );

  await page.keyboard.press("Escape");
  await fixture.getByTitle("Show pull request #1260 checks").click();
  const pullRequestPopover = page.getByRole("dialog", {
    name: "Pull request #1260 checks",
  });
  await expect(pullRequestPopover).toBeVisible();
  await expect(pullRequestPopover).toHaveScreenshot(
    "repository-overview-v2-pull-request-checks.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    },
  );
});

test("renders and drags the production Convex schema graph", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const desktopFixture = await openRepositoryOverviewV2(
    page,
    "repository-overview-v2-convex-schema",
  );
  const schemaNodes = desktopFixture.locator(".react-flow__node-schemaTable");
  await expect(schemaNodes).toHaveCount(5);
  await expect(desktopFixture).toHaveScreenshot(
    "repository-overview-v2-convex-schema-desktop.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    },
  );

  const firstNode = schemaNodes.first();
  const beforeDrag = await firstNode.boundingBox();
  expect(beforeDrag).not.toBeNull();
  if (beforeDrag) {
    await page.mouse.move(
      beforeDrag.x + beforeDrag.width / 2,
      beforeDrag.y + beforeDrag.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      beforeDrag.x + beforeDrag.width / 2 + 60,
      beforeDrag.y + beforeDrag.height / 2 + 40,
      { steps: 5 },
    );
    await page.mouse.up();
    const afterDrag = await firstNode.boundingBox();
    expect(afterDrag).not.toBeNull();
    if (afterDrag) {
      expect(afterDrag.x).toBeGreaterThan(beforeDrag.x + 30);
      expect(afterDrag.y).toBeGreaterThan(beforeDrag.y + 20);
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileFixture = await openRepositoryOverviewV2(
    page,
    "repository-overview-v2-convex-schema",
  );
  await expect(mobileFixture.locator(".react-flow__node-schemaTable")).toHaveCount(5);
  await expect(mobileFixture).toHaveScreenshot("repository-overview-v2-convex-schema-mobile.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("uses stable shells while independent data sources load", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const loadingFixture = await openRepositoryOverviewV2(page, "repository-overview-v2-loading");

  await expect(loadingFixture.getByLabel("Loading repository overview")).toBeVisible();
  await expect(loadingFixture).toHaveScreenshot("repository-overview-v2-loading-mobile.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });

  const partialFixture = await openRepositoryOverviewV2(
    page,
    "repository-overview-v2-partial-loading",
  );
  await expect(partialFixture.getByRole("link", { name: "main", exact: true })).toBeVisible();
  await expect(partialFixture.getByLabel("Loading production destinations")).toBeVisible();
  await expect(
    partialFixture.getByRole("button", {
      name: /Show the exact preview for each pull request/,
    }),
  ).toBeVisible();
  await expect(partialFixture).toHaveScreenshot(
    "repository-overview-v2-partial-loading-mobile.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    },
  );

  const settingsFixture = await openRepositoryOverviewV2(
    page,
    "repository-overview-v2-settings-loading",
  );
  await expect(settingsFixture.getByLabel("Loading repository settings")).toBeVisible();
  await expect(settingsFixture).toHaveScreenshot(
    "repository-overview-v2-settings-loading-mobile.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    },
  );
});

test("keeps the commit and pull requests when the store cannot be read", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  const fixture = await openRepositoryOverviewV2(page, "repository-overview-v2-store-unreadable");

  await expect(fixture.getByText(STORE_READ_FAILED, { exact: true })).toBeVisible();
  await expect(fixture.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(fixture.getByText(NO_STACK_LINE, { exact: true })).toHaveCount(0);
  await expect(fixture.getByText("Keep repository provider observations explicit")).toBeVisible();
  await expect(fixture.locator('[data-pull-request-number="1260"]')).toBeVisible();
  await expect(fixture).toHaveScreenshot("repository-overview-v2-store-unreadable.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("says what is true without a store or a Convex connection", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });

  const missingFixture = await openRepositoryOverviewV2(
    page,
    "repository-overview-v2-store-missing",
  );
  await expect(
    missingFixture.getByText("This team has no Alchemy state store yet.", { exact: true }),
  ).toBeVisible();
  await expect(missingFixture.getByRole("button", { name: "Retry" })).toHaveCount(0);

  const noConvexFixture = await openRepositoryOverviewV2(page, "repository-overview-v2-no-convex");
  await expect(
    noConvexFixture.getByText(
      "This repository has no Convex connection, so Samebase cannot read its stacks.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(noConvexFixture.getByRole("button", { name: "Retry" })).toHaveCount(0);
});

test("keeps the Retry notice for a failed provider setup", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 700 });
  const fixture = await openRepositoryOverviewV2(
    page,
    "repository-overview-v2-cloudflare-github-authorization-failed",
  );

  await expect(fixture.getByRole("heading", { name: "Provider setup failed" })).toBeVisible();
  await expect(
    fixture.getByText(
      "Cloudflare Workers and Pages GitHub App is not authorized for noter-guest/tmp-testing-waters.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(fixture.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(fixture.getByRole("link", { name: "Cloudflare recovery guide" })).toHaveCount(0);
  await expect(fixture.locator("ol > li")).toHaveCount(0);
  await expect(fixture).toHaveScreenshot(
    "repository-overview-v2-cloudflare-github-authorization-failed.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    },
  );
});

test("reproduces the observed new repository provisioning states", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 995 });

  const sourceFixture = await openRepositoryOverviewV2(
    page,
    "repository-overview-v2-provisioning-source",
  );
  await expect(sourceFixture.getByRole("status")).toHaveText("Creating GitHub repository");
  await expect(sourceFixture.getByText("The GitHub repository is not ready yet.")).toHaveCount(0);
  await expect(sourceFixture.getByRole("heading", { name: "Open pull requests" })).toHaveCount(0);

  const githubFixture = await openRepositoryOverviewV2(
    page,
    "repository-overview-v2-provisioning-github",
  );
  await expect(githubFixture.getByRole("status")).toHaveText("Setting up");
  await expect(githubFixture.getByRole("link", { name: "main", exact: true })).toBeVisible();
  await expect(githubFixture.getByLabel("Loading default branch commit")).toBeVisible();
  await expect(githubFixture.getByRole("heading", { name: "Open pull requests" })).toBeVisible();

  const earlyEmptyFixture = await openRepositoryOverviewV2(
    page,
    "repository-overview-v2-provisioning-early-empty",
  );
  await expect(earlyEmptyFixture.getByRole("status")).toHaveText("Setting up");
  await expect(earlyEmptyFixture.getByText("No default branch commit is available.")).toBeVisible();
  await expect(earlyEmptyFixture.getByText(/^No open pull requests\.?$/)).toHaveCount(1);
  await expect(earlyEmptyFixture.getByText(NO_STACK_LINE, { exact: true })).toHaveCount(0);

  const completeEmptyFixture = await openRepositoryOverviewV2(
    page,
    "repository-overview-v2-provisioning-complete-empty",
  );
  await expect(completeEmptyFixture.getByRole("status")).toHaveCount(0);
  await expect(
    completeEmptyFixture.getByText("No default branch commit is available."),
  ).toBeVisible();
  await expect(completeEmptyFixture.getByText(/^No open pull requests\.?$/)).toHaveCount(1);
  await expect(completeEmptyFixture.getByText(NO_STACK_LINE, { exact: true })).toHaveCount(0);

  const staleEmptyFixture = await openRepositoryOverviewV2(
    page,
    "repository-overview-v2-provisioning-stale-empty",
  );
  await expect(staleEmptyFixture.getByText(/^No open pull requests\.?$/)).toHaveCount(1);

  const commitFixture = await openRepositoryOverviewV2(
    page,
    "repository-overview-v2-provisioning-commit",
  );
  await expect(commitFixture.getByText("Initialize Samebase app")).toBeVisible();
  await expect(commitFixture.getByLabel("Loading production destinations")).toBeVisible();

  const readyFixture = await openRepositoryOverviewV2(
    page,
    "repository-overview-v2-provisioning-ready",
  );
  await expect(
    readyFixture.getByRole("link", { name: "dazzling-pheasant-894", exact: true }),
  ).toBeVisible();
  await expect(readyFixture.getByText(NO_STACK_LINE, { exact: true })).toHaveCount(0);
  await expect(readyFixture.getByText(/^No open pull requests\.?$/)).toHaveCount(1);
});

test("disables Remove from Samebase while provider setup runs", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 995 });
  const fixture = await openRepositoryOverviewV2(page, "repository-overview-v2-settings-active");

  await expect(fixture.getByText("Repository setup is still running.")).toBeVisible();
  await expect(fixture.getByRole("button", { name: "Remove from Samebase" })).toBeDisabled();
  await expect(fixture).toHaveScreenshot("repository-overview-v2-settings-active.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("preserves repository identity at the minimum sidebar width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await openRepositoryOverviewV2(page, "repository-overview-v2", {
    ...REPOSITORY_OVERVIEW_V2_SIDEBAR_STATE,
    leftMobileWidthPx: MOBILE_MINIMUM_SIDEBAR_WIDTH_PX,
    mobilePane: "left",
  });
  const repositoryNavigation = fixture.getByRole("navigation", { name: "Repositories" });

  const selectedRepository = repositoryNavigation.getByRole("link", {
    name: "samebase/samebase, 4/4 passed, 3 open pull requests",
    exact: true,
  });
  await expect(selectedRepository).toBeVisible();
  await expect(selectedRepository.getByText("samebase/", { exact: true })).toBeHidden();
  await expect(selectedRepository.getByText("samebase", { exact: true })).toBeVisible();
  await expect(selectedRepository.getByText("4/4 passed", { exact: true })).toBeVisible();
  for (const organizationName of ["noter", "empty-owner", "samebase"]) {
    await expect(
      repositoryNavigation
        .getByRole("button", { name: organizationName, exact: true })
        .locator(".lucide-chevron-down"),
    ).toBeHidden();
  }
  await expect(repositoryNavigation).toHaveScreenshot(
    "repository-overview-v2-minimum-sidebar.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    },
  );
});

test("exposes each raw source separately in developer mode", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  const fixture = await openRepositoryOverviewV2(page, "repository-overview-v2-dev");

  await expect(fixture.getByRole("heading", { name: "Data inspector" })).toBeVisible();
  const sectionHeadings = await fixture.getByRole("heading", { level: 2 }).allTextContents();
  expect(sectionHeadings.indexOf("Data inspector")).toBeLessThan(
    sectionHeadings.indexOf("3 open pull requests"),
  );
  const repositoryContract = fixture.getByText("Repository contract", { exact: true });
  await repositoryContract.click();
  await expect(repositoryContract.locator("..").locator("pre")).toContainText(
    '"githubRepositoryFullName": "samebase/samebase"',
  );
  await expect(fixture.getByText("GitHub observations", { exact: true })).toBeVisible();
  await expect(fixture.getByText("Cloudflare observations", { exact: true })).toHaveCount(0);
  await expect(fixture.getByText("Convex observations", { exact: true })).toHaveCount(0);
  await expect(fixture.getByText("Derived presentation", { exact: true })).toBeVisible();
});
