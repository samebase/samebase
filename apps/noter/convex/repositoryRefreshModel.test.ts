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
  type RepositoryRefreshIntent,
  type RepositoryRefreshLifecycle,
  type RepositoryRefreshPriority,
  type RepositoryRefreshRequest,
  type SourceSetupRefreshIntent,
} from "./repositoryRefreshModel";

type RepositoryRefreshMatrixContext = {
  ids: {
    userId: RepositoryRefreshRequest["userId"];
    vaultId: RepositoryRefreshRequest["vaultId"];
  };
  runId: SourceSetupRefreshIntent["runId"];
};

type RepositoryRefreshIntentSource = RepositoryRefreshIntent["source"];
type RepositoryRefreshWorkKind = RepositoryRefreshRequest["work"]["kind"];

type WorkKindForIntent<Intent extends RepositoryRefreshIntentSource> =
  MakeRepositoryRefreshRequestArgs extends infer Args
    ? Args extends {
        intent: RepositoryRefreshIntent;
        work: { kind: RepositoryRefreshWorkKind };
      }
      ? Extract<Args["intent"], { source: Intent }> extends never
        ? never
        : Args["work"]["kind"]
      : never
    : never;

type MakeRepositoryRefreshRequestArgsForIntentWork<
  Intent extends RepositoryRefreshIntentSource,
  Work extends WorkKindForIntent<Intent>,
> = Extract<MakeRepositoryRefreshRequestArgs, { work: { kind: Work } }> & {
  intent: Extract<RepositoryRefreshIntent, { source: Intent }>;
};

type IntentWorkMatrixRow<
  Intent extends RepositoryRefreshIntentSource,
  Work extends WorkKindForIntent<Intent>,
> = {
  intent: Intent;
  work: Work;
  expectedPriority: RepositoryRefreshPriority;
  story: string;
  make: (
    context: RepositoryRefreshMatrixContext,
  ) => MakeRepositoryRefreshRequestArgsForIntentWork<Intent, Work>;
  expectedDedupeKey: (context: RepositoryRefreshMatrixContext) => string;
};

type IntentWorkMatrix = {
  [Intent in RepositoryRefreshIntentSource]: {
    [Work in WorkKindForIntent<Intent>]: IntentWorkMatrixRow<Intent, Work>;
  };
};

