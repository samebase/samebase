import { useQuery as useCachedQuery } from "@tanstack/react-query";
import { parse } from "convex-helpers/validators";
import { ConvexClient } from "convex/browser";
import { useMatch } from "@tanstack/react-router";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { placeStageResources } from "../../../shared/alchemyState";
import {
  ALCHEMY_CONNECTION_UNAVAILABLE,
  vAlchemyStacksRead,
  type AlchemyStacksRead,
  type AlchemyStateObservation,
} from "../../../shared/alchemyStateModel";

const repositoryQuery = makeFunctionReference<"query", Record<string, never>, unknown>(
  "reader:repository",
);

export type RepositoryAlchemyState =
  | { state: "loading" }
  | { state: "failed"; error: Error; reload: () => void }
  | {
      state: "loaded";
      observation: AlchemyStateObservation;
      refreshFailed: boolean;
      reload: () => void;
    };

type StoreResult = { state: "failed"; error: Error } | { state: "loaded"; read: AlchemyStacksRead };

/**
The store read that the loader of the current page made for its first paint, when it is for this
repository and team: the repository overview and the Alchemy page load one. Both routes keep no
loader data after the page is left, so this is never a read of an earlier visit.
*/
function useLoaderRead(repositoryId: Id<"repositories"> | null, convexTeamId: string | undefined) {
  const overviewRead = useMatch({
    from: "/_authed/repo/$owner/$repository",
    shouldThrow: false,
    select: (match) => match.loaderData,
  });
  const alchemyPageRead = useMatch({
    from: "/_authed/repo/$owner/$repository/alchemy",
    shouldThrow: false,
    select: (match) => match.loaderData,
  });
  const read = overviewRead ?? alchemyPageRead;
  return read?.repositoryId === repositoryId && read.convexTeamId === convexTeamId
    ? read
    : undefined;
}

