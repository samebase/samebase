import { exactly } from "@samebase/dependent/main";
import { ConvexError, type Infer } from "convex/values";

import type { cloudflareDiscoverWorkersContract } from "../repository/contracts/cloudflareAttachments";
import type { CloudflareWorkersBuildTokens } from "../repository/contracts/cloudflareBuildTokens";
import type { convexDiscoverProjectsContract } from "../repository/contracts/convexAttachments";
import type { UserRepositoryResult } from "../repository/contracts/getUserRepositories";
import { isSamebaseManagedProviderPlan } from "../repository/provisioningPlan";
import {
  getConvexCodeLocationPath,
  type ConvexCodeLocation,
} from "../../shared/convexCodeLocation";

/*
Resolves the names that MCP tools take into the stable IDs that the shared handlers take. The
dashboard already holds the IDs, so these rules run only on the MCP side.
*/

type CloudflareWorkerDiscoveryResult = Infer<typeof cloudflareDiscoverWorkersContract.returns>;
type ConvexProjectDiscoveryResult = Infer<typeof convexDiscoverProjectsContract.returns>;

function formatNames(names: readonly string[]): string {
  return names.length === 0 ? "none" : names.join(", ");
}

/** The `repository` argument: the Samebase `repositoryId` or the GitHub full name `owner/name`. */
export function findRepositoryByReference<
  Repository extends { repositoryId: string; githubRepositoryFullName: string },
>(repositories: readonly Repository[], reference: string): Repository {
  const trimmedReference = reference.trim();
  const repositoryById = repositories.find(
    (repository) => repository.repositoryId === trimmedReference,
  );
  if (repositoryById) {
    return repositoryById;
  }

  const fullName = trimmedReference.toLowerCase();
  const matches = repositories.filter(
    (candidate) => candidate.githubRepositoryFullName.toLowerCase() === fullName,
  );
  if (exactly(1, matches)) {
    return matches[0];
  }
  if (matches.length === 0) {
    throw new ConvexError(
      `No Samebase repository matches ${trimmedReference}. Pass owner/name or a repositoryId from repository_list. To add an existing GitHub repository to Samebase, call repository_connect.`,
    );
  }
  throw new ConvexError(
    `Several Samebase repositories match ${trimmedReference}: ${formatNames(matches.map((candidate) => candidate.repositoryId))}. Pass one repositoryId from repository_list.`,
  );
}

export function findAttachedWorkerByName(
  repository: UserRepositoryResult,
  workerName: string,
): UserRepositoryResult["cloudflareWorkers"][number] {
  const worker = repository.cloudflareWorkers.find(
    (candidate) => candidate.workerName === workerName.trim(),
  );
  if (!worker) {
    throw new ConvexError(
      `Cloudflare Worker ${workerName} is not attached to ${repository.githubRepositoryFullName}. Attached Workers: ${formatNames(repository.cloudflareWorkers.map((candidate) => candidate.workerName))}. To add a Worker, call repository_cloudflare_findWorkers.`,
    );
  }
  return worker;
}

/**
The managed plan that created GitHub and Convex without a Workers Builds token. It names the Worker
and root directory that finish the first Cloudflare setup, and the planned Convex project that the
new Worker deploys with. Null when the plan selected a token, its Convex project is not attached, or
a Worker is already attached.
*/
export function readPendingCloudflareSetup(
  repository: Pick<UserRepositoryResult, "providerPlan" | "cloudflareWorkers" | "convexProjects">,
) {
  const plan = repository.providerPlan;
  if (
    !isSamebaseManagedProviderPlan(plan) ||
    plan.cloudflare.state !== "planned" ||
    plan.cloudflare.buildTokenUuid !== null ||
    plan.convex.state !== "created" ||
    repository.cloudflareWorkers.length > 0
  ) {
    return null;
  }

  const plannedProjectId = plan.convex.projectId;
  const plannedTeamId = plan.convex.teamId;
  const project = repository.convexProjects.find(
    (attachment) =>
      attachment.projectId === plannedProjectId &&
      attachment.teamId === plannedTeamId &&
      attachment.codeLocation.kind === "config" &&
      attachment.codeLocation.convexConfigPath === plan.convexConfigPath,
  );
  if (!project) {
    return null;
  }
  return {
    workerName: plan.cloudflare.workerName,
    rootDirectory: plan.cloudflare.rootDirectory,
    convexProjectId: project.convexProjectId,
  };
}

/**
The server's Workers Builds token choice: the given UUID, else the available last-used token, else
the only token. Several tokens without a last-used one need the user's choice. `none` means that
the Cloudflare account has no token yet.
*/
export function selectWorkersBuildsToken(
  buildTokens: CloudflareWorkersBuildTokens,
  requestedUuid: string | undefined,
): { state: "selected"; uuid: string } | { state: "none" } {
  const listedTokens = buildTokens.tokens.map((token) => `${token.name} (${token.uuid})`);
  if (requestedUuid !== undefined) {
    const uuid = requestedUuid.trim();
    if (!buildTokens.tokens.some((token) => token.uuid === uuid)) {
      throw new ConvexError(
        `Workers Builds token ${uuid} is not in the Cloudflare account's current token list. Current tokens: ${formatNames(listedTokens)}. Omit buildTokenUuid to let Samebase choose, or pass one of these UUIDs.`,
      );
    }
    return { state: "selected", uuid };
  }
  if (buildTokens.lastUsedBuildTokenUuid !== null) {
    return { state: "selected", uuid: buildTokens.lastUsedBuildTokenUuid };
  }

  if (buildTokens.tokens.length === 0) {
    return { state: "none" };
  }
  if (!exactly(1, buildTokens.tokens)) {
    throw new ConvexError(
      `The Cloudflare account has several Workers Builds tokens and none was used last: ${formatNames(listedTokens)}. Ask the user which token to use, then pass its UUID as buildTokenUuid.`,
    );
  }
  return { state: "selected", uuid: buildTokens.tokens[0].uuid };
}

