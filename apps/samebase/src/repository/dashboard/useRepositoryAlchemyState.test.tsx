// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { parse } from "convex-helpers/validators";
import type { ConvexClient } from "convex/browser";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { observedSamebaseRepositoryReply } from "../../../convex/repository/fixtures/observedSamebaseAlchemyState";
import {
  ALCHEMY_CONNECTION_UNAVAILABLE,
  vAlchemyStacksRead,
} from "../../../shared/alchemyStateModel";
import type { loadRepositoryOverview } from "@/routes/repository-dashboard.queries";
import {
  useRepositoryAlchemyState,
  type RepositoryAlchemyState,
} from "./useRepositoryAlchemyState";

type Connection = (typeof api.repository.alchemyState.connect)["_returnType"];
type LoaderRead = NonNullable<Awaited<ReturnType<typeof loadRepositoryOverview>>>;
type DeploymentMetadata =
  (typeof api.repository.alchemyState.readDeploymentMetadata)["_returnType"];
const transportError =
  "[CONVEX A(repository/alchemyState:connect)] Connection lost while action was in flight\n  Called by client";
const deploymentMetadata: DeploymentMetadata = [
  {
    deploymentName: "clear-butterfly-858",
    dashboardUrl: "https://dashboard.convex.dev/d/clear-butterfly-858",
    region: null,
    customDomains: [{ domain: "samebase.com", requestDestination: "convexSite" }],
  },
];
/** The read with `change` applied to every row of the stage `prod`. */
function withProdRows(
  read: typeof observedSamebaseRepositoryReply,
  change: (row: { fqn: string; value: string }) => string,
): typeof observedSamebaseRepositoryReply {
  return {
    ...read,
    stacks: read.stacks.map((stack) => ({
      ...stack,
      stages: stack.stages.map((stage) =>
        stage.name === "prod"
          ? { ...stage, resources: stage.resources.map((row) => ({ ...row, value: change(row) })) }
          : stage,
      ),
    })),
  };
}
/**
The captured `reader:repository` reply of samebase/samebase, `pr-1768` and `prod`, with the
`rootDir` "." on the `prod` Site row that 0.8.0 writes for the stack file of `prod` in
apps/samebase, so `prod` has a Convex deployment whose metadata the hook reads.
*/
const liveRead = withProdRows(observedSamebaseRepositoryReply, (row) =>
  row.fqn === "Site"
    ? row.value.replace('"type":"prod"', '"type":"prod","rootDir":"."')
    : row.value,
);
type ClientState = {
  value: ((value: unknown) => void) | undefined;
  error: ((error: Error) => void) | undefined;
  fetchToken: Parameters<ConvexClient["setAuth"]>[0] | undefined;
  close: () => Promise<void>;
};
const mocks = vi.hoisted(() => {
  const clients: ClientState[] = [];
  /** The loader data of the repository overview, the current page. */
  const overview: { read: LoaderRead | undefined } = { read: undefined };
  return {
    connect: vi.fn<() => Promise<Connection>>(),
    metadata: vi.fn<() => Promise<DeploymentMetadata>>(),
    clients,
    userId: "user-a",
    authenticated: true,
    overview,
  };
});

vi.mock("@tanstack/react-router", () => ({
  useMatch: (options: { from: string }) =>
    options.from === "/_authed/repo/$owner/$repository" ? mocks.overview.read : undefined,
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: mocks.authenticated }),
  useQuery: () => ({ _id: mocks.userId }),
  useAction: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference) === "repository/alchemyState:connect"
      ? mocks.connect
      : mocks.metadata,
}));
vi.mock("convex/browser", () => ({
  ConvexClient: class {
    state: ClientState = {
      value: undefined,
      error: undefined,
      fetchToken: undefined,
      close: vi.fn(async () => {}),
    };
    constructor() {
      mocks.clients.push(this.state);
    }
    setAuth(fetchToken: ClientState["fetchToken"]) {
      this.state.fetchToken = fetchToken;
    }
    onUpdate(
      _query: unknown,
      _args: unknown,
      value: ClientState["value"],
      error: ClientState["error"],
    ) {
      this.state.value = value;
      this.state.error = error;
    }
    close() {
      return this.state.close();
    }
  },
}));

