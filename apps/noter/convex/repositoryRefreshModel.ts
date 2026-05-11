import { Infer, v } from "convex/values";

const { boolean, id, literal, number, object, string, union } = v;

// MARK: Request Axes

/**
 * Link source used by refresh work that reads PR bot comments.
 */
export const RepositoryRefreshLinkProvider = union(
  literal("cloudflare_pages_comments"),
);
export type RepositoryRefreshLinkProvider = Infer<
  typeof RepositoryRefreshLinkProvider
>;

/**
 * Extra repository metadata requested with repo_metadata work.
 *
 * none = branch/repo shape only; pull_request_links includes provider parsing.
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
 * Scheduler priority derived from intent, not user input.
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
 * Passive dashboard reload signal.
 */
export const DashboardRefreshIntent = object({
  source: literal("dashboard"),
  trigger: union(literal("page_load"), literal("visibility")),
});
export type DashboardRefreshIntent = Infer<typeof DashboardRefreshIntent>;

/**
 * User-clicked refresh signal.
 */
export const ManualRefreshIntent = object({
  source: literal("manual"),
  trigger: literal("dashboard_status_click"),
});
export type ManualRefreshIntent = Infer<typeof ManualRefreshIntent>;

/**
 * Source setup completion signal; fixes initial branch discovery after create/connect.
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
 * Passive branch-scoped file-view reload signal.
 */
export const FileViewRefreshIntent = object({
  source: literal("file_view"),
  trigger: union(literal("page_load"), literal("visibility")),
});
export type FileViewRefreshIntent = Infer<typeof FileViewRefreshIntent>;

/**
 * Post-commit signal for the touched branch tree.
 */
export const CommitRefreshIntent = object({
  source: literal("commit"),
});
export type CommitRefreshIntent = Infer<typeof CommitRefreshIntent>;

/**
 * Post-pull signal for locally changed branch state.
 */
export const PullRefreshIntent = object({
  source: literal("pull"),
});
export type PullRefreshIntent = Infer<typeof PullRefreshIntent>;

/**
 * All entry points allowed to enqueue repository refresh work.
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
 * Repository-wide work: branch catalog plus optional PR/link enrichment.
 */
export const RepositoryMetadataRefreshWork = object({
  kind: literal("repo_metadata"),
  enrichment: RepositoryMetadataEnrichment,
});
export type RepositoryMetadataRefreshWork = Infer<
  typeof RepositoryMetadataRefreshWork
>;

/**
 * Branch-scoped tree refresh work.
 */
export const BranchTreeRefreshWork = object({
  kind: literal("branch_tree"),
  branch: string(),
});
export type BranchTreeRefreshWork = Infer<typeof BranchTreeRefreshWork>;

/**
 * Branch-scoped provider link refresh; separate because it can be more expensive.
 */
export const LinkEnrichmentRefreshWork = object({
  kind: literal("link_enrichment"),
  branch: string(),
  provider: RepositoryRefreshLinkProvider,
});
export type LinkEnrichmentRefreshWork = Infer<typeof LinkEnrichmentRefreshWork>;

// MARK: Lifecycle Schema

/**
 * Worker terminal result.
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
 * Worker failure details used for retry and cooldown decisions.
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
 * Non-worker terminal stop reason.
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
 * Durable request state; impossible fields stay out of each variant.
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
 * Repository metadata request; only dashboard/manual/setup may create it.
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
 * Branch tree request; only branch or explicit write signals may create it.
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
 * Provider link request; dashboard/manual only for now.
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
 * Table row validator. Work kind determines the allowed intent shape.
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
 * Builder input before dedupe, priority, and queued lifecycle are derived.
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
