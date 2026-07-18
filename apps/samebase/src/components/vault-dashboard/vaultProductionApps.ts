import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type VaultDashboardVault = NonNullable<
  (typeof api.vault.dashboard.getUserVaults)["_returnType"]
>[number];

export type VaultBranchProductionLinkProvider = "cloudflare" | "convex";

export type VaultBranchProductionLink = {
  href: string;
  label: string;
  provider: VaultBranchProductionLinkProvider;
  title: string;
};

export type VaultBranchProductionApp = {
  appId: Id<"vaultApps">;
  links: readonly VaultBranchProductionLink[];
  rootDirectory: string;
};

type VaultBranchProductionLinkInput = {
  appId: Id<"vaultApps">;
  href: string;
  label: string;
  provider: VaultBranchProductionLinkProvider;
  sortKey: string;
  title: string;
};

function buildVaultBranchProductionApps(
  apps: VaultDashboardVault["apps"],
  links: VaultBranchProductionLinkInput[],
): VaultBranchProductionApp[] {
  const linksByAppId = new Map<Id<"vaultApps">, VaultBranchProductionLinkInput[]>();

  for (const link of links) {
    linksByAppId.set(link.appId, [...(linksByAppId.get(link.appId) ?? []), link]);
  }

  return [...apps]
    .sort((left, right) => {
      const leftRootOrder = left.rootDirectory === "/" ? 0 : 1;
      const rightRootOrder = right.rootDirectory === "/" ? 0 : 1;
      return (
        leftRootOrder - rightRootOrder ||
        left.rootDirectory.localeCompare(right.rootDirectory) ||
        left.appId.localeCompare(right.appId)
      );
    })
    .flatMap((app) => {
      const appLinks = linksByAppId.get(app.appId);
      return appLinks
        ? [
            {
              appId: app.appId,
              rootDirectory: app.rootDirectory,
              links: [...appLinks]
                .sort(
                  (left, right) =>
                    left.provider.localeCompare(right.provider) ||
                    left.sortKey.localeCompare(right.sortKey) ||
                    left.href.localeCompare(right.href),
                )
                .map((link) => ({
                  href: link.href,
                  label: link.label,
                  provider: link.provider,
                  title: link.title,
                })),
            },
          ]
        : [];
    });
}

function buildVaultBranchProductionUrlLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "");
  }
}

export function buildVaultProductionApps(vault: VaultDashboardVault): VaultBranchProductionApp[] {
  const appsById = new Map(vault.apps.map((app) => [app.appId, app]));
  const cloudflareLinks: VaultBranchProductionLinkInput[] = vault.cloudflareWorkers.flatMap(
    (worker) => {
      if (worker.upstream.state !== "present" || worker.workersDev.state !== "available") {
        return [];
      }
      const app = appsById.get(worker.appId);
      if (!app) {
        throw new Error("Cloudflare Worker references an unknown app.");
      }
      return [
        {
          appId: worker.appId,
          href: worker.workersDev.url,
          label: buildVaultBranchProductionUrlLabel(worker.workersDev.url),
          provider: "cloudflare",
          sortKey: worker.workerName,
          title:
            app.rootDirectory === "/"
              ? "Open production app"
              : `Open production app for ${app.rootDirectory}`,
        },
      ];
    },
  );
  const convexLinks: VaultBranchProductionLinkInput[] = vault.convexDeployments.flatMap(
    (deployment) => {
      if (deployment.upstream.state !== "present" || !deployment.deploymentDashboardUrl) {
        return [];
      }
      if (!appsById.has(deployment.appId)) {
        throw new Error("Convex deployment references an unknown app.");
      }
      return [
        {
          appId: deployment.appId,
          href: deployment.deploymentDashboardUrl,
          label: `Production: ${deployment.deploymentName}`,
          provider: "convex",
          sortKey: deployment.deploymentName,
          title: `Open production Convex deployment ${deployment.deploymentName}`,
        },
      ];
    },
  );

  return buildVaultBranchProductionApps(vault.apps, [...cloudflareLinks, ...convexLinks]);
}
