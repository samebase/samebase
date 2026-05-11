import { describe, expect, it } from "vite-plus/test";

import { makeConvexTest } from "./test.setup";
import {
  deriveRepositoryRefreshDedupeKey,
  getRepositoryRefreshPriority,
  makeRepositoryRefreshRequest,
  markRepositoryRefreshRequestCanceled,
  markRepositoryRefreshRequestFailed,
  markRepositoryRefreshRequestRunning,
  markRepositoryRefreshRequestSucceeded,
  type MakeRepositoryRefreshRequestArgs,
  type RepositoryRefreshDemand,
  type RepositoryRefreshLifecycle,
  type RepositoryRefreshPriority,
  type RepositoryRefreshRequest,
  type SourceSetupRepositoryRefreshDemand,
} from "./repositoryRefreshModel";

type RepositoryRefreshMatrixContext = {
  ids: {
    userId: RepositoryRefreshRequest["userId"];
    vaultId: RepositoryRefreshRequest["vaultId"];
  };
  runId: SourceSetupRepositoryRefreshDemand["runId"];
};

type RepositoryRefreshScope = RepositoryRefreshDemand["scope"];
type RepositoryRefreshSource = RepositoryRefreshDemand["source"];

type SourceForScope<Scope extends RepositoryRefreshScope> =
  RepositoryRefreshDemand extends infer Demand
    ? Demand extends { scope: Scope; source: RepositoryRefreshSource }
      ? Demand["source"]
      : never
    : never;

type MakeRepositoryRefreshRequestArgsForScopeSource<
  Scope extends RepositoryRefreshScope,
  Source extends SourceForScope<Scope>,
> = MakeRepositoryRefreshRequestArgs & {
  demand: Extract<RepositoryRefreshDemand, { scope: Scope; source: Source }>;
};

type DemandMatrixRow<
  Scope extends RepositoryRefreshScope,
  Source extends SourceForScope<Scope>,
> = {
  scope: Scope;
  source: Source;
  expectedPriority: RepositoryRefreshPriority;
  story: string;
  make: (
    context: RepositoryRefreshMatrixContext,
  ) => MakeRepositoryRefreshRequestArgsForScopeSource<Scope, Source>;
  expectedDedupeKey: (context: RepositoryRefreshMatrixContext) => string;
};

type DemandMatrix = {
  [Scope in RepositoryRefreshScope]: {
    [Source in SourceForScope<Scope>]: DemandMatrixRow<Scope, Source>;
  };
};

