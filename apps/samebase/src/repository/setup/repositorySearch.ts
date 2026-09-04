import { tryParseGitHubRepositoryFullName } from "../../../shared/githubRepositoryName";

type SearchableRepository = {
  name: string;
  full_name: string;
};

type RepositorySearchMatchKind = "empty" | "repo" | "owner" | "full_name";

export type RepositorySearchMatch = {
  kind: RepositorySearchMatchKind;
  indices: number[];
};

export type RepositoryFullNameMatchSegments = {
  ownerIndices: number[];
  repoIndices: number[];
  slashMatched: boolean;
};

export function getFuzzyMatchIndices(query: string, target: string): number[] | null {
  const normalizedQuery = query.toLowerCase().replace(/\s+/g, "");
  if (normalizedQuery.length === 0) {
    return [];
  }

  const searchChars = normalizedQuery.split("");
  const targetChars = target.toLowerCase().split("");
  const matchedIndices: number[] = [];
  let searchIndex = 0;

  for (
    let targetIndex = 0;
    targetIndex < targetChars.length && searchIndex < searchChars.length;
    targetIndex += 1
  ) {
    if (targetChars[targetIndex] !== searchChars[searchIndex]) {
      continue;
    }
    matchedIndices.push(targetIndex);
    searchIndex += 1;
  }

  return searchIndex === searchChars.length ? matchedIndices : null;
}

function readRepositoryOwner(fullName: string): string {
  return tryParseGitHubRepositoryFullName(fullName)?.owner ?? "";
}

export function findRepositorySearchMatch(
  query: string,
  repository: SearchableRepository,
): RepositorySearchMatch | null {
  if (query.trim().length === 0) {
    return {
      kind: "empty",
      indices: [],
    };
  }

  const ownerName = readRepositoryOwner(repository.full_name);
  const repoIndices = getFuzzyMatchIndices(query, repository.name);
  if (repoIndices !== null) {
    return {
      kind: "repo",
      indices: repoIndices,
    };
  }

  const ownerIndices = getFuzzyMatchIndices(query, ownerName);
  if (ownerIndices !== null) {
    return {
      kind: "owner",
      indices: ownerIndices,
    };
  }

  const fullNameIndices = getFuzzyMatchIndices(query, repository.full_name);
  if (fullNameIndices !== null) {
    return {
      kind: "full_name",
      indices: fullNameIndices,
    };
  }

  return null;
}

export function repositoryMatchesSearch(query: string, repository: SearchableRepository): boolean {
  return findRepositorySearchMatch(query, repository) !== null;
}

export function splitRepositoryFullNameMatch(args: {
  ownerName: string;
  indices: number[];
}): RepositoryFullNameMatchSegments {
  const ownerIndices: number[] = [];
  const repoIndices: number[] = [];
  let slashMatched = false;

  for (const index of args.indices) {
    if (index < args.ownerName.length) {
      ownerIndices.push(index);
      continue;
    }
    if (index === args.ownerName.length) {
      slashMatched = true;
      continue;
    }
    repoIndices.push(index - args.ownerName.length - 1);
  }

  return {
    ownerIndices,
    repoIndices,
    slashMatched,
  };
}