const intentWorkMatrix = {
  dashboard: {
    repo_metadata: {
      intent: "dashboard",
      work: "repo_metadata",
      expectedPriority: "background",
      story:
        "Dashboard opens or returns to the foreground and asks for repo/branch list freshness.",
      make: ({ ids }) => ({
        userId: ids.userId,
        vaultId: ids.vaultId,
        now: 100,
        notBefore: 100,
        intent: { source: "dashboard", trigger: "page_load" },
        work: { kind: "repo_metadata", enrichment: { kind: "none" } },
      }),
      expectedDedupeKey: ({ ids }) =>
        `user:${ids.userId}:vault:${ids.vaultId}:repo_metadata`,
    },
    link_enrichment: {
      intent: "dashboard",
      work: "link_enrichment",
      expectedPriority: "background",
      story:
        "Dashboard refreshes provider links shown in branch rows without refreshing branch trees.",
      make: ({ ids }) => ({
        userId: ids.userId,
        vaultId: ids.vaultId,
        now: 101,
        notBefore: 101,
        intent: { source: "dashboard", trigger: "visibility" },
        work: {
          kind: "link_enrichment",
          branch: "main",
          provider: "cloudflare_pages_comments",
        },
      }),
      expectedDedupeKey: ({ ids }) =>
        `user:${ids.userId}:vault:${ids.vaultId}:branch:main:link_enrichment:cloudflare_pages_comments`,
    },
  },
  manual: {
    repo_metadata: {
      intent: "manual",
      work: "repo_metadata",
      expectedPriority: "manual",
      story:
        "User clicks the dashboard refresh control and asks for repo-wide freshness.",
      make: ({ ids }) => ({
        userId: ids.userId,
        vaultId: ids.vaultId,
        now: 102,
        notBefore: 102,
        intent: { source: "manual", trigger: "dashboard_status_click" },
        work: {
          kind: "repo_metadata",
          enrichment: {
            kind: "pull_request_metadata",
            includeAheadBehind: true,
          },
        },
      }),
      expectedDedupeKey: ({ ids }) =>
        `user:${ids.userId}:vault:${ids.vaultId}:repo_metadata`,
    },
    branch_tree: {
      intent: "manual",
      work: "branch_tree",
      expectedPriority: "manual",
      story:
        "User asks a specific branch to refresh, so only that branch tree is queued.",
      make: ({ ids }) => ({
        userId: ids.userId,
        vaultId: ids.vaultId,
        now: 103,
        notBefore: 103,
        intent: { source: "manual", trigger: "dashboard_status_click" },
        work: { kind: "branch_tree", branch: "main" },
      }),
      expectedDedupeKey: ({ ids }) =>
        `user:${ids.userId}:vault:${ids.vaultId}:branch:main:tree`,
    },
    link_enrichment: {
      intent: "manual",
      work: "link_enrichment",
      expectedPriority: "manual",
      story:
        "User asks for provider links for one branch without forcing metadata or tree work.",
      make: ({ ids }) => ({
        userId: ids.userId,
        vaultId: ids.vaultId,
        now: 104,
        notBefore: 104,
        intent: { source: "manual", trigger: "dashboard_status_click" },
        work: {
          kind: "link_enrichment",
          branch: "main",
          provider: "cloudflare_pages_comments",
        },
      }),
      expectedDedupeKey: ({ ids }) =>
        `user:${ids.userId}:vault:${ids.vaultId}:branch:main:link_enrichment:cloudflare_pages_comments`,
    },
  },
  source_setup: {
    repo_metadata: {
      intent: "source_setup",
      work: "repo_metadata",
      expectedPriority: "system",
      story:
        "Create/connect finished; backend discovers branches so the dashboard works without a browser reload.",
      make: ({ ids, runId }) => ({
        userId: ids.userId,
        vaultId: ids.vaultId,
        now: 105,
        notBefore: 105,
        intent: {
          source: "source_setup",
          runId,
          mode: "connect_existing_repository",
        },
        work: { kind: "repo_metadata", enrichment: { kind: "none" } },
      }),
      expectedDedupeKey: ({ ids }) =>
        `user:${ids.userId}:vault:${ids.vaultId}:repo_metadata`,
    },
  },
  file_view: {
    branch_tree: {
      intent: "file_view",
      work: "branch_tree",
      expectedPriority: "normal",
      story:
        "A file route opens or becomes visible and asks for the visible branch tree.",
      make: ({ ids }) => ({
        userId: ids.userId,
        vaultId: ids.vaultId,
        now: 106,
        notBefore: 106,
        intent: { source: "file_view", trigger: "page_load" },
        work: { kind: "branch_tree", branch: "main" },
      }),
      expectedDedupeKey: ({ ids }) =>
        `user:${ids.userId}:vault:${ids.vaultId}:branch:main:tree`,
    },
  },
  commit: {
    branch_tree: {
      intent: "commit",
      work: "branch_tree",
      expectedPriority: "system",
      story:
        "A local commit changed one branch; the backend refreshes that branch tree.",
      make: ({ ids }) => ({
        userId: ids.userId,
        vaultId: ids.vaultId,
        now: 107,
        notBefore: 107,
        intent: { source: "commit" },
        work: { kind: "branch_tree", branch: "main" },
      }),
      expectedDedupeKey: ({ ids }) =>
        `user:${ids.userId}:vault:${ids.vaultId}:branch:main:tree`,
    },
  },
  pull: {
    branch_tree: {
      intent: "pull",
      work: "branch_tree",
      expectedPriority: "system",
      story:
        "A pull moved one branch under the local checkout; the backend refreshes that branch tree.",
      make: ({ ids }) => ({
        userId: ids.userId,
        vaultId: ids.vaultId,
        now: 108,
        notBefore: 108,
        intent: { source: "pull" },
        work: { kind: "branch_tree", branch: "main" },
      }),
      expectedDedupeKey: ({ ids }) =>
        `user:${ids.userId}:vault:${ids.vaultId}:branch:main:tree`,
    },
  },
} satisfies IntentWorkMatrix;

type WorkScopeMatrixRow = {
  scope: "repository" | "branch_tree" | "branch_provider_links";
  story: string;
  makeWork: () => RepositoryRefreshRequest["work"];
  expectedDedupeKey: (ids: RepositoryRefreshMatrixContext["ids"]) => string;
};

