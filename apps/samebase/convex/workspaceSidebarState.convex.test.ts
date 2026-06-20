import { describe, expect, it } from "vite-plus/test";

import { api } from "./_generated/api";
import { makeConvexTest } from "./test.setup";
import type { WorkspaceSidebarState } from "./workspaceSidebarStateModel";

const RIGHT_PANE_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: 280,
  leftMobileWidthPx: 280,
  mobilePane: "right",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: true,
  rightDesktopWidthPx: 320,
  rightMobileWidthPx: 320,
} satisfies WorkspaceSidebarState;

const MAIN_PANE_STATE = {
  ...RIGHT_PANE_STATE,
  mobilePane: "main",
} satisfies WorkspaceSidebarState;

describe("workspace sidebar state Convex contract", () => {
  it("denies anonymous sidebar persistence", async () => {
    const t = makeConvexTest();

    await expect(
      t.mutation(api.workspaceSidebarState.setWorkspaceSidebarState, {
        state: MAIN_PANE_STATE,
        workspaceKey: "app",
      }),
    ).rejects.toThrowError("Access denied");
    await expect(
      t.query(api.workspaceSidebarState.getWorkspaceSidebarState, {
        workspaceKey: "app",
      }),
    ).resolves.toBeNull();
  });

  it("lets waitlisted users update their own public shell sidebar state", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Waitlisted",
        email: "waitlisted@example.com",
        isApproved: false,
      });
    });
    const asWaitlisted = t.withIdentity({
      subject: `${userId}|waitlisted-session`,
      tokenIdentifier: `test:${userId}`,
    });

    await asWaitlisted.mutation(api.workspaceSidebarState.setWorkspaceSidebarState, {
      state: RIGHT_PANE_STATE,
      workspaceKey: "app",
    });
    await asWaitlisted.mutation(api.workspaceSidebarState.setWorkspaceSidebarState, {
      state: MAIN_PANE_STATE,
      workspaceKey: "app",
    });

    await expect(
      asWaitlisted.query(api.workspaceSidebarState.getWorkspaceSidebarState, {
        workspaceKey: "app",
      }),
    ).resolves.toEqual(MAIN_PANE_STATE);
  });
});
