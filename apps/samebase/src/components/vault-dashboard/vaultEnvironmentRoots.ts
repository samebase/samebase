import type { Id } from "../../../convex/_generated/dataModel";
import type {
  PullRequestResources,
  PullRequestWorkerResource,
} from "../../../convex/vault/pullRequestResources";
import {
  getConvexCodeRootDirectory,
  type ConvexCodeLocation,
} from "../../../shared/convexCodeLocation";
import { buildVaultDatabaseRoute, buildVaultSchemaRoute } from "@/lib/vaultRoutes";
import type { VaultProductionRoot } from "./vaultProductionRoots";

export type VaultEnvironmentAction =
  | { destination: "external"; href: string; label: string }
  | { destination: "samebase"; href: string; label: string };

export type VaultEnvironmentResource =
  | {
      kind: "destination";
      id: string;
      actions: readonly VaultEnvironmentAction[];
      href: string;
      label: string;
      provider: "cloudflare" | "convex";
      title: string;
    }
  | {
      kind: "convex_loading";
      id: Id<"vaultConvexProjects">;
    }
  | {
      kind: "pull_request_worker";
      id: Id<"vaultCloudflareWorkers">;
      worker: PullRequestWorkerResource;
    };

export type VaultEnvironmentRoot = {
  rootDirectory: string;
  resources: readonly VaultEnvironmentResource[];
};

type VaultEnvironmentResourceInput = {
  resource: VaultEnvironmentResource;
  rootDirectory: string;
  sortKey: string;
};

function groupVaultEnvironmentResources(
  inputs: readonly VaultEnvironmentResourceInput[],
): VaultEnvironmentRoot[] {
  const inputsByRoot = new Map<string, VaultEnvironmentResourceInput[]>();

  for (const input of inputs) {
    inputsByRoot.set(input.rootDirectory, [
      ...(inputsByRoot.get(input.rootDirectory) ?? []),
      input,
    ]);
  }

  return [...inputsByRoot.entries()]
    .sort(([leftRoot], [rightRoot]) => {
      if (leftRoot === rightRoot) {
        return 0;
      }
      if (leftRoot === "/") {
        return -1;
      }
      if (rightRoot === "/") {
        return 1;
      }
      return leftRoot.localeCompare(rightRoot);
    })
    .map(([rootDirectory, rootInputs]) => ({
      rootDirectory,
      resources: [...rootInputs]
        .sort(
          (left, right) =>
            left.sortKey.localeCompare(right.sortKey) ||
            left.resource.id.localeCompare(right.resource.id),
        )
        .map((input) => input.resource),
    }));
}

export function buildProductionEnvironmentRoots({
  branch,
  convexObservationState,
  convexProjects,
  owner,
  productionRoots,
  repoName,
  schemaGraphEnabled,
}: {
  branch: string;
  convexObservationState: "failed" | "loaded" | "loading";
  convexProjects: readonly {
    codeLocation: ConvexCodeLocation;
    convexProjectId: Id<"vaultConvexProjects">;
  }[];
  owner: string;
  productionRoots: readonly VaultProductionRoot[];
  repoName: string;
  schemaGraphEnabled: boolean;
}): VaultEnvironmentRoot[] {
  const destinations = productionRoots.flatMap((root) =>
    root.links.map((link) => ({
      rootDirectory: root.rootDirectory,
      sortKey: `${link.provider === "cloudflare" ? "0" : "1"}:${link.label}:${link.href}`,
      resource: {
        kind: "destination" as const,
        id: `${link.provider}:${link.href}`,
        actions:
          link.provider === "convex"
            ? [
                {
                  destination: "samebase" as const,
                  href: buildVaultDatabaseRoute({
                    owner,
                    repoName,
                    branch,
                    convexProjectId: link.convexProjectId,
                  }),
                  label: "Data",
                },
                ...(schemaGraphEnabled
                  ? [
                      {
                        destination: "samebase" as const,
                        href: buildVaultSchemaRoute({
                          owner,
                          repoName,
                          branch,
                          convexProjectId: link.convexProjectId,
                        }),
                        label: "Schema",
                      },
                    ]
                  : []),
              ]
            : [],
        href: link.href,
        label: link.label,
        provider: link.provider,
        title: link.title,
      },
    })),
  );
  const convexLoading =
    convexObservationState === "loading"
      ? convexProjects.map((project) => ({
          rootDirectory: getConvexCodeRootDirectory(project.codeLocation),
          sortKey: `1:${project.convexProjectId}`,
          resource: {
            kind: "convex_loading" as const,
            id: project.convexProjectId,
          },
        }))
      : [];

  return groupVaultEnvironmentResources([...destinations, ...convexLoading]);
}

export function buildPullRequestEnvironmentRoots(
  resources: PullRequestResources,
): VaultEnvironmentRoot[] {
  const inputs = resources.workers.flatMap((worker) => {
    const rootDirectory = worker.state === "unavailable" ? "Needs attention" : worker.rootDirectory;
    const workerInput = {
      rootDirectory,
      sortKey: `0:${worker.workerName}:${worker.workerId}`,
      resource: {
        kind: "pull_request_worker" as const,
        id: worker.workerId,
        worker,
      },
    };

    if (worker.state !== "available" || worker.convexPreview.state !== "available") {
      return [workerInput];
    }

    const preview = worker.convexPreview;
    return [
      workerInput,
      {
        rootDirectory,
        sortKey: `1:${preview.deploymentName}:${worker.workerId}`,
        resource: {
          kind: "destination" as const,
          id: `convex:${worker.workerId}`,
          actions: [
            {
              destination: "external" as const,
              href: `${preview.dashboardUrl}/data`,
              label: "Data",
            },
          ],
          href: preview.dashboardUrl,
          label: preview.deploymentName,
          provider: "convex" as const,
          title: `Open preview Convex deployment ${preview.deploymentName}`,
        },
      },
    ];
  });

  return groupVaultEnvironmentResources(inputs);
}
