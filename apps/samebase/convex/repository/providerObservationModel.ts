import { v, type Infer } from "convex/values";

import { vConvexDeploymentRegion } from "../convexDeploymentRegionModel";
import { vCloudflareWorkerRepositoryDiscovery } from "./contracts/cloudflareAttachments";
import { vConvexCodeLocation } from "./contracts/convexAttachments";

/*
Result validators of the live provider reads in providerObservations.ts. They live in this
default-runtime module so that repository:getStatus can declare the same shapes.
*/

const { array, id, literal, object, string, union } = v;

export const vCloudflareBuildState = union(
  literal("queued"),
  literal("running"),
  literal("success"),
  literal("failure"),
  literal("cancelled"),
  literal("skipped"),
  literal("unknown"),
);
export type CloudflareBuildState = Infer<typeof vCloudflareBuildState>;

export const vCloudflareBuildDisagreementReason = union(
  literal("missing_trigger"),
  literal("missing_build_uuid"),
  literal("invalid_created_on"),
  literal("invalid_root_directory"),
  literal("worker_tag_mismatch"),
  literal("repository_id_mismatch"),
  literal("trigger_root_directory_mismatch"),
  literal("metadata_root_directory_mismatch"),
  literal("missing_trigger_deploy_command"),
  literal("deploy_command_mismatch"),
);
export type CloudflareBuildDisagreementReason = Infer<typeof vCloudflareBuildDisagreementReason>;
export type CloudflareBuildDisagreementReasons = [
  CloudflareBuildDisagreementReason,
  ...CloudflareBuildDisagreementReason[],
];

const vObservationFailureReason = union(
  literal("connection_required"),
  literal("response_parse_failed"),
  literal("response_validation_failed"),
  literal("request_failed"),
);
const vCloudflareProductionBuildUnavailableReason = union(
  vCloudflareBuildDisagreementReason,
  literal("build_history_incomplete"),
  literal("response_parse_failed"),
  literal("response_validation_failed"),
  literal("request_failed"),
);
/**
The latest production build on the default branch. `commitHash` is the commit that Cloudflare built,
or null when the build does not report one; the status read compares it with the branch head.
*/
const vCloudflareProductionBuildObservation = union(
  object({
    state: literal("available"),
    buildState: vCloudflareBuildState,
    commitHash: union(string(), v.null()),
    logsUrl: string(),
  }),
  object({ state: literal("absent") }),
  object({
    state: literal("unavailable"),
    reasons: array(vCloudflareProductionBuildUnavailableReason),
  }),
);
type CloudflareProductionBuildUnavailableReason = Infer<
  typeof vCloudflareProductionBuildUnavailableReason
>;
export type CloudflareProductionBuildUnavailableReasons = [
  CloudflareProductionBuildUnavailableReason,
  ...CloudflareProductionBuildUnavailableReason[],
];
const vObservedConvexProject = union(
  object({
    state: literal("attached"),
    convexProjectId: id("repositoryConvexProjects"),
    teamId: string(),
    attachedTeamId: string(),
    teamState: union(literal("matches"), literal("differs")),
    projectId: string(),
  }),
  object({
    state: literal("external"),
    teamId: string(),
    projectId: string(),
  }),
);
const vCloudflareConvexBuildAccess = union(
  object({ state: literal("not_configured") }),
  object({ state: literal("configured"), convexProject: vObservedConvexProject }),
  object({ state: literal("incomplete"), convexProject: vObservedConvexProject }),
  object({ state: literal("target_unknown") }),
  object({ state: literal("invalid") }),
);
const vCloudflareBuildsObservation = union(
  object({ state: literal("not_connected") }),
  object({
    state: literal("connected"),
    productionBuildTokenUuid: union(string(), v.null()),
    previewBuildTokenUuid: union(string(), v.null()),
  }),
);
const vWorkersDevObservation = union(
  object({ state: literal("enabled"), url: string() }),
  object({ state: literal("disabled") }),
  object({ state: literal("failed"), reason: vObservationFailureReason }),
);
export const vCloudflareWorkerObservation = union(
  object({
    state: literal("available"),
    workerId: id("repositoryCloudflareWorkers"),
    workerName: string(),
    customDomains: array(string()),
    workersDev: vWorkersDevObservation,
  }),
  object({
    state: literal("missing"),
    workerId: id("repositoryCloudflareWorkers"),
  }),
  object({
    state: literal("failed"),
    workerId: id("repositoryCloudflareWorkers"),
    reason: vObservationFailureReason,
  }),
);
export const vCloudflareWorkerBuildsObservation = union(
  object({
    state: literal("available"),
    workerId: id("repositoryCloudflareWorkers"),
    repository: vCloudflareWorkerRepositoryDiscovery,
    builds: vCloudflareBuildsObservation,
    productionBuild: vCloudflareProductionBuildObservation,
  }),
  object({
    state: literal("failed"),
    workerId: id("repositoryCloudflareWorkers"),
    reason: vObservationFailureReason,
  }),
);
export const vCloudflareWorkerConvexBuildAccessObservation = union(
  object({
    state: literal("available"),
    workerId: id("repositoryCloudflareWorkers"),
    convexBuildAccess: vCloudflareConvexBuildAccess,
  }),
  object({
    state: literal("failed"),
    workerId: id("repositoryCloudflareWorkers"),
    reason: vObservationFailureReason,
  }),
);
export const vCloudflareWorkerBuildAccessTarget = object({
  workerId: id("repositoryCloudflareWorkers"),
});
const vConvexProductionDeploymentObservation = union(
  object({
    state: literal("available"),
    deploymentName: string(),
    dashboardUrl: string(),
    region: vConvexDeploymentRegion,
  }),
  object({ state: literal("missing") }),
);
const vConvexCodeLocationObservation = union(
  object({
    state: literal("valid"),
    kind: literal("config"),
  }),
  object({
    state: literal("valid"),
    kind: literal("directory"),
  }),
  object({ state: literal("missing") }),
  object({ state: literal("unavailable_partial") }),
  object({ state: literal("unavailable"), reason: vObservationFailureReason }),
);
const vConvexProviderProjectDetails = {
  projectSlug: string(),
  teamSlug: string(),
  productionDeployment: vConvexProductionDeploymentObservation,
};
const vConvexProjectProviderObservation = union(
  object({
    state: literal("current"),
    ...vConvexProviderProjectDetails,
  }),
  object({ state: literal("missing_ambiguous") }),
  object({
    state: literal("unavailable"),
    reason: vObservationFailureReason,
  }),
);
export const vConvexProjectObservation = object({
  convexProjectId: id("repositoryConvexProjects"),
  projectId: string(),
  codeLocation: vConvexCodeLocation,
  source: vConvexCodeLocationObservation,
  provider: vConvexProjectProviderObservation,
});
export type CloudflareWorkerObservation = Infer<typeof vCloudflareWorkerObservation>;
export type CloudflareWorkerBuildsObservation = Infer<typeof vCloudflareWorkerBuildsObservation>;
export type CloudflareWorkerConvexBuildAccessObservation = Infer<
  typeof vCloudflareWorkerConvexBuildAccessObservation
>;
export type ConvexProjectObservation = Infer<typeof vConvexProjectObservation>;
