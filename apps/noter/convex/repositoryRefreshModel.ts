import { Infer, v } from "convex/values";

const { boolean, id, literal, number, object, string, union } = v;

// MARK: Providers, Enrichment, and Scheduler Priority
//
// These are request dimensions, not queue rows by themselves.
//
// Provider = which external integration-specific parser a worker should use.
//
// Enrichment = how much repository-level metadata a repo_metadata refresh should
// fetch beyond the basic repo + branch list.
//
// Scheduler priority is derived from intent when enqueuing or claiming work.
// It is not stored on the request row, because storing it would allow impossible
// duplicate state such as dashboard intent with system priority.

/**
 * Provider-specific link parser used by refresh work.
 *
 * Today this means "read Cloudflare Pages URLs from GitHub PR comments". A
 * future CodeRabbit/Netlify/etc parser should add a new literal here and its own
 * worker path instead of making Cloudflare behavior generic by accident.
 */
export const vRepositoryRefreshLinkProvider = union(
  literal("cloudflare_pages_comments"),
);
export type RepositoryRefreshLinkProvider = Infer<
  typeof vRepositoryRefreshLinkProvider
>;

/**
 * Cost/coverage knob for repo_metadata work.
 *
 * none = repository + branch list only.
 *
 * pull_request_metadata = also read PR state. includeAheadBehind controls
 * whether GitHub compare data is fetched for each branch: aheadBy/behindBy are
 * commit counts relative to the default branch.
 *
 * Provider/comment links are not metadata enrichment. They are always separate
 * link_enrichment work so comment parsing has one queue path.
 */
export const vRepositoryMetadataEnrichment = union(
  object({
    kind: literal("none"),
  }),
  object({
    kind: literal("pull_request_metadata"),
    includeAheadBehind: boolean(),
  }),
);
export type RepositoryMetadataEnrichment = Infer<
  typeof vRepositoryMetadataEnrichment
>;

/**
 * Backend scheduling lane. Callers pass an intent; the builder derives this so
 * a browser request cannot ask for faster service directly.
 *
 * background = passive dashboard freshness, safe to delay behind visible work.
 *
 * normal = branch freshness for a file route the user is reading.
 *
 * manual = explicit refresh click.
 *
 * system = backend correctness after create/connect/commit/pull; used when
 * stale refresh state would make the product contradict a completed operation.
 */
export const vRepositoryRefreshPriority = union(
  literal("background"),
  literal("normal"),
  literal("manual"),
  literal("system"),
);
export type RepositoryRefreshPriority = Infer<
  typeof vRepositoryRefreshPriority
>;

// MARK: Refresh Intents
//
// Intents answer "why did a refresh request enter the backend?"
//
// page_load = the route/surface opened and asked for stale data to be refreshed.
//
// visibility = the browser document became visible again after being hidden or
// backgrounded. It is about the browser tab, not GitHub repository visibility.
//
// The intent does not decide the worker alone. Request row validators below
// restrict which intents are valid for each work kind.

/**
 * Dashboard mounted or became visible and asks for background freshness.
 *
 * Use it for dashboard-owned data: repo metadata or provider links shown in
 * dashboard rows. It cannot enqueue branch_tree work; trees are refreshed by
 * file view, manual, commit, or pull signals.
 */
export const vDashboardRefreshIntent = object({
  source: literal("dashboard"),
  trigger: union(literal("page_load"), literal("visibility")),
});
export type DashboardRefreshIntent = Infer<typeof vDashboardRefreshIntent>;

/**
 * Dashboard status button. Manual can queue metadata, branch tree, or link work
 * when the UI knows the work target.
 */
export const vManualRefreshIntent = object({
  source: literal("manual"),
  trigger: literal("dashboard_status_click"),
});
export type ManualRefreshIntent = Infer<typeof vManualRefreshIntent>;

/**
 * GitHub repo create/connect flow finished.
 *
 * This is the initial branch-discovery entry point: connecting an existing repo
 * should enqueue repo_metadata work so branches appear without a browser reload.
 * runId points at the provisioning run for debugging and audit.
 */
export const vSourceSetupRefreshIntent = object({
  source: literal("source_setup"),
  runId: id("appProvisioningRuns"),
  mode: union(
    literal("create_repository"),
    literal("connect_existing_repository"),
  ),
});
export type SourceSetupRefreshIntent = Infer<typeof vSourceSetupRefreshIntent>;

