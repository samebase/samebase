import type { Id } from "../../../convex/_generated/dataModel";

export function repositoryExternalDataQueryKey(repositoryId: Id<"repositories"> | undefined) {
  return ["repository-external-data", repositoryId] as const;
}
