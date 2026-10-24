// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ConvexClient } from "convex/browser";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ALCHEMY_CONNECTION_UNAVAILABLE } from "../../../shared/alchemyStateModel";
import {
  useRepositoryAlchemyState,
  type RepositoryAlchemyState,
} from "./useRepositoryAlchemyState";

type Connection = (typeof api.repository.alchemyState.connect)["_returnType"];
type ClientState = {
  value: ((value: unknown) => void) | undefined;
  error: ((error: Error) => void) | undefined;
  fetchToken: Parameters<ConvexClient["setAuth"]>[0] | undefined;
  close: () => Promise<void>;
};
const mocks = vi.hoisted(() => {
  const clients: ClientState[] = [];
  return {
    connect: vi.fn<() => Promise<Connection>>(),
    metadata: vi.fn(async () => []),
    clients,
    userId: "user-a",
    authenticated: true,
  };
});

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
  mocks.connect.mockReset();
  mocks.connect.mockResolvedValue({
    store: "live",
    deploymentUrl: "https://test-store.convex.cloud",
    token: "initial-token",
  });
  mocks.metadata.mockClear();
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
      .mockRejectedValueOnce(new ConvexError(ALCHEMY_CONNECTION_UNAVAILABLE))
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

  it("uses an explicit old-store snapshot and rejects invalid live replies", async () => {
    mocks.connect.mockResolvedValue({ store: "snapshot", observation: { store: "missing" } });
    await render();
    expect(mocks.clients).toHaveLength(0);
    expect(latest).toMatchObject({ state: "loaded", observation: { store: "missing" } });
    mocks.connect.mockResolvedValue({
      store: "live",
      deploymentUrl: "https://test-store.convex.cloud",
      token: "initial-token",
    });
    if (latest.state !== "loaded") throw new Error("Snapshot did not load.");
    await act(async () => latest.state === "loaded" && latest.reload());
    await act(async () => client().value?.({ store: "found", stacks: "invalid" }));
    expect(latest.state).toBe("failed");
    expect(client().close).toHaveBeenCalledOnce();
  });
});
