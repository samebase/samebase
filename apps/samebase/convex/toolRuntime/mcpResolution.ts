import { exactly } from "@samebase/dependent/main";
import { ConvexError } from "convex/values";

/*
Resolves the repository name that MCP tools take into the stable ID that the shared handlers take.
The dashboard already holds the IDs, so this rule runs only on the MCP side.
*/

/** The `repository` argument: the Samebase `repositoryId` or the GitHub full name `owner/name`. */
export function findRepositoryByReference<
  Repository extends { repositoryId: string; githubRepositoryFullName: string },
>(repositories: readonly Repository[], reference: string): Repository {
  const trimmedReference = reference.trim();
  const repositoryById = repositories.find(
    (repository) => repository.repositoryId === trimmedReference,
  );
  if (repositoryById) {
    return repositoryById;
  }

  const fullName = trimmedReference.toLowerCase();
  const matches = repositories.filter(
    (candidate) => candidate.githubRepositoryFullName.toLowerCase() === fullName,
  );
  if (exactly(1, matches)) {
    return matches[0];
  }
  if (matches.length === 0) {
    throw new ConvexError(
      `No Samebase repository matches ${trimmedReference}. Pass owner/name or a repositoryId from repository_list. To add an existing GitHub repository to Samebase, call repository_connect.`,
    );
  }
  throw new ConvexError(
    `Several Samebase repositories match ${trimmedReference}: ${matches.map((candidate) => candidate.repositoryId).join(", ")}. Pass one repositoryId from repository_list.`,
  );
}