const demandMatrix = {
  repository: {
    dashboard: {
      scope: "repository",
      source: "dashboard",
      expectedPriority: "background",
      story:
        "Dashboard opens or returns to the foreground and asks for vault-level freshness.",
      make: ({ ids }) => ({
        userId: ids.userId,
        vaultId: ids.vaultId,
        now: 100,
        demand: {
          scope: "repository",
          source: "dashboard",
          trigger: "page_load",
        },
      }),
      expectedDedupeKey: ({ ids }) =>
        `user:${ids.userId}:vault:${ids.vaultId}:repository`,
    },
    manual: {
      scope: "repository",
      source: "manual",
      expectedPriority: "manual",
      story:
        "User clicks a vault-level refresh control; backend decides how deep to refresh.",
      make: ({ ids }) => ({
        userId: ids.userId,
        vaultId: ids.vaultId,
        now: 101,
        demand: {
          scope: "repository",
          source: "manual",
          trigger: "dashboard_status_click",
        },
      }),
      expectedDedupeKey: ({ ids }) =>
        `user:${ids.userId}:vault:${ids.vaultId}:repository`,
    },
    source_setup: {
      scope: "repository",
      source: "source_setup",
      expectedPriority: "system",
      story:
        "Create/connect finished; backend discovers branches so the dashboard works without a browser reload.",
      make: ({ ids, runId }) => ({
        userId: ids.userId,
        vaultId: ids.vaultId,
        now: 102,
        demand: {
          scope: "repository",
          source: "source_setup",
          runId,
          mode: "connect_existing_repository",
        },
      }),
      expectedDedupeKey: ({ ids }) =>
        `user:${ids.userId}:vault:${ids.vaultId}:repository`,
    },
  },
  branch: {
    file_view: {
      scope: "branch",
      source: "file_view",
      expectedPriority: "normal",
      story:
        "A file route opens or becomes visible and asks for the branch it is showing.",
      make: ({ ids }) => ({
        userId: ids.userId,
        vaultId: ids.vaultId,
        now: 103,
        demand: {
          scope: "branch",
          branch: "main",
          source: "file_view",
          trigger: "page_load",
        },
      }),
      expectedDedupeKey: ({ ids }) =>
        `user:${ids.userId}:vault:${ids.vaultId}:branch:main`,
    },
    manual: {
      scope: "branch",
      source: "manual",
      expectedPriority: "manual",
      story:
        "User asks a specific branch to refresh; backend decides branch-scoped steps.",
      make: ({ ids }) => ({
        userId: ids.userId,
        vaultId: ids.vaultId,
        now: 104,
        demand: {
          scope: "branch",
          branch: "main",
          source: "manual",
          trigger: "dashboard_status_click",
        },
      }),
      expectedDedupeKey: ({ ids }) =>
        `user:${ids.userId}:vault:${ids.vaultId}:branch:main`,
    },
    commit: {
      scope: "branch",
      source: "commit",
      expectedPriority: "system",
      story:
        "A local commit changed one branch; persisted branch-visible state must catch up.",
      make: ({ ids }) => ({
        userId: ids.userId,
        vaultId: ids.vaultId,
        now: 105,
        demand: {
          scope: "branch",
          branch: "main",
          source: "commit",
        },
      }),
      expectedDedupeKey: ({ ids }) =>
        `user:${ids.userId}:vault:${ids.vaultId}:branch:main`,
    },
    pull: {
      scope: "branch",
      source: "pull",
      expectedPriority: "system",
      story:
        "A pull moved one branch under the local checkout; persisted branch-visible state must catch up.",
      make: ({ ids }) => ({
        userId: ids.userId,
        vaultId: ids.vaultId,
        now: 106,
        demand: {
          scope: "branch",
          branch: "main",
          source: "pull",
        },
      }),
      expectedDedupeKey: ({ ids }) =>
        `user:${ids.userId}:vault:${ids.vaultId}:branch:main`,
    },
  },
} satisfies DemandMatrix;

type ScopeMatrixRow = {
  story: string;
  makeDemand: (
    context: RepositoryRefreshMatrixContext,
  ) => RepositoryRefreshDemand;
  expectedDedupeKey: (ids: RepositoryRefreshMatrixContext["ids"]) => string;
};

const scopeMatrix = {
  repository: {
    story:
      "Repository demand is vault-wide and has no branch, provider, or metadata-depth fields.",
    makeDemand: ({ runId }) => ({
      scope: "repository",
      source: "source_setup",
      runId,
      mode: "connect_existing_repository",
    }),
    expectedDedupeKey: (ids) =>
      `user:${ids.userId}:vault:${ids.vaultId}:repository`,
  },
  branch: {
    story:
      "Branch demand is branch-scoped and cannot exist without a branch name.",
    makeDemand: () => ({
      scope: "branch",
      branch: "main",
      source: "file_view",
      trigger: "page_load",
    }),
    expectedDedupeKey: (ids) =>
      `user:${ids.userId}:vault:${ids.vaultId}:branch:main`,
  },
} satisfies Record<RepositoryRefreshDemand["scope"], ScopeMatrixRow>;

type LifecycleMatrixRow = {
  fields: readonly string[];
  story: string;
  makeLifecycle: () => RepositoryRefreshLifecycle;
};