let root: Root;
let element: HTMLDivElement;
let queryClient: QueryClient;
let latest: RepositoryAlchemyState;
let repositoryId: Id<"repositories">;
let teamId: string;

function Probe() {
  latest = useRepositoryAlchemyState(repositoryId, teamId);
  return null;
}
async function render() {
  await act(async () => {
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <Probe />
        </QueryClientProvider>
      </StrictMode>,
    );
  });
}
function client() {
  const current = mocks.clients.at(-1);
  if (!current) throw new Error("Store client did not start.");
  return current;
}

beforeEach(() => {
  mocks.clients.length = 0;
  mocks.userId = "user-a";
  mocks.authenticated = true;
  mocks.overview.read = undefined;
  mocks.connect.mockReset();
  mocks.connect.mockResolvedValue({
    store: "live",
    deploymentUrl: "https://test-store.convex.cloud",
    token: "initial-token",
  });
  mocks.metadata.mockReset();
  mocks.metadata.mockResolvedValue([]);
  // @ts-expect-error Convex ids are strings at runtime; this test needs stable repository identity.
  repositoryId = "repository-a";
  teamId = "team-a";
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  for (const current of mocks.clients) expect(current.close).toHaveBeenCalledOnce();
  queryClient.clear();
  element.remove();
  vi.useRealTimers();
});

