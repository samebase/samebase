import { expect, test as base, type Page } from "@playwright/test";
import { APP_WORKSPACE_SIDEBAR_STORAGE_KEY } from "../src/appShell/appWorkspaceSidebarPreferences";
import type { WorkspaceSidebarState } from "../convex/userPreferenceModel";

const STORED_APP_WORKSPACE_SIDEBAR_STATE_VERSION = 2;

const VISUAL_FIXTURE_WORKSPACE_SIDEBAR_STATE = {
  leftDesktopOpen: false,
  leftDesktopWidthPx: 240,
  leftMobileWidthPx: 240,
  mobilePane: "main",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: false,
  rightDesktopWidthPx: 288,
  rightMobileWidthPx: 288,
} satisfies WorkspaceSidebarState;

export async function seedVisualFixtureWorkspaceSidebarState(
  page: Page,
  overrides: Partial<WorkspaceSidebarState> = {},
) {
  const state = {
    ...VISUAL_FIXTURE_WORKSPACE_SIDEBAR_STATE,
    ...overrides,
  } satisfies WorkspaceSidebarState;
  await page.addInitScript(
    ({ state, storageKey, version }) => {
      window.localStorage.setItem(storageKey, JSON.stringify({ state, version }));
    },
    {
      state,
      storageKey: APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
      version: STORED_APP_WORKSPACE_SIDEBAR_STATE_VERSION,
    },
  );
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await seedVisualFixtureWorkspaceSidebarState(page);
    await use(page);
  },
});

export { expect };
export type { Locator, Page, TestInfo } from "@playwright/test";