/**
 * File route loaded or became visible for a specific branch.
 *
 * Example: opening a file on main can request branch_tree for main. It cannot
 * request repo_metadata because the file view is branch-scoped. visibility here
 * means returning to an already-open file tab.
 */
export const vFileViewRefreshIntent = object({
  source: literal("file_view"),
  trigger: union(literal("page_load"), literal("visibility")),
});
export type FileViewRefreshIntent = Infer<typeof vFileViewRefreshIntent>;

/**
 * Local commit finished. The follow-up work should refresh the branch tree that
 * changed so persisted UI state catches up with the write.
 */
export const vCommitRefreshIntent = object({
  source: literal("commit"),
});
export type CommitRefreshIntent = Infer<typeof vCommitRefreshIntent>;

/**
 * Local pull finished. The follow-up work should refresh the branch tree whose
 * provider state moved underneath the local checkout.
 */
export const vPullRefreshIntent = object({
  source: literal("pull"),
});
export type PullRefreshIntent = Infer<typeof vPullRefreshIntent>;

/**
 * All reasons a refresh request may enter the queue.
 *
 * Request validators below pair these intents with only the work kinds they can
 * honestly describe. For example, source_setup can discover branches through
 * repo_metadata, but it cannot create branch_tree or link_enrichment rows.
 */
export const vRepositoryRefreshIntent = union(
  vDashboardRefreshIntent,
  vManualRefreshIntent,
  vSourceSetupRefreshIntent,
  vFileViewRefreshIntent,
  vCommitRefreshIntent,
  vPullRefreshIntent,
);
export type RepositoryRefreshIntent = Infer<typeof vRepositoryRefreshIntent>;

// MARK: Refresh Work
//
// Work answers "what should the backend refresh?"
//
// repo_metadata refreshes repo-wide data such as branch lists and optional PR
// metadata.
//
// branch_tree refreshes one branch's file tree.
//
// link_enrichment refreshes provider-derived links for one branch.

/**
 * Repo-wide cache refresh.
 *
 * Example: source_setup + repo_metadata + enrichment none discovers branches
 * after a new or connected GitHub repo. This work does not refresh one branch's
 * file tree.
 */
export const vRepositoryMetadataRefreshWork = object({
  kind: literal("repo_metadata"),
  enrichment: vRepositoryMetadataEnrichment,
});
export type RepositoryMetadataRefreshWork = Infer<
  typeof vRepositoryMetadataRefreshWork
>;

/**
 * One branch's file tree cache.
 *
 * Example: branch="main" after commit/pull, or when opening a file route on
 * main. This keeps branch work out of repo-wide dashboard polling.
 */
export const vBranchTreeRefreshWork = object({
  kind: literal("branch_tree"),
  branch: string(),
});
export type BranchTreeRefreshWork = Infer<typeof vBranchTreeRefreshWork>;

/**
 * Provider link parsing for one branch.
 *
 * Example: read Cloudflare Pages preview links from PR comments for branch
 * "main". This is separate from branch_tree because comment parsing can be more
 * expensive than reading the tree.
 */
export const vLinkEnrichmentRefreshWork = object({
  kind: literal("link_enrichment"),
  branch: string(),
  provider: vRepositoryRefreshLinkProvider,
});
export type LinkEnrichmentRefreshWork = Infer<
  typeof vLinkEnrichmentRefreshWork
>;

// MARK: Refresh Lifecycle
//
// Lifecycle is the durable execution state stored on each request row.
//
// The union keeps state-specific fields out of impossible states: queued has no
// workpool job, running has no result, succeeded has no failure, and canceled
// has no worker result.

/**
 * Successful worker outcome.
 *
 * no_work_needed means the worker checked state and skipped writes; refreshed
 * records when backend refresh state actually changed.
 */
export const vRepositoryRefreshResult = union(
  object({
    kind: literal("no_work_needed"),
  }),
  object({
    kind: literal("refreshed"),
    refreshedAt: number(),
  }),
);
export type RepositoryRefreshResult = Infer<typeof vRepositoryRefreshResult>;

/**
 * Failed worker outcome with scheduling hints.
 *
 * rate_limited tells the scheduler when the provider may be retried.
 * provider_error cools this lane after a non-rate-limit provider failure.
 */
