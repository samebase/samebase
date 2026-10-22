import type { api } from "../../../convex/_generated/api";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import type { AccessKey } from "../../../shared/accessModel";
import type { RepositoryPullRequestsState } from "@/repository/dashboard/useRepositoryPullRequests";
import type { RepositorySidebarSummariesState } from "@/repository/dashboard/useRepositorySidebarSummaries";
import type { RepositoryEnvironmentRoot } from "./repositoryEnvironmentRoots";
import type {
  RepositoryAlchemyStacks,
  RepositoryCloudflareProviderObservationState,
  RepositoryConvexProjectObservation,
  RepositoryProviderObservationState,
} from "./useRepositoryProviderObservations";

export type RepositoryFolderState =
  (typeof api.repository.folders.getRepositoryFolderState)["_returnType"];

export type RepositoryOrganization =
  (typeof api.organizations.listForViewer)["_returnType"][number];

export type RepositoryOrganizationTreeSettings =
  (typeof api.repository.organizationTree.getRepositoryOrganizationTreeSettings)["_returnType"];

export type RepositoryWorkspaceAccessState =
  | { state: "loading" }
  | { state: "ready"; accessKeys: readonly AccessKey[] };

export type RepositoryWorkspaceCloudflareConnectionState =
  | { state: "loading" }
  | {
      state: "ready";
      connection: (typeof api.users.getCloudflareConnectionStatus)["_returnType"];
    };

export type RepositoryWorkspaceSelected = {
  access: RepositoryWorkspaceAccessState;
  /** One observation when the team store holds the stack of the repository: it then owns `environmentRoots`. */
  alchemyObservations: RepositoryProviderObservationState<RepositoryAlchemyStacks>;
  cloudflareObservations: RepositoryCloudflareProviderObservationState;
  cloudflareConnection: RepositoryWorkspaceCloudflareConnectionState;
  convexObservations: RepositoryProviderObservationState<RepositoryConvexProjectObservation>;
  environmentRoots: readonly RepositoryEnvironmentRoot[];
  githubRepositoryUrl: string;
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
