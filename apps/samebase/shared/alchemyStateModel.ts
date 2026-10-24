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

export const vAlchemyLiveDeployments = array(
  object({
    deploymentName: string(),
    dashboardUrl: union(string(), v.null()),
    region: union(vConvexDeploymentRegion, v.null()),
  }),
);

/** The read of the store, with Management API metadata for each Convex production deployment. */
export type AlchemyStateObservation =
  | { store: "missing" }
  | (Extract<AlchemyStacksRead, { store: "found" }> & {
      liveDeployments: Infer<typeof vAlchemyLiveDeployments>;
    });