export const CLOUDFLARE_SETUP_GUIDE_URL = "https://samebase.com/docs/cloudflare-setup";

export function requireSelectedWorkersBuildsToken(
  selection: ReturnType<typeof selectWorkersBuildsToken>,
): string {
  if (selection.state === "none") {
    throw new ConvexError(
      `The Cloudflare account has no Workers Builds token yet. Follow ${CLOUDFLARE_SETUP_GUIDE_URL} to create the first token, then retry.`,
    );
  }
  return selection.uuid;
}

function trimDirectorySlash(path: string): string {
  return path.trim().replace(/\/+$/, "");
}

/**
The `codeLocation` argument is a discovered path: a convex.json path, or a convex/ directory. One
discovered location is used without asking only when GitHub returned the whole file tree; a partial
tree can hide another location.
*/
export function selectConvexCodeLocation<Location extends ConvexCodeLocation>(args: {
  repositoryFullName: string;
  locations: Location[];
  completeness: ConvexProjectDiscoveryResult["source"]["completeness"];
  requestedPath: string | undefined;
}): Location {
  const paths = args.locations.map(getConvexCodeLocationPath);
  if (args.requestedPath !== undefined) {
    const requestedPath = trimDirectorySlash(args.requestedPath);
    const location = args.locations.find(
      (candidate) => trimDirectorySlash(getConvexCodeLocationPath(candidate)) === requestedPath,
    );
    if (!location) {
      throw new ConvexError(
        `Convex code location ${args.requestedPath} was not found on the default branch of ${args.repositoryFullName}. Found: ${formatNames(paths)}.`,
      );
    }
    return location;
  }

  if (args.locations.length === 0) {
    throw new ConvexError(
      `No Convex code location was found on the default branch of ${args.repositoryFullName}. Add a convex.json file, or a convex/ directory next to package.json, push it, then retry.`,
    );
  }
  if (args.completeness === "partial") {
    throw new ConvexError(
      `GitHub returned only part of the file tree of ${args.repositoryFullName}, so another Convex code location can be missing. Visible: ${formatNames(paths)}. Ask the user which one to use, then pass it as codeLocation.`,
    );
  }
  if (!exactly(1, args.locations)) {
    throw new ConvexError(
      `${args.repositoryFullName} has several Convex code locations: ${formatNames(paths)}. Ask the user which one to use, then pass it as codeLocation.`,
    );
  }
  return args.locations[0];
}

/**
The MCP discovery rule: rows only for Workers that a tool can add, and a count for each other
status. The dashboard keeps every row because its create form rejects every existing name.
*/
export function projectWorkerDiscoveryForMcp(discovery: CloudflareWorkerDiscoveryResult) {
  const counts = { attached: 0, attachedElsewhere: 0, connectedElsewhere: 0, unavailable: 0 };
  const workers: Array<
    | { attachment: "attachable"; workerName: string; rootDirectory: string }
    | { attachment: "connectable"; workerName: string }
  > = [];
  for (const worker of discovery.workers) {
    switch (worker.attachment) {
      case "attachable":
        workers.push({
          attachment: worker.attachment,
          workerName: worker.workerName,
          rootDirectory: worker.rootDirectory,
        });
        break;
      case "connectable":
        workers.push({ attachment: worker.attachment, workerName: worker.workerName });
        break;
      case "attached":
        counts.attached += 1;
        break;
      case "attached_elsewhere":
        counts.attachedElsewhere += 1;
        break;
      case "connected_elsewhere":
        counts.connectedElsewhere += 1;
        break;
      case "unavailable":
        counts.unavailable += 1;
        break;
      default:
        worker satisfies never;
    }
  }
  return { inventoryState: discovery.inventoryState, workers, counts };
}

/** The MCP discovery rule for Convex: attachable rows, counts for the rest, and code locations. */
export function projectConvexDiscoveryForMcp(discovery: ConvexProjectDiscoveryResult) {
  const counts = { attached: 0, attachedElsewhere: 0 };
  const projects: Array<{
    projectSlug: string;
    projectName: string;
    productionDeployment: ConvexProjectDiscoveryResult["projects"][number]["productionDeployment"];
  }> = [];
  for (const project of discovery.projects) {
    switch (project.attachment) {
      case "attachable":
        projects.push({
          projectSlug: project.projectSlug,
          projectName: project.projectName,
          productionDeployment: project.productionDeployment,
        });
        break;
      case "attached":
        counts.attached += 1;
        break;
      case "attached_elsewhere":
        counts.attachedElsewhere += 1;
        break;
      default:
        project.attachment satisfies never;
    }
  }
  return {
    codeLocations: {
      completeness: discovery.source.completeness,
      paths: discovery.source.locations.map(getConvexCodeLocationPath),
    },
    projects,
    counts,
  };
}
