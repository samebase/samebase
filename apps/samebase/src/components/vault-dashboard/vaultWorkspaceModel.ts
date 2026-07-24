import type { api } from "../../../convex/_generated/api";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import type { VaultPullRequestsState } from "@/hooks/useVaultPullRequests";
import type { VaultSidebarSummariesState } from "@/hooks/useVaultSidebarSummaries";
import type { VaultPullRequestFilters } from "./vaultDashboardPullRequestFilters";
import type { VaultProductionRoot } from "./vaultProductionRoots";
import type {
  VaultCloudflareProviderObservationState,
  VaultConvexProjectObservation,
  VaultProviderObservationState,
} from "./useVaultProviderObservations";

export type VaultWorkspaceAccessState =
  | { state: "loading" }
  | { state: "ready"; schemaGraphEnabled: boolean };

export type VaultWorkspaceCloudflareConnectionState =
  | { state: "loading" }
  | {
      state: "ready";
      connection: (typeof api.users.getCloudflareConnectionStatus)["_returnType"];
    };

export type VaultWorkspaceSelected = {
  access: VaultWorkspaceAccessState;
  cloudflareObservations: VaultCloudflareProviderObservationState;
  cloudflareConnection: VaultWorkspaceCloudflareConnectionState;
  convexObservations: VaultProviderObservationState<VaultConvexProjectObservation>;
  githubRepositoryUrl: string;
  productionRoots: readonly VaultProductionRoot[];
  pullRequestFilters: VaultPullRequestFilters;
  pullRequests: VaultPullRequestsState;
  vault: UserVaultResult;
};

export type VaultWorkspaceSelection =
  | { state: "root" }
  | { state: "missing"; repositoryFullName: string }
  | { state: "selected"; workspace: VaultWorkspaceSelected };

export type VaultWorkspaceModel =
  | {
      state: "loading";
      selectedRepositoryFullName: string | undefined;
    }
  | {
      state: "ready";
      sidebarSummaries: VaultSidebarSummariesState;
      selection: VaultWorkspaceSelection;
      vaults: readonly UserVaultResult[];
    };
