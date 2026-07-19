import type { api } from "../../../convex/_generated/api";

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
  appRoot: string;
  links: readonly VaultBranchProductionLink[];
};

type VaultBranchProductionLinkInput = {
  appRoot: string;
  href: string;
  label: string;
  provider: VaultBranchProductionLinkProvider;
  sortKey: string;
  title: string;
};

function buildVaultBranchProductionApps(
  links: VaultBranchProductionLinkInput[],
): VaultBranchProductionApp[] {
  const linksByAppRoot = new Map<string, VaultBranchProductionLinkInput[]>();

  for (const link of links) {
    linksByAppRoot.set(link.appRoot, [...(linksByAppRoot.get(link.appRoot) ?? []), link]);
  }

  return [...linksByAppRoot.entries()]
    .sort(([leftAppRoot], [rightAppRoot]) => leftAppRoot.localeCompare(rightAppRoot))
    .map(([appRoot, appLinks]) => ({
      appRoot,
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
    }));
}

function buildVaultBranchProductionUrlLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "");
  }
}

export function buildVaultProductionApps(vault: VaultDashboardVault): VaultBranchProductionApp[] {
  const cloudflareLinks: VaultBranchProductionLinkInput[] = vault.cloudflareWorkers.flatMap(
    (worker) => {
      if (worker.observation.state !== "available" || !worker.observation.workersDevUrl) {
        return [];
      }
      const workersDevUrl = worker.observation.workersDevUrl;
      return [
        {
          appRoot: worker.appRoot,
          href: workersDevUrl,
          label: buildVaultBranchProductionUrlLabel(workersDevUrl),
          provider: "cloudflare",
          sortKey: worker.workerName,
          title:
            worker.appRoot === "."
              ? "Open production app"
              : `Open production app for ${worker.appRoot}`,
        },
      ];
    },
  );
  const convexLinks: VaultBranchProductionLinkInput[] = vault.convexDeployments.flatMap(
    (deployment) => {
      if (
        deployment.observation.state !== "available" ||
        !deployment.observation.deploymentDashboardUrl
      ) {
        return [];
      }
      const deploymentDashboardUrl = deployment.observation.deploymentDashboardUrl;
      return [
        {
          appRoot: deployment.appRoot,
          href: deploymentDashboardUrl,
          label: `Production: ${deployment.deploymentName}`,
          provider: "convex",
          sortKey: deployment.deploymentName,
          title: `Open production Convex deployment ${deployment.deploymentName}`,
        },
      ];
    },
  );

  return buildVaultBranchProductionApps([...cloudflareLinks, ...convexLinks]);
}
