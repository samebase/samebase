// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../../convex/_generated/dataModel";
import { useRepositoryProviderObservations } from "./useRepositoryProviderObservations";

const alchemy = vi.hoisted(() => ({
  requested: vi.fn<(repositoryId: Id<"repositories"> | null, repository?: string) => void>(),
}));

vi.mock("./useRepositoryAlchemyState", () => ({
  useRepositoryAlchemyState: (
    repositoryId: Id<"repositories"> | null,
    _convexTeamId: string | undefined,
    repository: string | undefined,
  ) => {
    alchemy.requested(repositoryId, repository);
    return {
      state: "loaded",
      observation: { store: repositoryId ? "missing" : "no_connection" },
      refreshFailed: false,
      reload: () => {},
    };
  },
}));

function fakeRepositoryId(value: string): Id<"repositories"> {
  // @ts-expect-error Convex ids are strings at runtime; this hook test only needs a stable value.
  return value;
}

describe("useRepositoryProviderObservations", () => {
  beforeEach(() => {
    alchemy.requested.mockClear();
  });

  it("reads a repository without a Convex team, whose stacks can be in Cloudflare", async () => {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let latest: ReturnType<typeof useRepositoryProviderObservations> | undefined;

    function Probe() {
      latest = useRepositoryProviderObservations({
        repositoryId: fakeRepositoryId("repository-without-team"),
        githubRepositoryFullName: "samebase/without-team",
        sourceSetup: { status: "not_applicable" },
        hasConnectedGitHubRepository: true,
      });
      return null;
    }

    try {
      await act(async () => {
        root.render(<Probe />);
      });
      expect(alchemy.requested).toHaveBeenLastCalledWith(
        fakeRepositoryId("repository-without-team"),
        "samebase/without-team",
      );
      expect(latest).toMatchObject({ state: "loaded" });
    } finally {
      await act(async () => {
        root.unmount();
      });
      rootElement.remove();
    }
  });

  it("holds the team store read as loading while Samebase creates the repository", async () => {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    const repositoryId = fakeRepositoryId("repository-being-created");
    let latest: ReturnType<typeof useRepositoryProviderObservations> | undefined;

    function Probe({
      hasConnectedGitHubRepository,
      sourceSetup,
    }: {
      hasConnectedGitHubRepository: boolean;
      sourceSetup: { status: "running" | "failed" | "ready" };
    }) {
      latest = useRepositoryProviderObservations({
        repositoryId,
        convexTeamId: "38516",
        githubRepositoryFullName: "samebase/being-created",
        sourceSetup,
        hasConnectedGitHubRepository,
      });
      return null;
    }

    async function render(props: Parameters<typeof Probe>[0]) {
      await act(async () => {
        root.render(<Probe {...props} />);
      });
    }

    try {
      await render({ hasConnectedGitHubRepository: false, sourceSetup: { status: "running" } });
      expect(alchemy.requested).toHaveBeenLastCalledWith(null, "samebase/being-created");
      // Waiting is not a read that found no store.
      expect(latest).toEqual({ state: "loading" });

      await render({ hasConnectedGitHubRepository: true, sourceSetup: { status: "ready" } });
      expect(alchemy.requested).toHaveBeenLastCalledWith(repositoryId, "samebase/being-created");
      expect(latest).toMatchObject({ state: "loaded" });

      // A failed creation will not connect by itself, so the read reports its own result.
      await render({ hasConnectedGitHubRepository: false, sourceSetup: { status: "failed" } });
      expect(alchemy.requested).toHaveBeenLastCalledWith(repositoryId, "samebase/being-created");
    } finally {
      await act(async () => {
        root.unmount();
      });
      rootElement.remove();
    }
  });
});