const workScopeMatrix = {
  repo_metadata: {
    scope: "repository",
    story:
      "Repo metadata is vault-wide: branch discovery and optional PR metadata, never one branch tree.",
    makeWork: () => ({
      kind: "repo_metadata",
      enrichment: { kind: "none" },
    }),
    expectedDedupeKey: (ids) =>
      `user:${ids.userId}:vault:${ids.vaultId}:repo_metadata`,
  },
  branch_tree: {
    scope: "branch_tree",
    story:
      "Branch tree work is branch-scoped and cannot exist without a branch name.",
    makeWork: () => ({ kind: "branch_tree", branch: "main" }),
    expectedDedupeKey: (ids) =>
      `user:${ids.userId}:vault:${ids.vaultId}:branch:main:tree`,
  },
  link_enrichment: {
    scope: "branch_provider_links",
    story:
      "Link enrichment is branch + provider scoped so provider comment parsing has its own queue lane.",
    makeWork: () => ({
      kind: "link_enrichment",
      branch: "main",
      provider: "cloudflare_pages_comments",
    }),
    expectedDedupeKey: (ids) =>
      `user:${ids.userId}:vault:${ids.vaultId}:branch:main:link_enrichment:cloudflare_pages_comments`,
  },
} satisfies Record<
  RepositoryRefreshRequest["work"]["kind"],
  WorkScopeMatrixRow