export const vRepositoryRefreshFailure = union(
  object({
    kind: literal("rate_limited"),
    retryAfter: number(),
    message: string(),
  }),
  object({
    kind: literal("provider_error"),
    cooldownUntil: number(),
    message: string(),
  }),
);
export type RepositoryRefreshFailure = Infer<typeof vRepositoryRefreshFailure>;

/**
 * Request stopped before normal success/failure.
 *
 * superseded means a newer deduped row replaced this row; vault_deleting and
 * vault_deleted prevent work from running against a vault that is going away or
 * gone.
 */
export const vRepositoryRefreshCancelReason = union(
  literal("superseded"),
  literal("vault_deleting"),
  literal("vault_deleted"),
);
export type RepositoryRefreshCancelReason = Infer<
  typeof vRepositoryRefreshCancelReason
>;

/**
 * Durable execution state.
 *
 * queued has notBefore and no workpool job. running has attempt + workpoolJobId
 * and may become succeeded, failed, or canceled. Terminal variants carry only
 * the fields meaningful for that terminal state.
 */
export const vRepositoryRefreshLifecycle = union(
  object({
    state: literal("queued"),
    notBefore: number(),
    queuedAt: number(),
  }),
  object({
    state: literal("running"),
    attempt: number(),
    startedAt: number(),
    workpoolJobId: string(),
  }),
  object({
    state: literal("succeeded"),
    attempt: number(),
    startedAt: number(),
    completedAt: number(),
    result: vRepositoryRefreshResult,
  }),
  object({
    state: literal("failed"),
    attempt: number(),
    startedAt: number(),
    failedAt: number(),
    failure: vRepositoryRefreshFailure,
  }),
  object({
    state: literal("canceled"),
    canceledAt: number(),
    reason: vRepositoryRefreshCancelReason,
  }),
);
export type RepositoryRefreshLifecycle = Infer<
  typeof vRepositoryRefreshLifecycle
>;

// MARK: Request Rows
//
// Request rows combine:
//
// - who owns the refresh: userId + vaultId
// - what is being refreshed: work
// - why it entered the queue: intent
// - when/how it should run: lifecycle + dedupeKey
//
// The three row validators intentionally repeat the base fields so each work
// kind can have a smaller allowed intent set.

const repositoryRefreshBaseFields = {
  userId: id("users"),
  vaultId: id("vaults"),
  dedupeKey: string(),
  lifecycle: vRepositoryRefreshLifecycle,
  createdAt: number(),
  updatedAt: number(),
} as const;

/**
 * Repo-level request row.
 *
 * Valid intents are dashboard for passive metadata freshness, manual for an
 * explicit reload, and source_setup for initial branch discovery.
 */
export const vRepositoryMetadataRefreshRequest = object({
  ...repositoryRefreshBaseFields,
  work: vRepositoryMetadataRefreshWork,
  intent: union(
    vDashboardRefreshIntent,
    vManualRefreshIntent,
    vSourceSetupRefreshIntent,
  ),
});
export type RepositoryMetadataRefreshRequest = Infer<
  typeof vRepositoryMetadataRefreshRequest
>;

/**
 * Branch tree request row.
 *
 * Valid intents all name a branch-level reason: manual, file_view, commit, or
 * pull. Dashboard auto-refresh cannot create this row because branch trees are
 * refreshed one branch at a time and should not be fanned out by passive
 * dashboard polling.
 */
export const vBranchTreeRefreshRequest = object({
  ...repositoryRefreshBaseFields,
  work: vBranchTreeRefreshWork,
  intent: union(
    vManualRefreshIntent,
    vFileViewRefreshIntent,
    vCommitRefreshIntent,
    vPullRefreshIntent,
  ),
});
export type BranchTreeRefreshRequest = Infer<typeof vBranchTreeRefreshRequest>;

/**
 * Provider link request row.
 *
 * Dashboard may queue passive link checks; manual may force one. File view,
 * commit, and pull do not create this row because they do not imply PR comment
 * parsing.
 */
export const vLinkEnrichmentRefreshRequest = object({
  ...repositoryRefreshBaseFields,
  work: vLinkEnrichmentRefreshWork,
  intent: union(vManualRefreshIntent, vDashboardRefreshIntent),
});
export type LinkEnrichmentRefreshRequest = Infer<
  typeof vLinkEnrichmentRefreshRequest
>;

/**
 * Persisted repositoryRefreshRequests row.
 *
 * The union forbids impossible pairings, such as source_setup + branch_tree or
 * commit + link_enrichment.
 */
