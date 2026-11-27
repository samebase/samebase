import { v, type Infer } from "convex/values";
import { vConvexDeploymentRegion } from "../convex/convexDeploymentRegionModel";

const { array, literal, number, object, string, union } = v;

/** Renewal may retry provider failures. Samebase access failures remain separate. */
export const ALCHEMY_CONNECTION_UNAVAILABLE = "Alchemy state is temporarily unavailable.";

/** Why Samebase will not delete a GitHub repository whose stack the store still holds. */
export const DESTROY_ALCHEMY_STACK_FIRST = "Destroy your Alchemy stack first.";

/** Why Samebase will not delete a GitHub repository when it cannot read the store. */
export const CONNECT_CONVEX_TO_CHECK_STACK =
  "Connect Convex so Samebase can check for an Alchemy stack.";

/** Why Samebase will not delete a GitHub repository when Cloudflare refuses the store read. */
export const RECONNECT_CLOUDFLARE_TO_CHECK_STACK =
  "An owner must connect Cloudflare again on Providers and allow Secrets Store Read and Edit, so Samebase can check for an Alchemy stack.";

/** Why Samebase will not delete a GitHub repository when the Cloudflare store read fails. */
export const CLOUDFLARE_STORE_UNREADABLE =
  "Samebase could not read the Alchemy state store in Cloudflare, so it cannot check for a stack. Try again.";

/** Why Samebase will not delete a GitHub repository when the read of its state branch fails. */
export const GITHUB_STORE_UNREADABLE =
  "Samebase could not read the Alchemy state branch alchemy-state-store of the repository, so it cannot check for a stack. Try again.";

/**
One stage as the store gives it: Alchemy state only. `resources` are in fqn order. Their values and
`output` are JSON texts of Alchemy state, and `output` is null for a stage without one.

@see https://github.com/samebase/samebase/blob/e992b030f0b5cb4da9959a6fa4b17be3d7a23bbf/packages/alchemy-convex/src/store/component/state.ts#L292-L301
*/
export const vAlchemyStoredStage = object({
  name: string(),
  resources: array(object({ fqn: string(), value: string() })),
  output: union(string(), v.null()),
});
export type AlchemyStoredStage = Infer<typeof vAlchemyStoredStage>;

/**
The value of `reader:repository` (store version 7): the stack whose name is the repository of the
reader token, and each stack whose name starts with that name and `/`, in name order. Each stack has
every stage with a resource or an output, in name order. The reader replaces each secret with
`{ "__redacted__": null }` and changes nothing else, so an output keeps its run record under
`samebase.run`.

@see https://github.com/samebase/samebase/blob/e992b030f0b5cb4da9959a6fa4b17be3d7a23bbf/packages/alchemy-convex/src/store/component/reader.ts#L11-L96
*/
export const vAlchemyRepositoryReply = object({
  store: literal("found"),
  stacks: array(object({ name: string(), stages: array(vAlchemyStoredStage) })),
});

/**
The record of the run that wrote the output of a stage. The run record layer of alchemy-convex adds
it to the output under `samebase.run`, and Alchemy writes the output only after a full successful
deploy. Version 1 names the repository by `owner/name`; version 2 identifies it by GitHub id.
*/
export const vAlchemyRunRecord = union(
  object({
    version: literal(1),
    /** GitHub `owner/name`. */
    repository: string(),
    /** Stack file relative to the repository root, with POSIX separators. */
    stackFile: string(),
    branch: string(),
    pullRequest: union(number(), v.null()),
    headCommit: string(),
    runUrl: union(string(), v.null()),
    source: union(literal("github-actions"), literal("checkout")),
    /** ISO 8601, when the record was written. */
    recordedAt: string(),
  }),
  object({
    version: literal(2),
    source: union(literal("github-actions"), literal("checkout")),
    /** GitHub's numeric repository id, in digits. */
    repositoryId: string(),
    /** GitHub's numeric id of the repository owner, in digits. */
    repositoryOwnerId: string(),
    /** GitHub `owner/name` at deploy time, for display only. */
    repositoryName: string(),
    stackFile: string(),
    branch: string(),
    pullRequest: union(number(), v.null()),
    headCommit: string(),
    runUrl: union(string(), v.null()),
    recordedAt: string(),
  }),
);
export type AlchemyRunRecord = Infer<typeof vAlchemyRunRecord>;

/** A stage of the repository after its first full successful deploy. */
const vAlchemyStage = object({
  name: string(),
  /** The run of the last full successful deploy of the stage. */
  run: vAlchemyRunRecord,
  /** JSON from Alchemy's `encodeState`, with marked secret values removed. */
  resources: array(object({ fqn: string(), value: string() })),
  /** JSON without the run record or marked secret values. */
  output: string(),
});
export type AlchemyStage = Infer<typeof vAlchemyStage>;