>;

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

  it("enumerates allowed intent-work states", async () => {
    const context = await createMatrixContext();

    for (const rowsByWork of Object.values(intentWorkMatrix)) {
      for (const row of Object.values(rowsByWork)) {
        const request = makeRepositoryRefreshRequest(row.make(context));

        expect(request.intent.source).toBe(row.intent);
        expect(request.work.kind).toBe(row.work);
        expect(getRepositoryRefreshPriority(request.intent)).toBe(
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

  it("derives scope from work without reading intent", async () => {
    const { ids } = await createVaultIds();

    for (const [workKind, row] of Object.entries(workScopeMatrix)) {
      const work = row.makeWork();

      expect(work.kind).toBe(workKind);
      expect(
        deriveRepositoryRefreshDedupeKey({
          userId: ids.userId,
          vaultId: ids.vaultId,
          work,
        }),
      ).toBe(row.expectedDedupeKey(ids));
    }
  });

  it("keeps lifecycle fields local to each lifecycle state", () => {
    for (const [state, row] of Object.entries(lifecycleMatrix)) {
      const lifecycle = row.makeLifecycle();

      expect(lifecycle.state).toBe(state);
      expect(Object.keys(lifecycle).sort()).toEqual(row.fields);
    }
  });

  it("creates queued metadata requests with derived queue fields", async () => {
    const { ids, t } = await createVaultIds();
    const request = makeRepositoryRefreshRequest({
      userId: ids.userId,
      vaultId: ids.vaultId,
      now: 10,
      notBefore: 12,
      intent: {
        source: "dashboard",
        trigger: "page_load",
      },
      work: {
        kind: "repo_metadata",
        enrichment: { kind: "none" },
      },
    });

    expect(request).toMatchObject({
      userId: ids.userId,
      vaultId: ids.vaultId,
      dedupeKey: `user:${ids.userId}:vault:${ids.vaultId}:repo_metadata`,
      lifecycle: {
        state: "queued",
        notBefore: 12,
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

  it("derives work-specific dedupe keys", async () => {
    const { ids } = await createVaultIds();

    expect(
      deriveRepositoryRefreshDedupeKey({
        userId: ids.userId,
        vaultId: ids.vaultId,
        work: {
          kind: "branch_tree",
          branch: "main",
        },
      }),
    ).toBe(`user:${ids.userId}:vault:${ids.vaultId}:branch:main:tree`);
    expect(
      deriveRepositoryRefreshDedupeKey({
        userId: ids.userId,
        vaultId: ids.vaultId,
        work: {
          kind: "link_enrichment",
          branch: "main",
          provider: "cloudflare_pages_comments",
        },
      }),
    ).toBe(
      `user:${ids.userId}:vault:${ids.vaultId}:branch:main:link_enrichment:cloudflare_pages_comments`,
    );
  });

  it("creates link enrichment as separate provider work", async () => {
    const { ids, t } = await createVaultIds();
    const request = makeRepositoryRefreshRequest({
      userId: ids.userId,
      vaultId: ids.vaultId,
      now: 14,
      notBefore: 14,
      intent: {
        source: "dashboard",
        trigger: "visibility",
      },
      work: {
        kind: "link_enrichment",
        branch: "main",
        provider: "cloudflare_pages_comments",
      },
    });

    expect(request).toMatchObject({
      dedupeKey: `user:${ids.userId}:vault:${ids.vaultId}:branch:main:link_enrichment:cloudflare_pages_comments`,
      work: {
        kind: "link_enrichment",
        branch: "main",
        provider: "cloudflare_pages_comments",
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

  it("keeps source setup intent tied to the provisioning run", async () => {
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
      notBefore: 20,
      intent: {
        source: "source_setup",
        runId,
        mode: "connect_existing_repository",
      },
      work: {
        kind: "repo_metadata",
        enrichment: { kind: "none" },
      },
    });

    expect(getRepositoryRefreshPriority(request.intent)).toBe("system");
    expect(request.intent).toEqual({
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
      notBefore: 10,
      intent: {
        source: "manual",
        trigger: "dashboard_status_click",
      },
      work: {
        kind: "repo_metadata",
        enrichment: {
          kind: "pull_request_metadata",
          includeAheadBehind: true,
        },
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
      notBefore: 10,
      intent: {
        source: "dashboard",
        trigger: "visibility",
      },
      work: {
        kind: "repo_metadata",
        enrichment: { kind: "none" },
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

function _checkForbiddenIntentWorkPairs(
  userId: RepositoryRefreshRequest["userId"],
  vaultId: RepositoryRefreshRequest["vaultId"],
  runId: SourceSetupRefreshIntent["runId"],
) {
  // @ts-expect-error dashboard cannot fan out branch trees from passive refresh.
  makeRepositoryRefreshRequest({
    userId,
    vaultId,
    now: 1,
    notBefore: 1,
    intent: { source: "dashboard", trigger: "page_load" },
    work: { kind: "branch_tree", branch: "main" },
  });

  // @ts-expect-error source setup discovers branches through repo_metadata first.
  makeRepositoryRefreshRequest({
    userId,
    vaultId,
    now: 1,
    notBefore: 1,
    intent: {
      source: "source_setup",
      runId,
      mode: "connect_existing_repository",
    },
    work: { kind: "branch_tree", branch: "main" },
  });

  // @ts-expect-error source setup does not parse provider comments.
  makeRepositoryRefreshRequest({
    userId,
    vaultId,
    now: 1,
    notBefore: 1,
    intent: {
      source: "source_setup",
      runId,
      mode: "connect_existing_repository",
    },
    work: {
      kind: "link_enrichment",
      branch: "main",
      provider: "cloudflare_pages_comments",
    },
  });

  // @ts-expect-error file view is branch-scoped and cannot request repo metadata.
  makeRepositoryRefreshRequest({
    userId,
    vaultId,
    now: 1,
    notBefore: 1,
    intent: { source: "file_view", trigger: "page_load" },
    work: { kind: "repo_metadata", enrichment: { kind: "none" } },
  });

  // @ts-expect-error file view does not imply PR comment parsing.
  makeRepositoryRefreshRequest({
    userId,
    vaultId,
    now: 1,
    notBefore: 1,
    intent: { source: "file_view", trigger: "page_load" },
    work: {
      kind: "link_enrichment",
      branch: "main",
      provider: "cloudflare_pages_comments",
    },
  });

  // @ts-expect-error commit follow-up refreshes the changed branch tree only.
  makeRepositoryRefreshRequest({
    userId,
    vaultId,
    now: 1,
    notBefore: 1,
    intent: { source: "commit" },
    work: { kind: "repo_metadata", enrichment: { kind: "none" } },
  });

  // @ts-expect-error commit follow-up does not imply provider comment parsing.
  makeRepositoryRefreshRequest({
    userId,
    vaultId,
    now: 1,
    notBefore: 1,
    intent: { source: "commit" },
    work: {
      kind: "link_enrichment",
      branch: "main",
      provider: "cloudflare_pages_comments",
    },
  });

  // @ts-expect-error pull follow-up refreshes the moved branch tree only.
  makeRepositoryRefreshRequest({
    userId,
    vaultId,
    now: 1,
    notBefore: 1,
    intent: { source: "pull" },
    work: { kind: "repo_metadata", enrichment: { kind: "none" } },
  });

  // @ts-expect-error pull follow-up does not imply provider comment parsing.
  makeRepositoryRefreshRequest({
    userId,
    vaultId,
    now: 1,
    notBefore: 1,
    intent: { source: "pull" },
    work: {
      kind: "link_enrichment",
      branch: "main",
      provider: "cloudflare_pages_comments",
    },
  });

  makeRepositoryRefreshRequest({
    userId,
    vaultId,
    now: 1,
    notBefore: 1,
    // @ts-expect-error callers cannot provide priority because it is derived.
    priority: "system",
    intent: { source: "dashboard", trigger: "page_load" },
    work: { kind: "repo_metadata", enrichment: { kind: "none" } },
  });
}
