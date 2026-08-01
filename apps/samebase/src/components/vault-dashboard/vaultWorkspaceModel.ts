import type { api } from "../../../convex/_generated/api";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import type { AccessKey } from "../../../shared/accessModel";
import type { VaultPullRequestsState } from "@/hooks/useVaultPullRequests";
import type { VaultSidebarSummariesState } from "@/hooks/useVaultSidebarSummaries";
import type { VaultEnvironmentRoot } from "./vaultEnvironmentRoots";
import type {
  VaultCloudflareProviderObservationState,
  VaultConvexProjectObservation,
  VaultProviderObservationState,
} from "./useVaultProviderObservations";
import type { VaultFolderState } from "./VaultOverviewSidebar";

export type VaultWorkspaceAccessState =
  | { state: "loading" }
  | { state: "ready"; accessKeys: readonly AccessKey[] };

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
  environmentRoots: readonly VaultEnvironmentRoot[];
  githubRepositoryUrl: string;
  pullRequests: VaultPullRequestsState;
  vault: UserVaultResult;
};

export type VaultWorkspaceSelection =
  | { state: "root" }
  | { state: "missing"; repositoryFullName: string }
  | { state: "selected"; workspace: VaultWorkspaceSelected };

export type VaultWorkspaceModel =
  | { state: "loading" }
  | {
      state: "ready";
      sidebarSummaries: VaultSidebarSummariesState;
      folderState: VaultFolderState;
      selection: VaultWorkspaceSelection;
      vaults: readonly UserVaultResult[];
    };
