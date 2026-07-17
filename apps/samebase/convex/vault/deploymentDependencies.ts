import type { Doc } from "../_generated/dataModel";
import { isVaultProviderUpstreamPresent } from "./model";

type WorkerDeploymentDependencyIdentity = Pick<
  Doc<"vaultWorkerDeploymentDependencies">,
  "convexDeploymentId" | "wiring"
>;
type ConvexDeploymentIdentity = Pick<
  Doc<"vaultConvexDeployments">,
  "_id" | "deploymentName" | "projectId" | "upstream"
>;
type WorkerDeploymentDeployKeys = WorkerDeploymentDependencyIdentity["wiring"]["deployKeys"];
type CurrentWorkerDeploymentDeployKeys = {
  production: Extract<WorkerDeploymentDeployKeys["production"], { state: "created" }>;
  preview: Extract<WorkerDeploymentDeployKeys["preview"], { state: "created" }>;
};

export function readCurrentWorkerDeploymentDeployKeys(
  dependency: WorkerDeploymentDependencyIdentity,
  deployment: ConvexDeploymentIdentity,
): CurrentWorkerDeploymentDeployKeys | null {
  const { production, preview } = dependency.wiring.deployKeys;
  if (
    dependency.convexDeploymentId !== deployment._id ||
    production.state !== "created" ||
    production.deploymentName !== deployment.deploymentName ||
    preview.state !== "created" ||
    preview.projectId !== deployment.projectId
  ) {
    return null;
  }
  return { production, preview };
}

/**
 * A wired row records the provider targets used by its last successful wiring.
 * It is current only while those targets still identify the attached deployment.
 */
export function isWorkerDeploymentDependencyCurrentlyWired(
  dependency: WorkerDeploymentDependencyIdentity,
  deployment: ConvexDeploymentIdentity,
): boolean {
  return (
    dependency.wiring.state === "wired" &&
    isVaultProviderUpstreamPresent(deployment) &&
    readCurrentWorkerDeploymentDeployKeys(dependency, deployment) !== null
  );
}
