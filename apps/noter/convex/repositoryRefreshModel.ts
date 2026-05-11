import { Infer, v } from "convex/values";

const { boolean, id, literal, number, object, string, union } = v;

// MARK: Request Axes

/**
 * Provider-specific link parser used by refresh work.
 *
 * Today this means "read Cloudflare Pages URLs from GitHub PR comments". A
 * future CodeRabbit/Vercel/etc parser should add a new literal here and its own
 * worker path instead of making Cloudflare behavior generic by accident.
 */
export const RepositoryRefreshLinkProvider = union(
  literal("cloudflare_pages_comments"),
);
export type RepositoryRefreshLinkProvider = Infer<
  typeof RepositoryRefreshLinkProvider
>;

/**
 * Cost/coverage knob for repo_metadata work.
 *
 * none = repository + branch list only.
 *
 * pull_request_metadata = also read PR state; includeAheadBehind controls
 * whether we pay for ahead/behind counts.
 *
 * pull_request_links = also parse provider comments, for example Cloudflare
 * Pages URLs in GitHub PR comments.
 */
export const RepositoryMetadataEnrichment = union(
  object({
    kind: literal("none"),
  }),
  object({
    kind: literal("pull_request_metadata"),
    includeAheadBehind: boolean(),
  }),
  object({
    kind: literal("pull_request_links"),
    includeAheadBehind: boolean(),
    provider: RepositoryRefreshLinkProvider,
  }),
);
export type RepositoryMetadataEnrichment = Infer<
  typeof RepositoryMetadataEnrichment
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
export const RepositoryRefreshPriority = union(
  literal("background"),
  literal("normal"),
  literal("manual"),
  literal("system"),
);
export type RepositoryRefreshPriority = Infer<typeof RepositoryRefreshPriority>;

// MARK: Intent Schema

/**
 * Dashboard mounted or became visible and asks for background freshness.
 *
 * Use it for dashboard-owned data: repo metadata or provider links shown in
 * dashboard rows. It cannot enqueue branch_tree work; trees are refreshed by
 * file view, manual, commit, or pull signals.
 */
export const DashboardRefreshIntent = object({
  source: literal("dashboard"),
  trigger: union(literal("page_load"), literal("visibility")),
});
export type DashboardRefreshIntent = Infer<typeof DashboardRefreshIntent>;

/**
 * Dashboard status button. Manual can queue metadata, branch tree, or link work
 * when the UI knows the work target.
 */
export const ManualRefreshIntent = object({
  source: literal("manual"),
  trigger: literal("dashboard_status_click"),
});
export type ManualRefreshIntent = Infer<typeof ManualRefreshIntent>;

/**
 * GitHub repo create/connect flow finished.
 *
 * This is the initial branch-discovery entry point: connecting an existing repo
 * should enqueue repo_metadata work so branches appear without a browser reload.
 * runId points at the provisioning run for debugging and audit.
 */
export const SourceSetupRefreshIntent = object({
  source: literal("source_setup"),
  runId: id("appProvisioningRuns"),
  mode: union(
    literal("create_repository"),
    literal("connect_existing_repository"),
  ),
});
export type SourceSetupRefreshIntent = Infer<typeof SourceSetupRefreshIntent>;

/**
 * File route loaded or became visible for a specific branch.
 *
 * Example: opening a file on main can request branch_tree for main. It cannot
 * request repo_metadata because the file view is branch-scoped.
 */
export const FileViewRefreshIntent = object({
  source: literal("file_view"),
  trigger: union(literal("page_load"), literal("visibility")),
});
export type FileViewRefreshIntent = Infer<typeof FileViewRefreshIntent>;

/**
 * Local commit finished. The follow-up work should refresh the branch tree that
 * changed so persisted UI state catches up with the write.
 */
export const CommitRefreshIntent = object({
  source: literal("commit"),
});
export type CommitRefreshIntent = Infer<typeof CommitRefreshIntent>;

