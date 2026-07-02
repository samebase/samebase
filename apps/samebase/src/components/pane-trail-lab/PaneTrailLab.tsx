import { Link, useLocation } from "@tanstack/react-router";
import { useAction, useQuery as useConvexQuery } from "convex/react";
import { FileText, FolderTree, GitBranch, Home, Library } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import { AppRightSidebarContent } from "@/components/AppRightSidebar";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { CodeMirrorFileSurface } from "@/components/CodeMirrorFileSurface";
import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";
import { WorkspaceLayoutV3FullPage } from "@/components/workspace-layout-v3/WorkspaceLayoutV3FullPage";
import { type WorkspaceLayoutV3Pane } from "@/components/workspace-layout-v3/WorkspaceLayoutV3";
import { getCodeMirrorFileLanguageKind } from "@/lib/codemirrorLanguage";
import { useCacheQuery } from "@/lib/convexQueryCache";
import { cn } from "@/lib/utils";
import { decodeRouteSegmentSafe } from "@/lib/vaultRoutes";

const V3_ROUTE = "/v3";

/**
 * /v3 path segments form the trail: /v3/<owner>/<repo>/<branch>/<file path>.
 * The branch is one encoded segment (branch names may contain slashes), the
 * same convention the /vault routes use.
 */
type PaneTrailLabPath = {
  owner: string | null;
  repoName: string | null;
  branch: string | null;
  filePath: string | null;
};

function parsePaneTrailLabPath(pathname: string): PaneTrailLabPath {
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  const owner = segments.length > 1 ? decodeRouteSegmentSafe(segments[1]) : null;
  const repoName = segments.length > 2 ? decodeRouteSegmentSafe(segments[2]) : null;
  const branch = segments.length > 3 ? decodeRouteSegmentSafe(segments[3]) : null;
  const fileSegments = segments.slice(4).map((segment) => decodeRouteSegmentSafe(segment));
  return {
    owner,
    repoName,
    branch,
    filePath: fileSegments.length > 0 ? fileSegments.join("/") : null,
  };
}

function buildPaneTrailLabRoute(args: {
  owner: string;
  repoName: string;
  branch?: string;
  filePath?: string;
}): string {
  const segments = [V3_ROUTE, encodeURIComponent(args.owner), encodeURIComponent(args.repoName)];
  if (args.branch !== undefined) {
    segments.push(encodeURIComponent(args.branch));
    if (args.filePath !== undefined) {
      segments.push(...args.filePath.split("/").map((segment) => encodeURIComponent(segment)));
    }
  }
  return segments.join("/");
}

function PaneTrailLabRow({
  to,
  selected,
  label,
  sublabel,
}: {
  to: string;
  selected: boolean;
  label: string;
  sublabel?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "block border-b border-border px-3 py-1.5 text-[13px]",
        selected ? "bg-muted font-medium" : "hover:bg-muted/50",
      )}
    >
      <span className="block truncate">{label}</span>
      {sublabel !== undefined ? (
        <span className="block truncate text-[11px] font-normal text-muted-foreground">
          {sublabel}
        </span>
      ) : null}
    </Link>
  );
}

function PaneTrailLabNote({ children }: { children: ReactNode }) {
  return <div className="px-3 py-2 text-[13px] text-muted-foreground">{children}</div>;
}

/**
 * Read-only file body: fetch once per file through the staging action, then
 * render with the same surfaces the editor routes use. Editing is out of
 * scope until the trail layout earns it.
 */
