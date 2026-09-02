import { describe, expect, it, vi } from "vite-plus/test";
import { queueExistingRepositoryAndNavigateToDashboard } from "./existingRepositoryConnectHandoff";

describe("queueExistingRepositoryAndNavigateToDashboard", () => {
  it("navigates with the verified current repository route returned by the connection", async () => {
    const calls: string[] = [];
    const connectRepository = vi.fn(async (args: { ghRepoId: string }) => {
      calls.push(`connect:${args.ghRepoId}`);
      return { repositoryFullName: "samebase/plugin" };
    });
    const navigateByHref = vi.fn((href: string, options?: { replace?: boolean }) => {
      calls.push(`navigate:${href}:${options?.replace ? "replace" : "push"}`);
    });

    await queueExistingRepositoryAndNavigateToDashboard({
      connectRepository,
      ghRepoId: "1296269",
      navigateByHref,
      search: { "prod-ui": true },
    });

    expect(connectRepository).toHaveBeenCalledWith({
      ghRepoId: "1296269",
    });
    expect(navigateByHref).toHaveBeenCalledWith("/repo/samebase/plugin?prod-ui", undefined);
    expect(calls).toEqual(["connect:1296269", "navigate:/repo/samebase/plugin?prod-ui:push"]);
  });

  it("replaces the direct file route with the dashboard after queueing", async () => {
    const connectRepository = vi.fn(async (_args: { ghRepoId: string }) => ({
      repositoryFullName: "samebase/samebase",
    }));
    const navigateByHref = vi.fn((_href: string, _options?: { replace?: boolean }) => undefined);

    await queueExistingRepositoryAndNavigateToDashboard({
      connectRepository,
      ghRepoId: "1296269",
      navigateByHref,
      replace: true,
      search: { diff: true, mobileLineNumbers: "1" },
    });

    expect(connectRepository).toHaveBeenCalledWith({
      ghRepoId: "1296269",
    });
    expect(navigateByHref).toHaveBeenCalledWith(
      "/repo/samebase/samebase?diff&mobileLineNumbers=1",
      {
        replace: true,
      },
    );
  });

  it("does not navigate when queueing fails", async () => {
    const connectRepository = vi.fn(async (_args: { ghRepoId: string }) => {
      throw new Error("GitHub is not connected");
    });
    const navigateByHref = vi.fn((_href: string, _options?: { replace?: boolean }) => undefined);

    await expect(
      queueExistingRepositoryAndNavigateToDashboard({
        connectRepository,
        ghRepoId: "1296269",
        navigateByHref,
        search: {},
      }),
    ).rejects.toThrow("GitHub is not connected");

    expect(navigateByHref).not.toHaveBeenCalled();
  });
});