/**
 * Local pull finished. The follow-up work should refresh the branch tree whose
 * provider state moved underneath the local checkout.
 */
export const PullRefreshIntent = object({
  source: literal("pull"),
});
export type PullRefreshIntent = Infer<typeof PullRefreshIntent>;

/**
 * All reasons a refresh request may enter the queue.
 *
 * Request validators below pair these intents with only the work kinds they can
 * honestly describe. For example, source_setup can discover branches through
 * repo_metadata, but it cannot create branch_tree or link_enrichment rows.
 */
export const RepositoryRefreshIntent = union(
  DashboardRefreshIntent,
  ManualRefreshIntent,
  SourceSetupRefreshIntent,
  FileViewRefreshIntent,
  CommitRefreshIntent,
  PullRefreshIntent,
);
export type RepositoryRefreshIntent = Infer<typeof RepositoryRefreshIntent>;

// MARK: Work Schema

/**
 * Repo-wide cache refresh.
 *
 * Example: source_setup + repo_metadata + enrichment none discovers branches
 * after a new or connected GitHub repo. This work does not refresh one branch's
 * file tree.
 */
export const RepositoryMetadataRefreshWork = object({
  kind: literal("repo_metadata"),
  enrichment: RepositoryMetadataEnrichment,
});
export type RepositoryMetadataRefreshWork = Infer<
  typeof RepositoryMetadataRefreshWork
>;

/**
 * One branch's file tree cache.
 *
 * Example: branch="main" after commit/pull, or when opening a file route on
 * main. This keeps branch work out of repo-wide dashboard polling.
 */
export const BranchTreeRefreshWork = object({
  kind: literal("branch_tree"),
  branch: string(),
});
export type BranchTreeRefreshWork = Infer<typeof BranchTreeRefreshWork>;

/**
 * Provider link parsing for one branch.
 *
 * Example: read Cloudflare Pages preview links from PR comments for branch
 * "main". This is separate from branch_tree because comment parsing can be more
 * expensive than reading the tree.
 */
export const LinkEnrichmentRefreshWork = object({
  kind: literal("link_enrichment"),
  branch: string(),
  provider: RepositoryRefreshLinkProvider,
});
export type LinkEnrichmentRefreshWork = Infer<typeof LinkEnrichmentRefreshWork>;

// MARK: Lifecycle Schema

/**
 * Successful worker outcome.
 *
 * no_work_needed means the worker checked state and skipped writes; refreshed
 * records when backend refresh state actually changed.
 */
export const RepositoryRefreshResult = union(
  object({
    kind: literal("no_work_needed"),
  }),
  object({
    kind: literal("refreshed"),
    refreshedAt: number(),
  }),
);
export type RepositoryRefreshResult = Infer<typeof RepositoryRefreshResult>;

/**
 * Failed worker outcome with scheduling hints.
 *
 * rate_limited tells the scheduler when the provider may be retried.
 * provider_error cools this lane after a non-rate-limit provider failure.
 */
export const RepositoryRefreshFailure = union(
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
export type RepositoryRefreshFailure = Infer<typeof RepositoryRefreshFailure>;

/**
 * Request stopped before normal success/failure.
 *
 * superseded means a newer deduped row replaced this row; vault_deleting and
 * vault_deleted prevent work from running against a vault that is going away or
 * gone.
 */
export const RepositoryRefreshCancelReason = union(
  literal("superseded"),
  literal("vault_deleting"),
  literal("vault_deleted"),
);
export type RepositoryRefreshCancelReason = Infer<
  typeof RepositoryRefreshCancelReason
>;

/**
 * Durable execution state.
 *
 * queued has notBefore and no workpool job. running has attempt + workpoolJobId
 * and may become succeeded, failed, or canceled. Terminal variants carry only
 * the fields meaningful for that terminal state.
 */
export const RepositoryRefreshLifecycle = union(
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
    result: RepositoryRefreshResult,
  }),
  object({
    state: literal("failed"),
    attempt: number(),
    startedAt: number(),
    failedAt: number(),
    failure: RepositoryRefreshFailure,
  }),
  object({
    state: literal("canceled"),
    canceledAt: number(),
    reason: RepositoryRefreshCancelReason,
  }),
);
export type RepositoryRefreshLifecycle = Infer<
  typeof RepositoryRefreshLifecycle
