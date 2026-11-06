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

/** The run that last wrote the state of a stage. */
export const vAlchemyRunRecord = object({
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
});

const vAlchemyStage = object({
  name: string(),
  record: vAlchemyRunRecord,
  /** Last completed deploy. */
  deployedHeadCommit: union(string(), v.null()),
  /** JSON from Alchemy's `encodeState`, with marked secret values removed. */
  resources: array(object({ fqn: string(), value: string() })),
  /** JSON without the run record or marked secret values. */
  output: string(),
});
export type AlchemyStage = Infer<typeof vAlchemyStage>;

/** Stacks and stages are in name order. Resources are in fqn order. */
const vAlchemyStack = object({ name: string(), stages: array(vAlchemyStage) });
export type AlchemyStack = Infer<typeof vAlchemyStack>;

/** The public `reader:repository` query returns only stacks of the authenticated repository. */
export const vAlchemyStacksRead = union(
  object({ store: literal("missing") }),
  object({ store: literal("found"), stacks: array(vAlchemyStack) }),
);
export type AlchemyStacksRead = Infer<typeof vAlchemyStacksRead>;

/**
The setup status of a repository_actions repository, from the `prod` stage of the stack that carries
the repository's name in the team's Alchemy state store.

no_successful_deployment = no completed production deploy is recorded. The store does not say
whether the run is still running or failed. `runUrl` opens the recorded run when one exists.

done = the stage has an output.
*/
export const vAlchemySetupStatus = union(
  object({ state: literal("no_successful_deployment"), runUrl: union(string(), v.null()) }),
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

/** Samebase holds no Convex connection to the repository's team, so it cannot read the store. */
export const vAlchemyNoConnection = object({ store: literal("no_connection") });

/** The read of the store, with Management API metadata for each Convex production deployment. */
export type AlchemyStateObservation =
  | { store: "missing" }
  | Infer<typeof vAlchemyNoConnection>
  | (Extract<AlchemyStacksRead, { store: "found" }> & {
      liveDeployments: Infer<typeof vAlchemyLiveDeployments>;
    });
