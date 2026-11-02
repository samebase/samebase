import type { api } from "../../../convex/_generated/api";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import type { AccessKey } from "../../../shared/accessModel";
import type { RepositoryPullRequestsState } from "@/repository/dashboard/useRepositoryPullRequests";
import type { RepositorySidebarSummariesState } from "@/repository/dashboard/useRepositorySidebarSummaries";
import type { RepositoryStackCard } from "./repositoryEnvironmentRoots";
import type { RepositoryAlchemyState } from "./useRepositoryAlchemyState";

export type RepositoryFolderState =
  (typeof api.repository.folders.getRepositoryFolderState)["_returnType"];

export type RepositoryOrganization =
  (typeof api.organizations.listForViewer)["_returnType"][number];

export type RepositoryOrganizationTreeSettings =
  (typeof api.repository.organizationTree.getRepositoryOrganizationTreeSettings)["_returnType"];

export type RepositoryWorkspaceAccessState =
  | { state: "loading" }
  | { state: "ready"; accessKeys: readonly AccessKey[] };

export type RepositoryWorkspaceSelected = {
  access: RepositoryWorkspaceAccessState;
  /** The read of the team store, which says why `productionCards` is empty. */
  alchemyState: RepositoryAlchemyState;
  githubRepositoryUrl: string;
  /** One card for each stack of the repository in the team store with a `prod` stage. */
  productionCards: readonly RepositoryStackCard[];
  pullRequests: RepositoryPullRequestsState;
  repository: UserRepositoryResult;
};

export type RepositoryWorkspaceSelection =
  | { state: "root" }
  | { state: "missing"; githubRepositoryFullName: string }
  | { state: "selected"; workspace: RepositoryWorkspaceSelected };

export type RepositoryWorkspaceModel =
  | { state: "loading" }
  | {
      state: "ready";
      folderState: RepositoryFolderState;
      organizationTreeSettings: RepositoryOrganizationTreeSettings;
      sidebarSummaries: RepositorySidebarSummariesState;
      organizations: readonly RepositoryOrganization[];
      selection: RepositoryWorkspaceSelection;
      repositories: readonly UserRepositoryResult[];
    };
