import { guard } from "@samebase/dependent/main";
import type { Doc } from "../../_generated/dataModel";
import type { RepositoryDeletionState } from "./model";

export type RuntimeRepositoryDeletionRun = Exclude<
  Doc<"workflow_repositoryDeletion_runs">,
  { state: "migration_placeholder" }
>;

export const isRuntimeRepositoryDeletionRun = guard<
  Doc<"workflow_repositoryDeletion_runs">,
  RuntimeRepositoryDeletionRun
>((run) => (run.state === "migration_placeholder" ? null : run));

export function readRepositoryDeletionState(
  repository: Doc<"repositories">,
): RepositoryDeletionState {
  switch (repository.state) {
    case "migration_placeholder":
    case "migration_tombstone":
      throw new Error("Migration-only repository has no deletion state.");
    default:
      return repository.deletion;
  }
}

export function isRepositoryDeletingOrDeleteFailed(repository: Doc<"repositories">): boolean {
  return readRepositoryDeletionState(repository).state !== "not_deleting";
}
