import { describe, expect, it, vi } from "vite-plus/test";
import { queueExistingRepositoryAndNavigateToDashboard } from "./existingRepositoryConnectHandoff";

describe("queueExistingRepositoryAndNavigateToDashboard", () => {
  it("queues the /add connection before navigating to the dashboard", async () => {
    const calls: string[] = [];
    const connectRepository = vi.fn(
      async (args: { appRoot: string; repositoryFullName: string }) => {
        calls.push(`connect:${args.repositoryFullName}:${args.appRoot}`);
      },
    );
    const navigateByHref = vi.fn((href: string, options?: { replace?: boolean }) => {
      calls.push(`navigate:${href}:${options?.replace ? "replace" : "push"}`);
    });

    await queueExistingRepositoryAndNavigateToDashboard({
      connectRepository,
      appRoot: "apps/domain-router",
      navigateByHref,
      repositoryFullName: "noter-md/noter",
      search: { "prod-ui": true },
    });

    expect(connectRepository).toHaveBeenCalledWith({
      appRoot: "apps/domain-router",
      repositoryFullName: "noter-md/noter",
    });
    expect(navigateByHref).toHaveBeenCalledWith("/home?prod-ui", undefined);
    expect(calls).toEqual([
      "connect:noter-md/noter:apps/domain-router",
      "navigate:/home?prod-ui:push",
    ]);
  });

  it("replaces the direct file route with the dashboard after queueing", async () => {
    const connectRepository = vi.fn(
      async (_args: { appRoot: string; repositoryFullName: string }) => undefined,
    );
    const navigateByHref = vi.fn((_href: string, _options?: { replace?: boolean }) => undefined);

    await queueExistingRepositoryAndNavigateToDashboard({
      connectRepository,
      appRoot: ".",
      navigateByHref,
      repositoryFullName: "noter-md/noter",
      replace: true,
      search: { review: true, mobileLineNumbers: "1" },
    });

    expect(connectRepository).toHaveBeenCalledWith({
      appRoot: ".",
      repositoryFullName: "noter-md/noter",
    });
    expect(navigateByHref).toHaveBeenCalledWith("/home?review&mobileLineNumbers=1", {
      replace: true,
    });
  });

  it("does not navigate when queueing fails", async () => {
    const connectRepository = vi.fn(
      async (_args: { appRoot: string; repositoryFullName: string }) => {
        throw new Error("GitHub is not connected");
      },
    );
    const navigateByHref = vi.fn((_href: string, _options?: { replace?: boolean }) => undefined);

    await expect(
      queueExistingRepositoryAndNavigateToDashboard({
        connectRepository,
        appRoot: ".",
        navigateByHref,
        repositoryFullName: "noter-md/noter",
        search: {},
      }),
    ).rejects.toThrow("GitHub is not connected");

    expect(navigateByHref).not.toHaveBeenCalled();
  });
});