/**
Stacks and stages are in name order. Resources are in fqn order. `store` is the Alchemy state store
that holds the stack: the store of the Convex team, of the Cloudflare account, or the branch
`alchemy-state-store` of the GitHub repository. A stack that moved its state can be in two stores,
with the same name.
*/
const vAlchemyStack = object({
  name: string(),
  store: union(literal("convex"), literal("cloudflare"), literal("github")),
  stages: array(vAlchemyStage),
});
export type AlchemyStack = Infer<typeof vAlchemyStack>;

/** The stacks of a repository that have a stage of the repository, or no store in the team. */
export const vAlchemyStacksRead = union(
  object({ store: literal("missing") }),
  object({ store: literal("found"), stacks: array(vAlchemyStack) }),
);
export type AlchemyStacksRead = Infer<typeof vAlchemyStacksRead>;

/**
The setup status of a repository_actions repository, from the `prod` stages of the repository's
stacks in the team's Alchemy state store.

no_successful_deployment = no completed production deploy is recorded. The store does not say
whether a run is still running or failed.

done = the stage has the run record of a completed deploy of the repository.
*/
export const vAlchemySetupStatus = union(
  object({ state: literal("no_successful_deployment") }),
  object({ state: literal("done") }),
);
export type AlchemySetupStatus = Infer<typeof vAlchemySetupStatus>;

/**
`customDomains` are the verified custom domains of the deployment, oldest first: a `convexSite`
domain serves its HTTP actions and a `convexCloud` domain its client API. A deployment whose domains
Convex does not give, such as to a credential without `deployment:customDomain:view`, has none.
*/
export const vAlchemyLiveDeployments = array(
  object({
    deploymentName: string(),
    dashboardUrl: union(string(), v.null()),
    region: union(vConvexDeploymentRegion, v.null()),
    customDomains: array(
      object({
        domain: string(),
        requestDestination: union(literal("convexCloud"), literal("convexSite")),
      }),
    ),
  }),
);

/**
The read of the Alchemy state store of the organization's Cloudflare account (`Cloudflare.state()`)
for one repository: the stages whose run record matches the repository, as `readDeployedStacks` keeps
them, with the Convex metadata of their production deployments.
*/
export const vCloudflareStacksRead = union(
  /** The organization has no Cloudflare connection. */
  object({ state: literal("not_connected") }),
  /** Cloudflare refused the connection's token: an owner must connect again. */
  object({ state: literal("reconnect") }),
  /** The account has no store that Samebase can find. */
  object({ state: literal("no_store") }),
  object({ state: literal("unsupported_version"), version: number() }),
  object({ state: literal("failed") }),
  object({
    state: literal("found"),
    stacks: array(vAlchemyStack),
    liveDeployments: vAlchemyLiveDeployments,
  }),
);
export type CloudflareStacksRead = Infer<typeof vCloudflareStacksRead>;

/**
The read of the GitHub state store of `@samebase/alchemy-kit/github-state`, the branch
`alchemy-state-store` of the repository, for the repository: the stages whose run record matches the
repository, as `readDeployedStacks` keeps them, with the Convex metadata of their production
deployments.
*/
export const vGitHubStacksRead = union(
  /** The repository has no branch `alchemy-state-store`. */
  object({ state: literal("no_store") }),
  object({ state: literal("failed") }),
  object({
    state: literal("found"),
    stacks: array(vAlchemyStack),
    liveDeployments: vAlchemyLiveDeployments,
  }),
);
export type GitHubStacksRead = Infer<typeof vGitHubStacksRead>;

/**
The stacks of a repository in the store of its Convex team whose name is not `owner/name` and does
not start with `owner/name/`, such as the stack of a renamed repository, with the Convex metadata of
their production deployments. The browser subscription gives only the stacks under the current name.
*/
export const vOtherNameStacksRead = object({
  stacks: array(vAlchemyStack),
  liveDeployments: vAlchemyLiveDeployments,
});
export type OtherNameStacksRead = Infer<typeof vOtherNameStacksRead>;

/** Samebase holds no Convex connection to the repository's team, so it cannot read the store. */
export const vAlchemyNoConnection = object({ store: literal("no_connection") });

/** The read of the store, with Management API metadata for each Convex production deployment. */
export type AlchemyStateObservation =
  | { store: "missing" }
  | Infer<typeof vAlchemyNoConnection>
  | (Extract<AlchemyStacksRead, { store: "found" }> & {
      liveDeployments: Infer<typeof vAlchemyLiveDeployments>;
    });
