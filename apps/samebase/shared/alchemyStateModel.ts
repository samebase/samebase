import { v, type Infer } from "convex/values";
import { vConvexDeploymentRegion } from "../convex/convexDeploymentRegionModel";

const { array, literal, number, object, string, union } = v;

/** Renewal may retry provider failures. Samebase access failures remain separate. */
export const ALCHEMY_CONNECTION_UNAVAILABLE = "Alchemy state is temporarily unavailable.";

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
  source: union(literal("github-actions"), literal("laptop")),
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

in_progress = the stage has no output yet. Its first run has not finished, or it failed: the store
does not say which, so this status never reports a failure.

done = the stage has an output.
*/
export const vAlchemySetupStatus = union(
  object({ state: literal("in_progress") }),
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

/** The read of the store, with Management API metadata for each Convex production deployment. */
export type AlchemyStateObservation =
  | { store: "missing" }
  | (Extract<AlchemyStacksRead, { store: "found" }> & {
      liveDeployments: Infer<typeof vAlchemyLiveDeployments>;
    });