export const vRepositoryRefreshRequest = union(
  vRepositoryMetadataRefreshRequest,
  vBranchTreeRefreshRequest,
  vLinkEnrichmentRefreshRequest,
);
export type RepositoryRefreshRequest = Infer<typeof vRepositoryRefreshRequest>;

// MARK: Builder Inputs
//
// Builder input types match the request row union, but omit all derived fields.
//
// Callers provide userId, vaultId, timestamps, intent, and work. The builder
// fills in dedupeKey, createdAt/updatedAt, and queued lifecycle.

type MakeRepositoryMetadataRefreshRequestArgs = {
  userId: RepositoryRefreshRequest["userId"];
  vaultId: RepositoryRefreshRequest["vaultId"];
  now: number;
  notBefore: number;
  intent: RepositoryMetadataRefreshRequest["intent"];
  work: RepositoryMetadataRefreshWork;
};

type MakeBranchTreeRefreshRequestArgs = {
  userId: RepositoryRefreshRequest["userId"];
  vaultId: RepositoryRefreshRequest["vaultId"];
  now: number;
  notBefore: number;
  intent: BranchTreeRefreshRequest["intent"];
  work: BranchTreeRefreshWork;
};

type MakeLinkEnrichmentRefreshRequestArgs = {
  userId: RepositoryRefreshRequest["userId"];
  vaultId: RepositoryRefreshRequest["vaultId"];
  now: number;
  notBefore: number;
  intent: LinkEnrichmentRefreshRequest["intent"];
  work: LinkEnrichmentRefreshWork;
};

/**
 * Public builder input.
 *
 * Callers provide the domain reason and requested work. The builder derives the
 * dedupe key and queued lifecycle. Example: source_setup + repo_metadata
 * dedupes by user/vault/repo_metadata; scheduler priority stays derived from
 * intent instead of being stored on the row.
 */
export type MakeRepositoryRefreshRequestArgs =
  | MakeRepositoryMetadataRefreshRequestArgs
  | MakeBranchTreeRefreshRequestArgs
  | MakeLinkEnrichmentRefreshRequestArgs;

type RepositoryRefreshRequestBaseFields = {
  userId: RepositoryRefreshRequest["userId"];
  vaultId: RepositoryRefreshRequest["vaultId"];
  dedupeKey: string;
  lifecycle: Extract<RepositoryRefreshLifecycle, { state: "queued" }>;
  createdAt: number;
  updatedAt: number;
};

// MARK: Scheduling
//
// Scheduling helpers turn domain state into queue mechanics.
//
// notBefore prevents requests from being scheduled in the past. Scheduler
// priority maps intent to a backend lane without being duplicated into the row.
// dedupeKey collapses repeated requests for the same user/vault/work target.

function assertValidScheduleTime(args: {
  now: number;
  notBefore: number;
}): void {
  if (args.notBefore < args.now) {
    throw new Error("Repository refresh notBefore cannot be before now.");
  }
}

export function getRepositoryRefreshPriority(
  intent: RepositoryRefreshIntent,
): RepositoryRefreshPriority {
  switch (intent.source) {
    case "dashboard":
      return "background";
    case "manual":
      return "manual";
    case "source_setup":
      return "system";
    case "file_view":
      return "normal";
    case "commit":
    case "pull":
      return "system";
    default: {
      intent satisfies never;
      return "normal";
    }
  }
}

export function deriveRepositoryRefreshDedupeKey(args: {
  userId: RepositoryRefreshRequest["userId"];
  vaultId: RepositoryRefreshRequest["vaultId"];
  work: RepositoryRefreshRequest["work"];
}): string {
  const prefix = `user:${args.userId}:vault:${args.vaultId}`;
  switch (args.work.kind) {
    case "repo_metadata":
      return `${prefix}:repo_metadata`;
    case "branch_tree":
      return `${prefix}:branch:${args.work.branch}:tree`;
    case "link_enrichment":
      return `${prefix}:branch:${args.work.branch}:link_enrichment:${args.work.provider}`;
    default: {
      args.work satisfies never;
      return prefix;
    }
  }
}

// MARK: Builders
//
// Builders create valid queued rows only.
//
// They do not start Workpool jobs and they do not mutate existing rows. Later
// phases can insert or upsert the returned row into repositoryRefreshRequests.

