import { describe, expect, it, vi } from "vite-plus/test";
import { queueExistingRepositoryAndNavigateToDashboard } from "./existingRepositoryConnectHandoff";

describe("queueExistingRepositoryAndNavigateToDashboard", () => {
  it("queues the /connect-repo connection before navigating to the dashboard", async () => {
    const calls: string[] = [];
    const connectRepository = vi.fn(async (args: { repositoryFullName: string }) => {
      calls.push(`connect:${args.repositoryFullName}`);
      return { repositoryFullName: "Samebase/Samebase" };
    });
    const navigateByHref = vi.fn((href: string, options?: { replace?: boolean }) => {
      calls.push(`navigate:${href}:${options?.replace ? "replace" : "push"}`);
    });

    await queueExistingRepositoryAndNavigateToDashboard({
      connectRepository,
      navigateByHref,
      repositoryFullName: "samebase/samebase",
      search: { "prod-ui": true },
    });

    expect(connectRepository).toHaveBeenCalledWith({
      repositoryFullName: "samebase/samebase",
    });
    expect(navigateByHref).toHaveBeenCalledWith("/vault/Samebase/Samebase?prod-ui", undefined);
    expect(calls).toEqual([
      "connect:samebase/samebase",
      "navigate:/vault/Samebase/Samebase?prod-ui:push",
    ]);
  });

  it("replaces the direct file route with the dashboard after queueing", async () => {
    const connectRepository = vi.fn(async (_args: { repositoryFullName: string }) => ({
      repositoryFullName: "samebase/samebase",
    }));
    const navigateByHref = vi.fn((_href: string, _options?: { replace?: boolean }) => undefined);

    await queueExistingRepositoryAndNavigateToDashboard({
      connectRepository,
      navigateByHref,
      repositoryFullName: "samebase/samebase",
      replace: true,
      search: { diff: true, mobileLineNumbers: "1" },
    });

    expect(connectRepository).toHaveBeenCalledWith({
      repositoryFullName: "samebase/samebase",
    });
    expect(navigateByHref).toHaveBeenCalledWith(
      "/vault/samebase/samebase?diff&mobileLineNumbers=1",
      {
        replace: true,
      },
    );
  });

  it("does not navigate when queueing fails", async () => {
    const connectRepository = vi.fn(async (_args: { repositoryFullName: string }) => {
      throw new Error("GitHub is not connected");
    });
    const navigateByHref = vi.fn((_href: string, _options?: { replace?: boolean }) => undefined);

    await expect(
      queueExistingRepositoryAndNavigateToDashboard({
        connectRepository,
        navigateByHref,
        repositoryFullName: "samebase/samebase",
        search: {},
      }),
    ).rejects.toThrow("GitHub is not connected");

    expect(navigateByHref).not.toHaveBeenCalled();
  });
});