describe("useRepositoryAlchemyState", () => {
  it("updates from the store and closes the connection on team, user, and auth changes", async () => {
    await render();
    expect(mocks.clients).toHaveLength(1);
    const first = client();
    const callsAfterConnect = mocks.connect.mock.calls.length;
    await act(async () => first.value?.({ store: "found", stacks: [] }));
    expect(latest).toMatchObject({ state: "loaded", observation: { store: "found", stacks: [] } });
    await act(async () =>
      first.value?.({ store: "found", stacks: [{ name: "owner/repo", stages: [] }] }),
    );
    expect(latest).toMatchObject({ observation: { stacks: [{ name: "owner/repo" }] } });
    expect(mocks.connect).toHaveBeenCalledTimes(callsAfterConnect);

    teamId = "team-b";
    await render();
    expect(first.close).toHaveBeenCalledOnce();
    expect(latest).toEqual({ state: "loading" });
    const second = client();
    mocks.userId = "user-b";
    await render();
    expect(second.close).toHaveBeenCalledOnce();
    const third = client();
    // @ts-expect-error Convex ids are strings at runtime; this changes the selected repository.
    repositoryId = "repository-b";
    await render();
    expect(third.close).toHaveBeenCalledOnce();
    const fourth = client();
    mocks.authenticated = false;
    await render();
    expect(fourth.close).toHaveBeenCalledOnce();
    expect(latest).toEqual({ state: "loading" });
    await act(async () => first.value?.({ store: "found", stacks: [] }));
    expect(latest).toEqual({ state: "loading" });
  });

  it("renews auth and clears state when renewal changes the deployment", async () => {
    await render();
    const current = client();
    expect(await current.fetchToken?.({ forceRefreshToken: false })).toBe("initial-token");
    await act(async () => current.value?.({ store: "found", stacks: [] }));
    mocks.connect.mockResolvedValue({
      store: "live",
      deploymentUrl: "https://test-store.convex.cloud",
      token: "renewed-token",
    });
    expect(await current.fetchToken?.({ forceRefreshToken: true })).toBe("renewed-token");
    mocks.connect.mockResolvedValue({
      store: "live",
      deploymentUrl: "https://other-store.convex.cloud",
      token: "replacement-token",
    });
    await act(async () => {
      expect(await current.fetchToken?.({ forceRefreshToken: true })).toBeNull();
    });
    expect(latest.state).toBe("failed");
    expect(current.close).toHaveBeenCalledOnce();
    expect(latest).not.toHaveProperty("observation");
  });

  it("retries temporary renewal failures and stops retries on access denial", async () => {
    await render();
    vi.useFakeTimers();
    const current = client();
    await act(async () => current.value?.({ store: "found", stacks: [] }));
    mocks.connect.mockClear();
    mocks.connect
      .mockRejectedValueOnce(new ConvexError(ALCHEMY_CONNECTION_UNAVAILABLE))
      .mockRejectedValueOnce(new Error(transportError))
      .mockResolvedValueOnce({
        store: "live",
        deploymentUrl: "https://test-store.convex.cloud",
        token: "renewed-token",
      });
    const renewed = current.fetchToken?.({ forceRefreshToken: true });
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(latest.state).toBe("loaded");
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(mocks.connect).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(await renewed).toBe("renewed-token");
    expect(mocks.connect).toHaveBeenCalledTimes(3);

    mocks.connect.mockClear();
    mocks.connect.mockRejectedValue(new ConvexError("Repository access denied."));
    await act(async () => {
      expect(await current.fetchToken?.({ forceRefreshToken: true })).toBeNull();
    });
    expect(latest.state).toBe("failed");
    expect(latest).not.toHaveProperty("observation");
    expect(current.close).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(mocks.connect).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending renewal retry when the user signs out", async () => {
    await render();
    vi.useFakeTimers();
    const current = client();
    mocks.connect.mockClear();
    mocks.connect.mockRejectedValue(new ConvexError(ALCHEMY_CONNECTION_UNAVAILABLE));
    const renewed = current.fetchToken?.({ forceRefreshToken: true });
    await act(async () => vi.advanceTimersByTimeAsync(0));
    mocks.authenticated = false;
    await render();
    expect(await renewed).toBeNull();
    expect(current.close).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(latest).toEqual({ state: "loading" });
  });

  it.each([new ConvexError(ALCHEMY_CONNECTION_UNAVAILABLE), new Error(transportError)])(
    "retries a temporary initial connection failure: %s",
    async (error) => {
      vi.useFakeTimers();
      mocks.connect.mockRejectedValue(error);
      await render();
      const initialCalls = mocks.connect.mock.calls.length;
      expect(latest).toEqual({ state: "loading" });
      mocks.connect.mockResolvedValue({
        store: "live",
        deploymentUrl: "https://test-store.convex.cloud",
        token: "initial-token",
      });
      await act(async () => vi.advanceTimersByTimeAsync(2_000));
      expect(mocks.clients).toHaveLength(1);
      expect(mocks.connect).toHaveBeenCalledTimes(initialCalls + 1);
    },
  );

  it("reports a failed first metadata request", async () => {
    vi.useFakeTimers();
    mocks.metadata.mockRejectedValue(new Error("Deployment metadata is unavailable."));
    await render();
    await act(async () => client().value?.(liveRead));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(mocks.metadata).toHaveBeenCalledOnce();
    expect(latest).toMatchObject({ state: "loaded", refreshFailed: true });
  });

  it.each(["repository", "user", "team"])(
    "keeps metadata across deployment changes but clears it for another %s",
    async (identity) => {
      vi.useFakeTimers();
      mocks.metadata.mockResolvedValue(deploymentMetadata);
      await render();
      await act(async () => client().value?.(liveRead));
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(latest).toMatchObject({ observation: { liveDeployments: deploymentMetadata } });
      mocks.metadata.mockReturnValue(new Promise<DeploymentMetadata>(() => {}));
      const nextRead = withProdRows(liveRead, (row) =>
        row.value.replaceAll("clear-butterfly-858", "new-deployment"),
      );
      await act(async () => client().value?.(nextRead));
      expect(mocks.metadata).toHaveBeenCalledTimes(2);
      expect(latest).toMatchObject({ observation: { liveDeployments: deploymentMetadata } });
      if (identity === "repository") {
        // @ts-expect-error Convex ids are strings at runtime; this changes repository identity.
        repositoryId = "repository-b";
      } else if (identity === "user") {
        mocks.userId = "user-b";
      } else {
        teamId = "team-b";
      }
      await render();
      await act(async () => client().value?.(nextRead));
      expect(latest).toMatchObject({ observation: { liveDeployments: [] } });
    },
  );

  it("starts from the loader's read and subscribes with its token", async () => {
    mocks.overview.read = {
      state: "loaded",
      repositoryId,
      convexTeamId: teamId,
      connection: {
        store: "live",
        deploymentUrl: "https://test-store.convex.cloud",
        token: "loader-token",
        snapshot: parse(vAlchemyStacksRead, liveRead),
      },
    };
    // The server render and the hydration know no session yet.
    mocks.authenticated = false;
    await render();
    expect(latest).toMatchObject({ state: "loaded", observation: { stacks: liveRead.stacks } });
    expect(mocks.clients).toHaveLength(0);

    mocks.authenticated = true;
    await render();
    const current = client();
    expect(await current.fetchToken?.({ forceRefreshToken: false })).toBe("loader-token");
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(latest).toMatchObject({ state: "loaded", observation: { stacks: liveRead.stacks } });
    await act(async () => current.value?.({ store: "found", stacks: [] }));
    expect(latest).toMatchObject({ state: "loaded", observation: { store: "found", stacks: [] } });

    // The renewal checks access again.
    mocks.connect.mockResolvedValue({
      store: "live",
      deploymentUrl: "https://test-store.convex.cloud",
      token: "renewed-token",
    });
    expect(await current.fetchToken?.({ forceRefreshToken: true })).toBe("renewed-token");
    expect(mocks.connect).toHaveBeenCalledOnce();

    // The read belongs to its repository.
    // @ts-expect-error Convex ids are strings at runtime; this changes the selected repository.
    repositoryId = "repository-b";
    await render();
    expect(current.close).toHaveBeenCalledOnce();
    expect(latest).toEqual({ state: "loading" });
  });

  it("shows a failed loader read while the browser connects again", async () => {
    mocks.overview.read = {
      state: "failed",
      repositoryId,
      convexTeamId: teamId,
      message: ALCHEMY_CONNECTION_UNAVAILABLE,
    };
    mocks.authenticated = false;
    await render();
    expect(latest).toMatchObject({
      state: "failed",
      error: { message: ALCHEMY_CONNECTION_UNAVAILABLE },
    });

    mocks.authenticated = true;
    await render();
    expect(mocks.connect).toHaveBeenCalled();
    expect(latest.state).toBe("failed");
    await act(async () => client().value?.(liveRead));
    expect(latest).toMatchObject({ state: "loaded", observation: { stacks: liveRead.stacks } });
  });

  it("opens no client without a Convex connection", async () => {
    mocks.connect.mockResolvedValue({ store: "no_connection" });
    await render();
    expect(mocks.clients).toHaveLength(0);
    expect(latest).toMatchObject({ state: "loaded", observation: { store: "no_connection" } });
  });

  it("opens no client for a missing store and rejects invalid live replies", async () => {
    mocks.connect.mockResolvedValue({ store: "missing" });
    await render();
    expect(mocks.clients).toHaveLength(0);
    expect(latest).toMatchObject({ state: "loaded", observation: { store: "missing" } });
    mocks.connect.mockResolvedValue({
      store: "live",
      deploymentUrl: "https://test-store.convex.cloud",
      token: "initial-token",
    });
    await act(async () => latest.state === "loaded" && latest.reload());
    await act(async () => client().value?.({ store: "found", stacks: "invalid" }));
    expect(latest.state).toBe("failed");
    expect(client().close).toHaveBeenCalledOnce();
  });
});