/**
One connection for the selected repository. Cleanup closes it; results belong to its target. The
loader's read stands until the first subscription result, and the connection starts with its token,
so the page has the stacks before any request of the browser. A reload connects again.
*/
export function useRepositoryAlchemyState(
  repositoryId: Id<"repositories"> | null,
  convexTeamId: string | undefined,
): RepositoryAlchemyState {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : "skip");
  const connect = useAction(api.repository.alchemyState.connect);
  const readDeploymentMetadata = useAction(api.repository.alchemyState.readDeploymentMetadata);
  const loaderRead = useLoaderRead(repositoryId, convexTeamId);
  const [attempt, setAttempt] = useState(0);
  const [reloadedRead, setReloadedRead] = useState<typeof loaderRead>();
  const firstRead = loaderRead === reloadedRead ? undefined : loaderRead;
  const userId = isAuthenticated ? viewer?._id : undefined;
  const target = useMemo(
    () =>
      repositoryId && userId ? { repositoryId, userId, convexTeamId, attempt, firstRead } : null,
    [repositoryId, userId, convexTeamId, attempt, firstRead],
  );
  const [result, setResult] = useState<{ target: typeof target; value: StoreResult }>();
  const reload = useCallback(() => {
    setReloadedRead(loaderRead);
    setAttempt((current) => current + 1);
  }, [loaderRead]);
  const firstResult = useMemo((): StoreResult | undefined => {
    if (!firstRead) return undefined;
    if (firstRead.state === "failed")
      return { state: "failed", error: new Error(firstRead.message) };
    const { connection } = firstRead;
    return {
      state: "loaded",
      read: connection.store === "missing" ? connection : connection.snapshot,
    };
  }, [firstRead]);

  // The second client reads the team store. Samebase hooks keep their existing provider and auth.
  useEffect(() => {
    if (!target) return;
    let stopped = false;
    let client: ConvexClient | undefined;
    let cancelRetry: (() => void) | undefined;
    const fail = (error: unknown) => {
      if (stopped) return;
      setResult({
        target,
        value: {
          state: "failed",
          error: error instanceof Error ? error : new Error("Could not read Alchemy state."),
        },
      });
      stopped = true;
      cancelRetry?.();
      void client?.close();
    };

    const readConnection = async () => {
      for (const delay of [0, 2_000, 5_000]) {
        if (stopped) return null;
        if (delay) {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, delay);
            cancelRetry = () => {
              clearTimeout(timeout);
              resolve();
            };
          });
          cancelRetry = undefined;
          // eslint-disable-next-line typescript/no-unnecessary-condition -- Cleanup can run while the retry timer awaits.
          if (stopped) return null;
        }
        try {
          return await connect({ repositoryId: target.repositoryId });
        } catch (error) {
          // Convex wraps request_manager's transport failure with the action path in logging.ts.
          const transient =
            error instanceof ConvexError
              ? error.data === ALCHEMY_CONNECTION_UNAVAILABLE
              : error instanceof Error &&
                error.message ===
                  "[CONVEX A(repository/alchemyState:connect)] Connection lost while action was in flight\n  Called by client";
          if (!transient || delay === 5_000) {
            fail(error);
            return null;
          }
        }
      }
      return null;
    };

    const start = async () => {
      // A failed first read stays on screen while the browser connects with its retries.
      const connection =
        target.firstRead?.state === "loaded" ? target.firstRead.connection : await readConnection();
      if (!connection || stopped) return;
      if (connection.store === "missing") {
        setResult({ target, value: { state: "loaded", read: connection } });
        return;
      }
      client = new ConvexClient(connection.deploymentUrl, {
        expectAuth: true,
        authRefreshTokenLeewaySeconds: 60,
        unsavedChangesWarning: false,
      });
      let initialToken: string | null = connection.token;
      client.setAuth(
        async ({ forceRefreshToken }) => {
          if (stopped) return null;
          if (initialToken && !forceRefreshToken) {
            const token = initialToken;
            initialToken = null;
            return token;
          }
          initialToken = null;
          const refreshed = await readConnection();
          // eslint-disable-next-line typescript/no-unnecessary-condition -- Cleanup can run while token renewal awaits.
          if (!refreshed || stopped) return null;
          if (refreshed.store !== "live" || refreshed.deploymentUrl !== connection.deploymentUrl) {
            fail(new Error("The Alchemy state connection changed. Try again."));
            return null;
          }
          return refreshed.token;
        },
        (authenticated) => {
          if (!authenticated) fail(new Error("Alchemy state access ended. Try again."));
        },
      );
      client.onUpdate(
        repositoryQuery,
        {},
        (reply) => {
          if (stopped) return;
          try {
            setResult({
              target,
              value: { state: "loaded", read: parse(vAlchemyStacksRead, reply) },
            });
          } catch (error) {
            fail(error);
          }
        },
        fail,
      );
    };
    void start().catch(fail);
    return () => {
      if (stopped) return;
      stopped = true;
      cancelRetry?.();
      void client?.close();
    };
  }, [target, connect]);

  const current = (result?.target === target ? result.value : undefined) ?? firstResult;
  const deployments =
    current?.state === "loaded" && current.read.store === "found"
      ? current.read.stacks.flatMap((stack) =>
          stack.stages
            .filter((stage) => stage.name === "prod")
            .flatMap((stage) =>
              placeStageResources({
                stackFile: stage.record.stackFile,
                resources: stage.resources,
              }).convexDeployments.map(({ state }) => `${state.attr.projectId}/${state.attr.name}`),
            ),
        )
      : [];
  const metadata = useCachedQuery({
    queryKey: [
      "repository-alchemy-deployment-metadata",
      repositoryId,
      userId,
      convexTeamId,
      [...new Set(deployments)].sort(),
    ],
    queryFn: async () => {
      if (!repositoryId) throw new Error("Repository is required to read deployment metadata.");
      return await readDeploymentMetadata({ repositoryId });
    },
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[1] === repositoryId &&
      previousQuery.queryKey[2] === userId &&
      previousQuery.queryKey[3] === convexTeamId
        ? previousData
        : undefined,
    enabled: target !== null && deployments.length > 0,
    retry: false,
    staleTime: 60_000,
  });

  if (!repositoryId) {
    return { state: "loaded", observation: { store: "missing" }, refreshFailed: false, reload };
  }
  if (!current) return { state: "loading" };
  if (current.state === "failed") return { ...current, reload };
  return {
    state: "loaded",
    observation:
      current.read.store === "missing"
        ? current.read
        : { ...current.read, liveDeployments: metadata.data ?? [] },
    refreshFailed: metadata.isError,
    reload,
  };
}