function isRepositoryMetadataRefreshRequestArgs(
  args: MakeRepositoryRefreshRequestArgs,
): args is MakeRepositoryMetadataRefreshRequestArgs {
  return args.work.kind === "repo_metadata";
}

function isBranchTreeRefreshRequestArgs(
  args: MakeRepositoryRefreshRequestArgs,
): args is MakeBranchTreeRefreshRequestArgs {
  return args.work.kind === "branch_tree";
}

function makeRepositoryRefreshRequestBase(
  args: MakeRepositoryRefreshRequestArgs,
): RepositoryRefreshRequestBaseFields {
  return {
    userId: args.userId,
    vaultId: args.vaultId,
    dedupeKey: deriveRepositoryRefreshDedupeKey(args),
    lifecycle: {
      state: "queued",
      notBefore: args.notBefore,
      queuedAt: args.now,
    },
    createdAt: args.now,
    updatedAt: args.now,
  };
}

export function makeRepositoryRefreshRequest(
  args: MakeRepositoryRefreshRequestArgs,
): RepositoryRefreshRequest {
  assertValidScheduleTime(args);
  const base = makeRepositoryRefreshRequestBase(args);

  if (isRepositoryMetadataRefreshRequestArgs(args)) {
    return {
      ...base,
      intent: args.intent,
      work: args.work,
    };
  }

  if (isBranchTreeRefreshRequestArgs(args)) {
    return {
      ...base,
      intent: args.intent,
      work: args.work,
    };
  }

  return {
    ...base,
    intent: args.intent,
    work: args.work,
  };
}

// MARK: Lifecycle Transitions
//
// Lifecycle transitions are pure state moves used by future queue mutations.
//
// Each transition checks the current state before returning the next row shape,
// which keeps invalid moves such as succeeded -> failed out of callers.

function assertPositiveAttempt(attempt: number): void {
  if (attempt < 1) {
    throw new Error("Repository refresh attempt must be positive.");
  }
}

export function markRepositoryRefreshRequestRunning(
  request: RepositoryRefreshRequest,
  args: {
    now: number;
    attempt: number;
    workpoolJobId: string;
  },
): RepositoryRefreshRequest {
  if (request.lifecycle.state !== "queued") {
    throw new Error("Only queued repository refresh requests can start.");
  }
  assertPositiveAttempt(args.attempt);
  return {
    ...request,
    lifecycle: {
      state: "running",
      attempt: args.attempt,
      startedAt: args.now,
      workpoolJobId: args.workpoolJobId,
    },
    updatedAt: args.now,
  };
}

export function markRepositoryRefreshRequestSucceeded(
  request: RepositoryRefreshRequest,
  args: {
    now: number;
    result: RepositoryRefreshResult;
  },
): RepositoryRefreshRequest {
  if (request.lifecycle.state !== "running") {
    throw new Error("Only running repository refresh requests can succeed.");
  }
  return {
    ...request,
    lifecycle: {
      state: "succeeded",
      attempt: request.lifecycle.attempt,
      startedAt: request.lifecycle.startedAt,
      completedAt: args.now,
      result: args.result,
    },
    updatedAt: args.now,
  };
}

export function markRepositoryRefreshRequestFailed(
  request: RepositoryRefreshRequest,
  args: {
    now: number;
    failure: RepositoryRefreshFailure;
  },
): RepositoryRefreshRequest {
  if (request.lifecycle.state !== "running") {
    throw new Error("Only running repository refresh requests can fail.");
  }
  return {
    ...request,
    lifecycle: {
      state: "failed",
      attempt: request.lifecycle.attempt,
      startedAt: request.lifecycle.startedAt,
      failedAt: args.now,
      failure: args.failure,
    },
    updatedAt: args.now,
  };
}

export function markRepositoryRefreshRequestCanceled(
  request: RepositoryRefreshRequest,
  args: {
    now: number;
    reason: RepositoryRefreshCancelReason;
  },
): RepositoryRefreshRequest {
  switch (request.lifecycle.state) {
    case "queued":
    case "running":
      return {
        ...request,
        lifecycle: {
          state: "canceled",
          canceledAt: args.now,
          reason: args.reason,
        },
        updatedAt: args.now,
      };
    case "succeeded":
    case "failed":
    case "canceled":
      throw new Error(
        "Only queued or running repository refresh requests can be canceled.",
      );
    default: {
      request.lifecycle satisfies never;
      throw new Error("Unsupported repository refresh lifecycle state.");
    }
  }
}
