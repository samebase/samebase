import type { Doc } from "../../_generated/dataModel";

export function isRepositoryDeletingOrDeleteFailed(repository: Doc<"repositories">): boolean {
  return repository.deletion.state !== "not_deleting";
}