>;

// MARK: Request Schema

const repositoryRefreshBaseFields = {
  userId: id("users"),
  vaultId: id("vaults"),
  dedupeKey: string(),
  priority: RepositoryRefreshPriority,
  lifecycle: RepositoryRefreshLifecycle,
  createdAt: number(),
  updatedAt: number(),
} as const;

/**
 * Repo-level request row.
 *
 * Valid intents are dashboard for passive metadata freshness, manual for an
 * explicit reload, and source_setup for initial branch discovery.
 */
export const RepositoryMetadataRefreshRequest = object({
  ...repositoryRefreshBaseFields,
  work: RepositoryMetadataRefreshWork,
  intent: union(
    DashboardRefreshIntent,
    ManualRefreshIntent,
    SourceSetupRefreshIntent,
  ),
});
export type RepositoryMetadataRefreshRequest = Infer<
  typeof RepositoryMetadataRefreshRequest
>;

/**
 * Branch tree request row.
 *
 * Valid intents all name a branch-level reason: manual, file_view, commit, or
 * pull. Dashboard auto-refresh cannot create this row because branch trees are
 * paid per branch and should not be refreshed by passive dashboard polling.
 */
export const BranchTreeRefreshRequest = object({
  ...repositoryRefreshBaseFields,
  work: BranchTreeRefreshWork,
  intent: union(
    ManualRefreshIntent,
    FileViewRefreshIntent,
    CommitRefreshIntent,
    PullRefreshIntent,
  ),
});
export type BranchTreeRefreshRequest = Infer<typeof BranchTreeRefreshRequest>;

/**
 * Provider link request row.
 *
 * Dashboard may queue passive link checks; manual may force one. File view,
 * commit, and pull do not create this row because they do not imply PR comment
 * parsing.
 */
export const LinkEnrichmentRefreshRequest = object({
  ...repositoryRefreshBaseFields,
  work: LinkEnrichmentRefreshWork,
  intent: union(ManualRefreshIntent, DashboardRefreshIntent),
});
export type LinkEnrichmentRefreshRequest = Infer<
  typeof LinkEnrichmentRefreshRequest
>;

/**
 * Persisted repositoryRefreshRequests row.
 *
 * The union forbids impossible pairings, such as source_setup + branch_tree or
 * commit + link_enrichment.
 */
export const RepositoryRefreshRequest = union(
  RepositoryMetadataRefreshRequest,
  BranchTreeRefreshRequest,
  LinkEnrichmentRefreshRequest,
);
export type RepositoryRefreshRequest = Infer<typeof RepositoryRefreshRequest>;

// MARK: Constructor Types

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
 * Callers provide the domain reason and requested work. The builder derives
 * priority, dedupeKey, and queued lifecycle. Example: source_setup +
 * repo_metadata becomes system priority and dedupes by user/vault/repo_metadata.
 */
export type MakeRepositoryRefreshRequestArgs =
  | MakeRepositoryMetadataRefreshRequestArgs
  | MakeBranchTreeRefreshRequestArgs
  | MakeLinkEnrichmentRefreshRequestArgs;

type RepositoryRefreshRequestBaseFields = {
  userId: RepositoryRefreshRequest["userId"];
  vaultId: RepositoryRefreshRequest["vaultId"];
  dedupeKey: string;
  priority: RepositoryRefreshPriority;
  lifecycle: Extract<RepositoryRefreshLifecycle, { state: "queued" }>;
  createdAt: number;
  updatedAt: number;
};

// MARK: Scheduling Helpers

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

// MARK: Request Builders

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
    priority: getRepositoryRefreshPriority(args.intent),
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
