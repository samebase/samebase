import type {
  FunctionArgs,
  FunctionReference,
  GenericActionCtx,
  GenericDataModel,
} from "convex/server";
import type { Octokit } from "@octokit/rest";
import type { ComponentApi } from "./component/_generated/component.js";
import type { FileBlob, StagedFile } from "./model.js";

type Staging = ComponentApi["staging"];
type HostScope<RepositoryId extends string, UserId extends string> = {
  repositoryId: RepositoryId;
  userId: UserId;
};
type AuthorizedArgs<Args, RepositoryId extends string, UserId extends string> = Omit<
  Args,
  "repositoryId" | "userId"
> &
  HostScope<RepositoryId, UserId>;

/**
 * These host mutations keep access checks in the same
 * transaction as each component write. The ID parameters preserve the host's
 * own repository and user ID types without teaching the package its schema.
 */
export type GitEditor<RepositoryId extends string, UserId extends string> = {
  ctx: Pick<GenericActionCtx<GenericDataModel>, "runQuery" | "runMutation">;
  component: ComponentApi;
  octokit: Octokit;
  userId: UserId;
  repository: {
    repositoryId: RepositoryId;
    githubOwnerLogin: string;
    githubRepositoryName: string;
    defaultBranch: string;
  };
  refreshBranch: (branch: string) => Promise<boolean>;
  host: {
    initializeBinaryFile: FunctionReference<
      "mutation",
      "internal",
      AuthorizedArgs<FunctionArgs<Staging["initializeBinaryFile"]>, RepositoryId, UserId>,
      StagedFile
    >;
    saveToStaging: FunctionReference<
      "mutation",
      "internal",
      AuthorizedArgs<FunctionArgs<Staging["saveToStaging"]>, RepositoryId, UserId>,
      StagedFile
    >;
    saveBinaryUploadToStaging: FunctionReference<
      "mutation",
      "internal",
      AuthorizedArgs<FunctionArgs<Staging["saveBinaryUploadToStaging"]>, RepositoryId, UserId>,
      StagedFile
    >;
    duplicateBranchStaging: FunctionReference<
      "mutation",
      "internal",
      AuthorizedArgs<FunctionArgs<Staging["duplicateBranchStaging"]>, RepositoryId, UserId>,
      null
    >;
    clearMatchingStagingSnapshot: FunctionReference<
      "mutation",
      "internal",
      Omit<FunctionArgs<Staging["clearMatchingStagingSnapshot"]>, "repositoryId"> & {
        repositoryId: RepositoryId;
      },
      null
    >;
    clearCommittedStaging: FunctionReference<
      "mutation",
      "internal",
      Omit<FunctionArgs<Staging["clearCommittedStaging"]>, "repositoryId"> & {
        repositoryId: RepositoryId;
      },
      null
    >;
    clearAllStagingForOperation: FunctionReference<
      "mutation",
      "internal",
      AuthorizedArgs<FunctionArgs<Staging["clearAllStaging"]>, RepositoryId, UserId> & {
        skipTreeUpdate?: boolean;
      },
      null
    >;
    reconcileStagingWithTree: FunctionReference<
      "mutation",
      "internal",
      AuthorizedArgs<FunctionArgs<Staging["reconcileStagingWithTree"]>, RepositoryId, UserId>,
      null
    >;
    createFileInStagingForOperation: FunctionReference<
      "mutation",
      "internal",
      AuthorizedArgs<FunctionArgs<Staging["createFileInStaging"]>, RepositoryId, UserId>,
      null
    >;
    rename: FunctionReference<
      "mutation",
      "internal",
      AuthorizedArgs<FunctionArgs<Staging["rename"]>, RepositoryId, UserId>,
      StagedFile
    >;
    pushContentUpdate: FunctionReference<
      "mutation",
      "internal",
      AuthorizedArgs<
        FunctionArgs<ComponentApi["collaborative"]["pushContentUpdate"]>,
        RepositoryId,
        UserId
      >,
      null
    >;
    saveFileBlob: FunctionReference<
      "mutation",
      "internal",
      Omit<FunctionArgs<ComponentApi["blobs"]["save"]>, "repositoryId"> & {
        repositoryId: RepositoryId;
      },
      FileBlob | null
    >;
    assertWriteAccess: FunctionReference<
      "mutation",
      "internal",
      HostScope<RepositoryId, UserId>,
      null
    >;
  };
};
