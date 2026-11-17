import { useQuery as useCachedQuery, type UseQueryResult } from "@tanstack/react-query";
import { parse } from "convex-helpers/validators";
import { ConvexClient } from "convex/browser";
import { useMatch } from "@tanstack/react-router";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { readDeployedStacks, stageResources } from "../../../shared/alchemyState";
import {
  ALCHEMY_CONNECTION_UNAVAILABLE,
  vAlchemyRepositoryReply,
  type AlchemyStacksRead,
  type AlchemyStateObservation,
  type CloudflareStacksRead,
  type GitHubStacksRead,
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
      /**
      Why the Cloudflare store gave no stack: `reconnect` when Cloudflare refused the token,
      `unreadable` when the read failed or the store version is unknown. The page shows it only
      when it has no stack to show. The delete dialog uses it in every case.
      */
      cloudflareProblem?: "reconnect" | "unreadable";
      /** The read of the branch `alchemy-state-store` failed. The page shows it the same way. */
      githubUnreadable?: true;
      reload: () => void;
    };

type StoreResult =
  | { state: "failed"; error: Error }
  | { state: "loaded"; read: AlchemyStacksRead | { store: "no_connection" } };

/**
The store read that the server render of the current page made for its first paint, when it is for
this repository and team: the repository overview and the Alchemy page load one. Both routes keep no
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
One connection for the selected repository to the store of its Convex team. Cleanup closes it;
results belong to its target. The loader's read stands until the first subscription result, and the
connection starts with its token, so the page has the stacks before any request of the browser. A
reload connects again and reads the other stores again. `repository` is the GitHub `owner/name` of
the repository: the run record of each stage that the page shows names it.

The store of the organization's Cloudflare account and the branch `alchemy-state-store` of the
repository are read once when the page opens, in the browser: the Cloudflare read takes some seconds
and uploads an edge preview at Cloudflare, and the branch read makes one GitHub request per file.
Their stacks join the Convex stacks in one observation, and while a read runs, a page with no stack
yet shows its loading state. When the Convex read fails, the page shows the stacks of the other
stores with `refreshFailed`, and without them it shows the failure.
*/
export function useRepositoryAlchemyState(
  repositoryId: Id<"repositories"> | null,
  convexTeamId: string | undefined,
  repository: string | undefined,
): RepositoryAlchemyState {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : "skip");
  const connect = useAction(api.repository.alchemyState.connect);
  const readDeploymentMetadata = useAction(api.repository.alchemyState.readDeploymentMetadata);
  const readCloudflareStacks = useAction(api.repository.alchemyState.readCloudflareStacks);
  const readGitHubStacks = useAction(api.repository.alchemyState.readGitHubStacks);
  const loaderRead = useLoaderRead(repositoryId, convexTeamId);
  const [attempt, setAttempt] = useState(0);
  const [reloadedRead, setReloadedRead] = useState<typeof loaderRead>();
  const firstRead = loaderRead === reloadedRead ? undefined : loaderRead;
  const userId = isAuthenticated ? viewer?._id : undefined;
  // The Convex store lives in the repository's Convex team, and no team means no connection to it.
  const convexRepositoryId = convexTeamId ? repositoryId : null;
  const target = useMemo(
    () =>
      convexRepositoryId && repository && userId
        ? { repositoryId: convexRepositoryId, repository, userId, convexTeamId, attempt, firstRead }
        : null,
    [convexRepositoryId, repository, userId, convexTeamId, attempt, firstRead],
  );
  const [result, setResult] = useState<{ target: typeof target; value: StoreResult }>();
  // The Cloudflare store and the GitHub branch need no Convex team.
  const otherStoresEnabled = repositoryId !== null && userId !== undefined;
  const cloudflare = useCachedQuery({
    queryKey: ["repository-alchemy-cloudflare-stacks", repositoryId, userId],
    queryFn: async () => {
      if (!repositoryId) throw new Error("Repository is required to read the Cloudflare store.");
      return await readCloudflareStacks({ repositoryId });
    },
    enabled: otherStoresEnabled,
    // Each read uploads an edge preview at Cloudflare: no read on focus and no retry. A page that
    // opens again shows the last read while it reads again.
    refetchOnWindowFocus: false,
    retry: false,
  });
  const github = useCachedQuery({
    queryKey: ["repository-alchemy-github-stacks", repositoryId, userId],
    queryFn: async () => {
      if (!repositoryId) throw new Error("Repository is required to read the GitHub store.");
      return await readGitHubStacks({ repositoryId });
    },
    enabled: otherStoresEnabled,
    // Each read makes one GitHub request per state file: no read on focus and no retry. A page
    // that opens again shows the last read while it reads again.
    refetchOnWindowFocus: false,
    retry: false,
  });
  const { refetch: refetchCloudflare } = cloudflare;
  const { refetch: refetchGitHub } = github;
  const reload = useCallback(() => {
    setReloadedRead(loaderRead);
    setAttempt((current) => current + 1);
    void refetchCloudflare();
    void refetchGitHub();
  }, [loaderRead, refetchCloudflare, refetchGitHub]);
  const firstResult = useMemo((): StoreResult | undefined => {
    if (!firstRead) return undefined;
    if (firstRead.state === "failed")
      return { state: "failed", error: new Error(firstRead.message) };
    const { connection } = firstRead;
    return {
      state: "loaded",
      read: connection.store === "live" ? connection.snapshot : connection,
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
      if (connection.store !== "live") {
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
            const { store, stacks } = parse(vAlchemyRepositoryReply, reply);
            setResult({
              target,
              value: {
                state: "loaded",
                read: {
                  store,
                  stacks: readDeployedStacks(stacks, target.repository, "convex"),
                },
              },
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
              stageResources({
                stackFile: stage.run.stackFile,
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
    return {
      state: "loaded",
      observation: { store: "no_connection" },
      refreshFailed: false,
      reload,
    };
  }
  const convex = convexRepositoryId
    ? current
    : { state: "loaded" as const, read: { store: "no_connection" as const } };
  if (!convex) return { state: "loading" };
  if (convex.state === "failed") {
    return withOtherStoreReads({ ...convex, reload }, { cloudflare, github });
  }
  const observation: AlchemyStateObservation =
    convex.read.store === "found"
      ? { ...convex.read, liveDeployments: metadata.data ?? [] }
      : convex.read;
  return withOtherStoreReads(
    { state: "loaded", observation, refreshFailed: metadata.isError, reload },
    { cloudflare, github },
  );
}

/** Why the Cloudflare store gave no stack, by the state of its read. */
const CLOUDFLARE_PROBLEMS = {
  found: undefined,
  not_connected: undefined,
  unsupported_connection: undefined,
  no_store: undefined,
  reconnect: "reconnect",
  failed: "unreadable",
  unsupported_version: "unreadable",
} satisfies Record<CloudflareStacksRead["state"], "reconnect" | "unreadable" | undefined>;

/**
The Convex read with the reads of the Cloudflare store and the GitHub branch. Nothing flashes:
stacks show as soon as a read gives them, and a page without a stack waits for every read. A read
that throws counts as failed. A failed Convex read shows the stacks of the other stores with
`refreshFailed`, whose Retry reads every store again, and shows the failure while the other reads
run or find no stack.
*/
function withOtherStoreReads(
  convex: Exclude<RepositoryAlchemyState, { state: "loading" }>,
  queries: {
    cloudflare: Pick<UseQueryResult<CloudflareStacksRead>, "data" | "isError">;
    github: Pick<UseQueryResult<GitHubStacksRead>, "data" | "isError">;
  },
): RepositoryAlchemyState {
  const cloudflareRead: CloudflareStacksRead | undefined =
    queries.cloudflare.data ?? (queries.cloudflare.isError ? { state: "failed" } : undefined);
  const githubRead: GitHubStacksRead | undefined =
    queries.github.data ?? (queries.github.isError ? { state: "failed" } : undefined);
  const others = [cloudflareRead, githubRead].flatMap((read) =>
    read?.state === "found" && read.stacks.length > 0 ? [read] : [],
  );
  if (convex.state === "failed") {
    return others.length > 0
      ? {
          state: "loaded",
          observation: {
            store: "found",
            stacks: others.flatMap((read) => read.stacks),
            liveDeployments: others.flatMap((read) => read.liveDeployments),
          },
          refreshFailed: true,
          reload: convex.reload,
        }
      : convex;
  }
  const reads = convex.observation.store === "found" ? [convex.observation, ...others] : others;
  if ((!cloudflareRead || !githubRead) && !reads.some((read) => read.stacks.length > 0)) {
    return { state: "loading" };
  }

  return {
    ...(others.length === 0
      ? convex
      : {
          ...convex,
          observation: {
            store: "found",
            stacks: reads.flatMap((read) => read.stacks),
            liveDeployments: reads.flatMap((read) => read.liveDeployments),
          },
        }),
    cloudflareProblem: cloudflareRead && CLOUDFLARE_PROBLEMS[cloudflareRead.state],
    githubUnreadable: githubRead?.state === "failed" || undefined,
  };
}