const lifecycleMatrix = {
  queued: {
    fields: ["notBefore", "queuedAt", "state"],
    story:
      "Queued work has not started yet, so it only carries the earliest claim time and queued timestamp.",
    makeLifecycle: () => ({
      state: "queued",
      notBefore: 10,
      queuedAt: 10,
    }),
  },
  running: {
    fields: ["attempt", "startedAt", "state", "workpoolJobId"],
    story:
      "Running work has been claimed by Workpool and has no terminal result yet.",
    makeLifecycle: () => ({
      state: "running",
      attempt: 1,
      startedAt: 11,
      workpoolJobId: "job-1",
    }),
  },
  succeeded: {
    fields: ["attempt", "completedAt", "result", "startedAt", "state"],
    story:
      "Succeeded work keeps the worker timing plus the successful outcome only.",
    makeLifecycle: () => ({
      state: "succeeded",
      attempt: 1,
      startedAt: 11,
      completedAt: 12,
      result: { kind: "refreshed", refreshedAt: 12 },
    }),
  },
  failed: {
    fields: ["attempt", "failedAt", "failure", "startedAt", "state"],
    story:
      "Failed work keeps the worker timing plus the retry/cooldown failure only.",
    makeLifecycle: () => ({
      state: "failed",
      attempt: 1,
      startedAt: 11,
      failedAt: 12,
      failure: {
        kind: "provider_error",
        cooldownUntil: 60,
        message: "GitHub unavailable.",
      },
    }),
  },
  canceled: {
    fields: ["canceledAt", "reason", "state"],
    story:
      "Canceled work records why the row stopped without preserving a worker result.",
    makeLifecycle: () => ({
      state: "canceled",
      canceledAt: 13,
      reason: "superseded",
    }),
  },
} satisfies Record<RepositoryRefreshLifecycle["state"], LifecycleMatrixRow>;