function PaneTrailLabFileContent({
  repositoryFullName,
  branch,
  filePath,
}: {
  repositoryFullName: string;
  branch: string;
  filePath: string;
}) {
  const getFileForEditing = useAction(api.fileStagingActions.getFileForEditing);
  const fileKey = `${repositoryFullName}@${branch}:${filePath}`;
  const [loadedFile, setLoadedFile] = useState<{ key: string; content: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // The file body comes from an action (GitHub fetch + staging cache), so a
  // route param change is the only trigger; there is no subscription to hold.
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    getFileForEditing({ repositoryFullName, originalFilePath: filePath, branch })
      .then((fileState) => {
        if (!cancelled) {
          setLoadedFile({ key: fileKey, content: fileState.content });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Failed to load file.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [branch, fileKey, filePath, getFileForEditing, repositoryFullName]);

  if (loadError !== null) {
    return <PaneTrailLabNote>{loadError}</PaneTrailLabNote>;
  }
  if (loadedFile === null || loadedFile.key !== fileKey) {
    return null;
  }
  if (getCodeMirrorFileLanguageKind(filePath) === "code") {
    return (
      <CodeMirrorFileSurface
        dataTestId="pane-trail-lab-code-surface"
        filePath={filePath}
        initialValue={loadedFile.content}
      />
    );
  }
  return <ProsemarkReadOnly filePath={filePath} value={loadedFile.content} />;
}

function PaneTrailLab() {
  const location = useLocation();
  const { owner, repoName, branch, filePath } = parsePaneTrailLabPath(location.pathname);
  const repositoryFullName = owner !== null && repoName !== null ? `${owner}/${repoName}` : null;

  const vaults = useCacheQuery(api.vault.dashboard.getUserVaults);
  const selectedVault =
    repositoryFullName !== null
      ? vaults?.find((vault) => vault.repositoryFullName === repositoryFullName)
      : undefined;

  const vaultRecord = useConvexQuery(
    api.vault.records.getVaultByRepository,
    repositoryFullName !== null && branch !== null ? { repositoryFullName, branch } : "skip",
  );

  const panes: WorkspaceLayoutV3Pane[] = [
    {
      id: "nav",
      title: "Samebase",
      icon: <Home className="h-4 w-4" />,
      content: <AppRightSidebarContent />,
    },
    {
      id: "vaults",
      title: "Vaults",
      icon: <Library className="h-4 w-4" />,
      content:
        vaults === undefined ? null : (
          <div>
            {vaults.map((vault) => (
              <PaneTrailLabRow
                key={vault._id}
                to={buildPaneTrailLabRoute({
                  owner: vault.ghRepoOwner,
                  repoName: vault.ghRepoName,
                })}
                selected={vault.repositoryFullName === repositoryFullName}
                label={vault.repositoryFullName}
                sublabel={vault.state === "ready" ? undefined : vault.state}
              />
            ))}
            {vaults.length === 0 ? <PaneTrailLabNote>No vaults yet.</PaneTrailLabNote> : null}
          </div>
        ),
    },
  ];

  if (owner !== null && repoName !== null) {
    panes.push({
      id: "branches",
      title: repoName,
      icon: <GitBranch className="h-4 w-4" />,
      content:
        selectedVault === undefined ? (
          vaults === undefined ? null : (
            <PaneTrailLabNote>
              No vault for {owner}/{repoName}.
            </PaneTrailLabNote>
          )
        ) : (
          <div>
            {selectedVault.remoteBranches
              .filter((remoteBranch) => remoteBranch.remoteState === "active")
              .map((remoteBranch) => (
                <PaneTrailLabRow
                  key={remoteBranch.name}
                  to={buildPaneTrailLabRoute({
                    owner,
                    repoName,
                    branch: remoteBranch.name,
                  })}
                  selected={remoteBranch.name === branch}
                  label={remoteBranch.name}
                  sublabel={remoteBranch.isDefault ? "default" : undefined}
                />
              ))}
          </div>
        ),
    });
  }

  if (owner !== null && repoName !== null && branch !== null) {
    const blobs =
      vaultRecord?.treeData?.tree
        .filter((node) => node.type === "blob")
        .sort((left, right) => left.path.localeCompare(right.path)) ?? [];
    panes.push({
      id: "files",
      title: branch,
      icon: <FolderTree className="h-4 w-4" />,
      content:
        vaultRecord === undefined ? null : vaultRecord === null ? (
          <PaneTrailLabNote>Branch not found.</PaneTrailLabNote>
        ) : (
          <div>
            {blobs.map((blob) => (
              <PaneTrailLabRow
                key={blob.path}
                to={buildPaneTrailLabRoute({
                  owner,
                  repoName,
                  branch,
                  filePath: blob.path,
                })}
                selected={blob.path === filePath}
                label={blob.path}
              />
            ))}
          </div>
        ),
    });
  }

  if (
    owner !== null &&
    repoName !== null &&
    branch !== null &&
    filePath !== null &&
    repositoryFullName !== null
  ) {
    const fileName = filePath.split("/").pop() ?? filePath;
    panes.push({
      id: "file",
      title: fileName,
      icon: <FileText className="h-4 w-4" />,
      content: (
        <PaneTrailLabFileContent
          repositoryFullName={repositoryFullName}
          branch={branch}
          filePath={filePath}
        />
      ),
    });
  }

  return (
    <WorkspaceLayoutV3FullPage
      dataTestId="pane-trail-lab"
      storageKey="workspace-layout-v3:lab"
      panes={panes}
    />
  );
}

export function PaneTrailLabRoutePage() {
  return (
    <AppWorkspaceRouteChrome
      dataTestId="pane-trail-lab-shell"
      left={null}
      leftToggleVisibility="hidden"
      right={null}
    >
      <PaneTrailLab />
    </AppWorkspaceRouteChrome>
  );
}
