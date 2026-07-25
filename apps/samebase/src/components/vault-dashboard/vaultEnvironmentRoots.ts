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

export type VaultEnvironmentWorker = {
  workerName: string;
  build:
    | { state: "available"; buildState: VaultEnvironmentBuildState; logsUrl: string }
    | { state: "absent" }
    | { state: "unavailable" };
  destination:
    | { state: "available"; href: string; label: string; title: string }
    | { state: "absent" };
  actions: readonly VaultEnvironmentAction[];
};

type VaultEnvironmentBuildState = Extract<
  PullRequestWorkerResource,
  { state: "available" }
>["cloudflareBuild"]["state"];

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
      kind: "cloudflare_worker";
      id: Id<"vaultCloudflareWorkers">;
      worker: VaultEnvironmentWorker;
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
  const destinations = productionRoots.flatMap((root) => {
    const cloudflareWorkerIds = new Set(
      root.links.flatMap((link) => (link.provider === "cloudflare" ? [link.workerId] : [])),
    );
    const cloudflareWorkers = [...cloudflareWorkerIds].flatMap((workerId) => {
      const links = root.links.flatMap((link) =>
        link.provider === "cloudflare" && link.workerId === workerId ? [link] : [],
      );
      const primary = links.at(0);
      if (!primary) {
        return [];
      }

      return [
        {
          rootDirectory: root.rootDirectory,
          sortKey: `0:${primary.workerName}:${primary.workerId}`,
          resource: {
            kind: "cloudflare_worker" as const,
            id: primary.workerId,
            worker: {
              workerName: primary.workerName,
              build: primary.build,
              destination: {
                state: "available" as const,
                href: primary.href,
                label: primary.label,
                title: primary.title,
              },
              actions: links.slice(1).map((link) => ({
                destination: "external" as const,
                href: link.href,
                label: link.label,
              })),
            },
          },
        },
      ];
    });
    const convexDeployments = root.links.flatMap((link) =>
      link.provider === "convex"
        ? [
            {
              rootDirectory: root.rootDirectory,
              sortKey: `1:${link.label}:${link.href}`,
              resource: {
                kind: "destination" as const,
                id: `${link.provider}:${link.href}`,
                actions: [
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
                ],
                href: link.href,
                label: link.label,
                provider: link.provider,
                title: link.title,
              },
            },
          ]
        : [],
    );

    return [...cloudflareWorkers, ...convexDeployments];
  });
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
        kind: "cloudflare_worker" as const,
        id: worker.workerId,
        worker:
          worker.state === "available"
            ? {
                workerName: worker.workerName,
                build: {
                  state: "available" as const,
                  buildState: worker.cloudflareBuild.state,
                  logsUrl: worker.cloudflareBuild.logsUrl,
                },
                destination:
                  worker.cloudflareBranchPreview.state === "available"
                    ? {
                        state: "available" as const,
                        href: worker.cloudflareBranchPreview.url,
                        label: "Branch preview",
                        title: new URL(worker.cloudflareBranchPreview.url).hostname,
                      }
                    : { state: "absent" as const },
                actions: [],
              }
            : {
                workerName: worker.workerName,
                build:
                  worker.state === "absent"
                    ? { state: "absent" as const }
                    : { state: "unavailable" as const },
                destination: { state: "absent" as const },
                actions: [],
              },
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
