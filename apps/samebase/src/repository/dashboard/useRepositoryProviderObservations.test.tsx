// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../../convex/_generated/dataModel";
import { useRepositoryProviderObservations } from "./useRepositoryProviderObservations";

const alchemy = vi.hoisted(() => ({
  requested: vi.fn<(repositoryId: Id<"repositories"> | null) => void>(),
}));

vi.mock("./useRepositoryAlchemyState", () => ({
  useRepositoryAlchemyState: (repositoryId: Id<"repositories"> | null) => {
    alchemy.requested(repositoryId);
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

  it("reads no store for a repository without a Convex team", async () => {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let latest: ReturnType<typeof useRepositoryProviderObservations> | undefined;

    function Probe() {
      latest = useRepositoryProviderObservations({
        repositoryId: fakeRepositoryId("repository-without-team"),
        sourceSetup: { status: "not_applicable" },
        hasConnectedGitHubRepository: true,
      });
      return null;
    }

    try {
      await act(async () => {
        root.render(<Probe />);
      });
      expect(alchemy.requested).toHaveBeenLastCalledWith(null);
      expect(latest).toMatchObject({ state: "loaded", observation: { store: "no_connection" } });
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
      expect(alchemy.requested).toHaveBeenLastCalledWith(null);
      // Waiting is not a read that found no store.
      expect(latest).toEqual({ state: "loading" });

      await render({ hasConnectedGitHubRepository: true, sourceSetup: { status: "ready" } });
      expect(alchemy.requested).toHaveBeenLastCalledWith(repositoryId);
      expect(latest).toMatchObject({ state: "loaded" });

      // A failed creation will not connect by itself, so the read reports its own result.
      await render({ hasConnectedGitHubRepository: false, sourceSetup: { status: "failed" } });
      expect(alchemy.requested).toHaveBeenLastCalledWith(repositoryId);
    } finally {
      await act(async () => {
        root.unmount();
      });
      rootElement.remove();
    }
  });
});
