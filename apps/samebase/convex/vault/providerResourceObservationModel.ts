import { v, type Infer } from "convex/values";

const { literal, number, object, optional, string, union } = v;

export const vProviderResourceObservationFailureReason = union(
  literal("connection_required"),
  literal("provider_failure"),
);

const vProviderResourceObservationPending = union(
  object({ state: literal("not_requested") }),
  object({ state: literal("loading") }),
);
const vProviderResourceObservationMissing = object({
  state: literal("missing"),
  observedAt: number(),
});
const vProviderResourceObservationFailed = object({
  state: literal("failed"),
  observedAt: number(),
  reason: vProviderResourceObservationFailureReason,
});

export const vConvexDeploymentObservation = union(
  vProviderResourceObservationPending,
  vProviderResourceObservationMissing,
  vProviderResourceObservationFailed,
  object({
    state: literal("available"),
    observedAt: number(),
    projectSlug: string(),
    teamSlug: string(),
    cloudUrl: string(),
    siteUrl: string(),
    projectSettingsDashboardUrl: optional(string()),
    deploymentDashboardUrl: optional(string()),
  }),
);

export const vCloudflareWorkerObservation = union(
  vProviderResourceObservationPending,
  vProviderResourceObservationMissing,
  vProviderResourceObservationFailed,
  object({
    state: literal("available"),
    observedAt: number(),
    workersDevUrl: optional(string()),
    githubRepositoryConnection: union(literal("connected"), literal("not_connected")),
    convexDeployKeys: union(literal("set"), literal("missing"), literal("not_applicable")),
  }),
);

export type ConvexDeploymentObservation = Infer<typeof vConvexDeploymentObservation>;
export type CloudflareWorkerObservation = Infer<typeof vCloudflareWorkerObservation>;
