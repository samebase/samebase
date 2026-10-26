import type {
  FunctionArgs,
  FunctionReference,
  GenericActionCtx,
  GenericDataModel,
} from "convex/server";
import type { GenericId } from "convex/values";
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
 * These host mutations keep access checks and root-storage cleanup in the same
 * transaction as each component write. The ID parameters preserve the host's
 * own repository and user ID types without teaching the package its schema.
 */
export type GitWorkspace<RepositoryId extends string, UserId extends string> = {
  ctx: Pick<GenericActionCtx<GenericDataModel>, "runQuery" | "runMutation" | "storage">;
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
    saveToStaging: FunctionReference<
      "mutation",
      "internal",
      AuthorizedArgs<FunctionArgs<Staging["saveToStaging"]>, RepositoryId, UserId>,
      StagedFile
    >;
    saveBinaryUploadToStaging: FunctionReference<
      "mutation",
      "internal",
      Omit<
        AuthorizedArgs<FunctionArgs<Staging["saveBinaryUploadToStaging"]>, RepositoryId, UserId>,
        "parentCommitSha" | "storageId"
      > & { storageId: GenericId<"_storage"> },
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
      Omit<
        AuthorizedArgs<FunctionArgs<Staging["createFileInStaging"]>, RepositoryId, UserId>,
        "existsInRepository"
      >,
      null
    >;
    rename: FunctionReference<
      "mutation",
      "internal",
      Omit<
        AuthorizedArgs<FunctionArgs<Staging["rename"]>, RepositoryId, UserId>,
        "existsInRepository"
      >,
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
    normalizeStorageId: FunctionReference<
      "query",
      "internal",
      { storageId: string },
      GenericId<"_storage">
    >;
    saveFileBlob: FunctionReference<
      "mutation",
      "internal",
      Omit<FunctionArgs<ComponentApi["blobs"]["save"]>, "repositoryId" | "storageId"> & {
        repositoryId: RepositoryId;
        storageId?: GenericId<"_storage">;
        debugFilePath?: string;
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