describe("repository refresh model", () => {
  async function createVaultIds() {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      return { userId, vaultId };
    });
    return { ids, t };
  }

  async function createMatrixContext() {
    const { ids, t } = await createVaultIds();
    const runId = await t.run(async (ctx) => {
      return await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/imported",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 3,
      });
    });

    return { ids, runId, t };
  }

  it("enumerates allowed scope-source demand states", async () => {
    const context = await createMatrixContext();

    for (const rowsBySource of Object.values(demandMatrix)) {
      for (const row of Object.values(rowsBySource)) {
        const request = makeRepositoryRefreshRequest(row.make(context));

        expect(request.demand.scope).toBe(row.scope);
        expect(request.demand.source).toBe(row.source);
        expect(getRepositoryRefreshPriority(request.demand)).toBe(
          row.expectedPriority,
        );
        expect(request.dedupeKey).toBe(row.expectedDedupeKey(context));

        const stored = await context.t.run(async (ctx) => {
          const requestId = await ctx.db.insert(
            "repositoryRefreshRequests",
            request,
          );
          return await ctx.db.get(requestId);
        });
        expect(stored).toMatchObject(request);
      }
    }
  });

  it("derives dedupe keys from demand scope only", async () => {
    const context = await createMatrixContext();

    for (const [scope, row] of Object.entries(scopeMatrix)) {
      const demand = row.makeDemand(context);

      expect(demand.scope).toBe(scope);
      expect(
        deriveRepositoryRefreshDedupeKey({
          userId: context.ids.userId,
          vaultId: context.ids.vaultId,
          demand,
        }),
      ).toBe(row.expectedDedupeKey(context.ids));
    }
  });

  it("keeps lifecycle fields local to each lifecycle state", () => {
    for (const [state, row] of Object.entries(lifecycleMatrix)) {
      const lifecycle = row.makeLifecycle();

      expect(lifecycle.state).toBe(state);
      expect(Object.keys(lifecycle).sort()).toEqual(row.fields);
    }
  });

  it("creates queued repository demand with derived queue fields", async () => {
    const { ids, t } = await createVaultIds();
    const request = makeRepositoryRefreshRequest({
      userId: ids.userId,
      vaultId: ids.vaultId,
      now: 10,
      demand: {
        scope: "repository",
        source: "dashboard",
        trigger: "page_load",
      },
    });

    expect(request).toMatchObject({
      userId: ids.userId,
      vaultId: ids.vaultId,
      dedupeKey: `user:${ids.userId}:vault:${ids.vaultId}:repository`,
      demand: {
        scope: "repository",
        source: "dashboard",
        trigger: "page_load",
      },
      lifecycle: {
        state: "queued",
        notBefore: 10,
        queuedAt: 10,
      },
      createdAt: 10,
      updatedAt: 10,
    });

    const stored = await t.run(async (ctx) => {
      const requestId = await ctx.db.insert(
        "repositoryRefreshRequests",
        request,
      );
      return await ctx.db.get(requestId);
    });
    expect(stored).toMatchObject(request);
  });

  it("creates branch demand without exact work semantics", async () => {
    const { ids, t } = await createVaultIds();
    const request = makeRepositoryRefreshRequest({
      userId: ids.userId,
      vaultId: ids.vaultId,
      now: 14,
      demand: {
        scope: "branch",
        branch: "main",
        source: "manual",
        trigger: "dashboard_status_click",
      },
    });

    expect(request).toMatchObject({
      dedupeKey: `user:${ids.userId}:vault:${ids.vaultId}:branch:main`,
      demand: {
        scope: "branch",
        branch: "main",
        source: "manual",
        trigger: "dashboard_status_click",
      },
    });

    const stored = await t.run(async (ctx) => {
      const requestId = await ctx.db.insert(
        "repositoryRefreshRequests",
        request,
      );
      return await ctx.db.get(requestId);
    });
    expect(stored).toMatchObject(request);
  });

  it("keeps source setup demand tied to the provisioning run", async () => {
    const { ids, t } = await createVaultIds();
    const runId = await t.run(async (ctx) => {
      return await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/imported",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 3,
      });
    });

    const request = makeRepositoryRefreshRequest({
      userId: ids.userId,
      vaultId: ids.vaultId,
      now: 20,
      demand: {
        scope: "repository",
        source: "source_setup",
        runId,
        mode: "connect_existing_repository",
      },
    });

    expect(getRepositoryRefreshPriority(request.demand)).toBe("system");
    expect(request.demand).toEqual({
      scope: "repository",
      source: "source_setup",
      runId,
      mode: "connect_existing_repository",
    });
  });

  it("transitions queued requests through running and succeeded", async () => {
    const { ids } = await createVaultIds();
    const queued = makeRepositoryRefreshRequest({
      userId: ids.userId,
      vaultId: ids.vaultId,
      now: 10,
      demand: {
        scope: "repository",
        source: "manual",
        trigger: "dashboard_status_click",
      },
    });
    const running = markRepositoryRefreshRequestRunning(queued, {
      now: 11,
      attempt: 1,
      workpoolJobId: "job-1",
    });
    const succeeded = markRepositoryRefreshRequestSucceeded(running, {
      now: 12,
      result: {
        kind: "refreshed",
        refreshedAt: 12,
      },
    });

    expect(running.lifecycle).toEqual({
      state: "running",
      attempt: 1,
      startedAt: 11,
      workpoolJobId: "job-1",
    });
    expect(succeeded.lifecycle).toEqual({
      state: "succeeded",
      attempt: 1,
      startedAt: 11,
      completedAt: 12,
      result: {
        kind: "refreshed",
        refreshedAt: 12,
      },
    });
  });

  it("rejects invalid lifecycle transitions", async () => {
    const { ids } = await createVaultIds();
    const queued = makeRepositoryRefreshRequest({
      userId: ids.userId,
      vaultId: ids.vaultId,
      now: 10,
      demand: {
        scope: "repository",
        source: "dashboard",
        trigger: "visibility",
      },
    });
    const running = markRepositoryRefreshRequestRunning(queued, {
      now: 11,
      attempt: 1,
      workpoolJobId: "job-1",
    });
    const failed = markRepositoryRefreshRequestFailed(running, {
      now: 12,
      failure: {
        kind: "provider_error",
        cooldownUntil: 60,
        message: "GitHub unavailable.",
      },
    });

    expect(() =>
      markRepositoryRefreshRequestSucceeded(queued, {
        now: 12,
        result: { kind: "no_work_needed" },
      }),
    ).toThrow("Only running repository refresh requests can succeed.");
    expect(() =>
      markRepositoryRefreshRequestRunning(failed, {
        now: 13,
        attempt: 2,
        workpoolJobId: "job-2",
      }),
    ).toThrow("Only queued repository refresh requests can start.");
    expect(() =>
      markRepositoryRefreshRequestCanceled(failed, {
        now: 13,
        reason: "superseded",
      }),
    ).toThrow(
      "Only queued or running repository refresh requests can be canceled.",
    );
  });
});

