import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect, useRef, type ReactNode } from "react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export type VaultRouteIdentity =
  | {
      state: "missing";
      activeVaultId?: Id<"vaults">;
    }
  | {
      state: "selected";
      owner: string;
      repoName: string;
      repositoryFullName: string;
      vaultId: Id<"vaults">;
    };

function replaceVaultRepositoryPath(
  pathname: string,
  owner: string,
  repoName: string,
): string | null {
  const segments = pathname.split("/");
  if (segments[0] !== "" || segments[1] !== "vault" || segments.length < 4) {
    return null;
  }

  return [
    "",
    "vault",
    encodeURIComponent(owner),
    encodeURIComponent(repoName),
    ...segments.slice(4),
  ].join("/");
}

export function VaultRouteIdentityBoundary({
  children,
  owner,
  repoName,
}: {
  children: (identity: VaultRouteIdentity) => ReactNode;
  owner: string;
  repoName: string;
}) {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const vaults = useQuery(api.vault.dashboard.getUserVaults);
  const requestedRepositoryFullName = `${owner}/${repoName}`;
  const activeRouteRef = useRef<{
    requestedRepositoryFullName: string;
    vaultId: Id<"vaults">;
  } | null>(null);
  const activeRoute =
    activeRouteRef.current?.requestedRepositoryFullName === requestedRepositoryFullName
      ? activeRouteRef.current
      : null;
  const vault =
    vaults === undefined
      ? null
      : activeRoute === null
        ? (vaults.find(
            (candidate) => candidate.repositoryFullName === requestedRepositoryFullName,
          ) ?? null)
        : (vaults.find((candidate) => candidate._id === activeRoute.vaultId) ?? null);
  const renamedPath =
    activeRoute !== null &&
    vault !== null &&
    vault.repositoryFullName !== requestedRepositoryFullName
      ? replaceVaultRepositoryPath(pathname, vault.ghRepoOwner, vault.ghRepoName)
      : null;

  useEffect(() => {
    if (vaults === undefined || activeRoute !== null) {
      return;
    }
    activeRouteRef.current =
      vault === null
        ? null
        : {
            requestedRepositoryFullName,
            vaultId: vault._id,
          };
  }, [activeRoute, requestedRepositoryFullName, vault, vaults]);

  useEffect(() => {
    if (renamedPath === null) {
      return;
    }
    void navigate({
      hash: true,
      replace: true,
      resetScroll: false,
      search: (currentSearch) => currentSearch,
      to: renamedPath,
    });
  }, [navigate, renamedPath]);

  if (vaults === undefined) {
    return null;
  }

  if (vault === null) {
    if (activeRoute === null) {
      return children({ state: "missing" });
    }

    return children({
      state: "missing",
      activeVaultId: activeRoute.vaultId,
    });
  }

  return children({
    state: "selected",
    owner: vault.ghRepoOwner,
    repoName: vault.ghRepoName,
    repositoryFullName: vault.repositoryFullName,
    vaultId: vault._id,
  });
}
