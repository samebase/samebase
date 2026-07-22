import { linkStyle } from "@/components/styles";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
  SamebaseLogoMark,
} from "@/components/vault-dashboard/VaultDashboardLogos";
import { buildVaultDatabaseRoute, buildVaultSchemaRoute } from "@/lib/vaultRoutes";
import type {
  VaultProductionLinkProvider,
  VaultProductionRoot,
} from "@/components/vault-dashboard/vaultProductionRoots";
import { Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { GitBranch } from "lucide-react";
import type { ReactNode } from "react";
import { getConvexConfigRootDirectory } from "../../../shared/convexConfigPath";

type VaultDefaultBranchConvexProject = {
  convexConfigPath: string;
  convexProjectId: string;
  projectId: string;
};

type VaultDefaultBranchProps = {
  convexProjects: readonly VaultDefaultBranchConvexProject[];
  defaultBranch: string;
  githubBranchUrl: string;
  owner: string;
  productionRoots: readonly VaultProductionRoot[];
  repoName: string;
  samebaseEditorUrl: string;
  schemaGraphAccessEnabled: boolean;
};

const productionLinkIcons = {
  cloudflare: CloudflareProviderLogo,
  convex: ConvexProviderLogo,
} satisfies Record<VaultProductionLinkProvider, () => ReactNode>;

const interactiveLinkClassName = clsx(
  "-mx-1.5 inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-sm px-1.5 underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current",
  linkStyle,
);

function ProductionLinks({ roots }: { roots: readonly VaultProductionRoot[] }) {
  if (roots.length === 0) {
    return null;
  }

  const showRootLabels = roots.length > 1 || roots.some((root) => root.rootDirectory !== "/");

  return (
    <div className="min-w-0 flex-1 basis-[19rem] space-y-1 text-sm leading-6">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Production
      </div>
      <div className="space-y-2">
        {roots.map((root) => (
          <div key={root.rootDirectory} className="min-w-0">
            {showRootLabels ? (
              <div className="mb-0.5 truncate font-mono text-xs text-muted-foreground">
                {root.rootDirectory === "/" ? "Repository root" : root.rootDirectory}
              </div>
            ) : null}
            <div className="space-y-0.5">
              {root.links.map((link) => {
                const Icon = productionLinkIcons[link.provider];
                return (
                  <a
                    key={`${link.provider}\n${link.href}`}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={clsx(interactiveLinkClassName, "font-mono")}
                    title={link.title}
                  >
                    <span className="inline-flex h-4 w-5 shrink-0 items-center justify-center">
                      <Icon />
                    </span>
                    <span className="min-w-0 break-all">{link.label}</span>
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The durable default branch is a product surface of its own. It deliberately
 * does not share pull-request row types or presentation.
 */
export function VaultDefaultBranch({
  convexProjects,
  defaultBranch,
  githubBranchUrl,
  owner,
  productionRoots,
  repoName,
  samebaseEditorUrl,
  schemaGraphAccessEnabled,
}: VaultDefaultBranchProps) {
  const convexLinks = [...convexProjects]
    .sort(
      (left, right) =>
        left.convexConfigPath.localeCompare(right.convexConfigPath) ||
        left.projectId.localeCompare(right.projectId) ||
        left.convexProjectId.localeCompare(right.convexProjectId),
    )
    .flatMap((project) => {
      const rootDirectory = getConvexConfigRootDirectory(project.convexConfigPath);
      const rootLabel = rootDirectory === "/" ? "" : `: ${rootDirectory}`;
      const rootTitle = rootDirectory === "/" ? "" : ` at ${rootDirectory}`;
      const links = [
        {
          href: buildVaultDatabaseRoute({
            owner,
            repoName,
            branch: defaultBranch,
            convexProjectId: project.convexProjectId,
          }),
          label: `Data${rootLabel}`,
          title: `Open production data for ${project.projectId}${rootTitle}`,
        },
      ];
      if (schemaGraphAccessEnabled) {
        links.push({
          href: buildVaultSchemaRoute({
            owner,
            repoName,
            branch: defaultBranch,
            convexProjectId: project.convexProjectId,
          }),
          label: `Schema${rootLabel}`,
          title: `Open Convex schema for ${project.projectId}${rootTitle}`,
        });
      }
      return links;
    });

  return (
    <section
      data-vault-default-branch=""
      aria-label={`Default branch ${defaultBranch}`}
      className="border-b border-border/40"
    >
      <div className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-3 px-3 py-3.5">
        <div className="min-w-0 flex-1 basis-[22rem] space-y-1">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Default branch
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <a
              href={githubBranchUrl}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`Open ${defaultBranch} branch on GitHub`}
              className={clsx(interactiveLinkClassName, "font-mono text-base font-medium")}
              title="Open default branch on GitHub"
            >
              <GitBranch aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span className="min-w-0 break-all">{defaultBranch}</span>
            </a>
            <Link
              to={samebaseEditorUrl}
              className={clsx(interactiveLinkClassName, "font-mono text-sm")}
              title={`Edit ${defaultBranch} in Samebase`}
            >
              <SamebaseLogoMark />
              <span>Edit</span>
            </Link>
            {convexLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={clsx(interactiveLinkClassName, "font-mono text-sm")}
                title={link.title}
              >
                <ConvexProviderLogo />
                <span>{link.label}</span>
              </Link>
            ))}
          </div>
        </div>
        <ProductionLinks roots={productionRoots} />
      </div>
    </section>
  );
}