function _checkForbiddenDemandStates(
  userId: RepositoryRefreshRequest["userId"],
  vaultId: RepositoryRefreshRequest["vaultId"],
  runId: SourceSetupRepositoryRefreshDemand["runId"],
) {
  makeRepositoryRefreshRequest({
    userId,
    vaultId,
    now: 1,
    // @ts-expect-error dashboard cannot fan out branch demand.
    demand: {
      scope: "branch",
      branch: "main",
      source: "dashboard",
      trigger: "page_load",
    },
  });

  makeRepositoryRefreshRequest({
    userId,
    vaultId,
    now: 1,
    // @ts-expect-error source setup discovers branches through repository demand first.
    demand: {
      scope: "branch",
      branch: "main",
      source: "source_setup",
      runId,
      mode: "connect_existing_repository",
    },
  });

  makeRepositoryRefreshRequest({
    userId,
    vaultId,
    now: 1,
    // @ts-expect-error file view is branch-scoped.
    demand: {
      scope: "repository",
      source: "file_view",
      trigger: "page_load",
    },
  });

  makeRepositoryRefreshRequest({
    userId,
    vaultId,
    now: 1,
    // @ts-expect-error commit follow-up is branch-scoped.
    demand: {
      scope: "repository",
      source: "commit",
    },
  });

  makeRepositoryRefreshRequest({
    userId,
    vaultId,
    now: 1,
    // @ts-expect-error pull follow-up is branch-scoped.
    demand: {
      scope: "repository",
      source: "pull",
    },
  });

  makeRepositoryRefreshRequest({
    userId,
    vaultId,
    now: 1,
    // @ts-expect-error source setup demand must keep its run id.
    demand: {
      scope: "repository",
      source: "source_setup",
      mode: "connect_existing_repository",
    },
  });

  makeRepositoryRefreshRequest({
    userId,
    vaultId,
    now: 1,
    demand: {
      scope: "repository",
      source: "manual",
      trigger: "dashboard_status_click",
      // @ts-expect-error repository demand has no branch field.
      branch: "main",
    },
  });

  makeRepositoryRefreshRequest({
    userId,
    vaultId,
    now: 1,
    demand: {
      scope: "branch",
      source: "manual",
      trigger: "dashboard_status_click",
      // @ts-expect-error branch demand requires branch instead of exact work.
      work: { kind: "branch_tree" },
    },
  });

  makeRepositoryRefreshRequest({
    userId,
    vaultId,
    now: 1,
    demand: {
      scope: "repository",
      source: "dashboard",
      trigger: "page_load",
    },
    // @ts-expect-error callers cannot provide priority because it is derived.
    priority: "system",
  });

  makeRepositoryRefreshRequest({
    userId,
    vaultId,
    now: 1,
    demand: {
      scope: "repository",
      source: "dashboard",
      trigger: "page_load",
    },
    // @ts-expect-error callers cannot choose provider/comment parsing.
    provider: "cloudflare_pages_comments",
  });
}
