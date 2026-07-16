import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { TestRouterProvider } from "@/test/TestRouterProvider";
import type { RepositorySummaryDirectoryEntry } from "@/hooks/useRepositorySummaryDirectory";
import type { Id } from "../../../convex/_generated/dataModel";
import { RepositorySummaryDirectoryPane } from "./RepositorySummaryDirectory";

const now = Date.UTC(2026, 6, 16, 12, 0, 0);

function vaultId(value: string): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; fixtures use readable stable ids.
  return value;
}

function connectedEntry(args: {
  id: string;
  repositoryFullName: string;
  state: Omit<
    Extract<RepositorySummaryDirectoryEntry["state"], { state: "connected" }>,
    "githubRepositoryFullName"
  >;
}): RepositorySummaryDirectoryEntry {
  return {
    vaultId: vaultId(args.id),
    routeRepositoryFullName: args.repositoryFullName,
    state: {
      ...args.state,
      githubRepositoryFullName: args.repositoryFullName,
    },
  };
}

describe("RepositorySummaryDirectoryPane", () => {
  it("shows exact default-branch status, zero PRs, and freshness", () => {
    const entry = connectedEntry({
      id: "vault-demo",
      repositoryFullName: "ada/demo",
      state: {
        state: "connected",
        summary: {
          lifecycle: { state: "idle" },
          publication: {
            state: "complete",
            repositoryFullName: "ada/demo",
            defaultBranch: {
              state: "ready",
              name: "main",
              headSha: "abc123",
              checkState: "success",
            },
            openPullRequestCount: 0,
            publishedAt: now - 300_000,
            checkedAt: now - 300_000,
          },
        },
      },
    });
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/"]}>
        <RepositorySummaryDirectoryPane
          entries={[entry]}
          error={null}
          loadMore={() => {}}
          now={now}
          selectedVaultId={entry.vaultId}
          status="Exhausted"
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain("Vaults");
    expect(markup).toContain("ada/demo");
    expect(markup).toContain("main");
    expect(markup).toContain("0 PRs");
    expect(markup).toContain("5m ago");
    expect(markup).toContain('aria-label="Checks passing"');
    expect(markup).toContain('href="/vault/ada/demo"');
    expect(markup).not.toContain("Update failed");
  });

  it("keeps complete data visible while exposing update and failure states", () => {
    const completePublication = {
      state: "complete" as const,
      repositoryFullName: "ada/canonical",
      defaultBranch: {
        state: "ready" as const,
        name: "trunk",
        headSha: "def456",
        checkState: "failure" as const,
      },
      openPullRequestCount: 1_240,
      publishedAt: now - 600_000,
      checkedAt: now - 600_000,
    };
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/"]}>
        <RepositorySummaryDirectoryPane
          entries={[
            connectedEntry({
              id: "vault-updating",
              repositoryFullName: "ada/updating",
              state: {
                state: "connected",
                summary: {
                  lifecycle: { state: "updating" },
                  publication: completePublication,
                },
              },
            }),
            connectedEntry({
              id: "vault-failed",
              repositoryFullName: "ada/failed",
              state: {
                state: "connected",
                summary: {
                  lifecycle: {
                    state: "failed",
                    failedAt: now,
                    message: "GitHub timed out.",
                  },
                  publication: completePublication,
                },
              },
            }),
          ]}
          error={null}
          loadMore={() => {}}
          now={now}
          selectedVaultId={null}
          status="CanLoadMore"
        />
      </TestRouterProvider>,
    );

    expect(markup.split("trunk")).toHaveLength(3);
    expect(markup.split("1,240 PRs")).toHaveLength(3);
    expect(markup).toContain("Updating");
    expect(markup).toContain("Update failed");
    expect(markup).toContain("GitHub timed out.");
    expect(markup).toContain('aria-label="Checks failing"');
    expect(markup).toContain("Load more");
  });

  it("renders every state before the first successful observation", () => {
    const entries: RepositorySummaryDirectoryEntry[] = [
      connectedEntry({
        id: "vault-unobserved",
        repositoryFullName: "ada/unobserved",
        state: {
          state: "connected",
          summary: {
            lifecycle: { state: "idle" },
            publication: { state: "unobserved" },
          },
        },
      }),
      connectedEntry({
        id: "vault-unavailable",
        repositoryFullName: "ada/unavailable",
        state: {
          state: "connected",
          summary: {
            lifecycle: {
              state: "unavailable",
              observedAt: now,
              reason: "repository_unavailable",
            },
            publication: { state: "unobserved" },
          },
        },
      }),
      {
        vaultId: vaultId("vault-provisioning"),
        routeRepositoryFullName: "ada/provisioning",
        state: { state: "provisioning", startedAt: now },
      },
      {
        vaultId: vaultId("vault-setup-failed"),
        routeRepositoryFullName: "ada/setup-failed",
        state: { state: "setup_failed", failedAt: now },
      },
      {
        vaultId: vaultId("vault-deleting"),
        routeRepositoryFullName: "ada/deleting",
        state: { state: "deleting", requestedAt: now },
      },
      {
        vaultId: vaultId("vault-delete-failed"),
        routeRepositoryFullName: "ada/delete-failed",
        state: { state: "delete_failed", failedAt: now },
      },
    ];
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/"]}>
        <RepositorySummaryDirectoryPane
          entries={entries}
          error="Directory request failed."
          loadMore={() => {}}
          now={now}
          selectedVaultId={null}
          status="Exhausted"
        />
      </TestRouterProvider>,
    );

    for (const label of [
      "Not observed yet",
      "Repository unavailable",
      "Connecting repository",
      "Setup failed",
      "Removing vault",
      "Removal failed",
      "Could not update vaults.",
    ]) {
      expect(markup).toContain(label);
    }
  });
});
