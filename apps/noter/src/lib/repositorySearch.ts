type SearchableRepository = {
  name: string;
  full_name: string;
};

export function getFuzzyMatchIndices(
  query: string,
  target: string,
): number[] | null {
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
  const slashIndex = fullName.indexOf("/");
  if (slashIndex === -1) {
    return "";
  }
  return fullName.slice(0, slashIndex);
}

export function repositoryMatchesSearch(
  query: string,
  repository: SearchableRepository,
): boolean {
  if (query.trim().length === 0) {
    return true;
  }

  const ownerName = readRepositoryOwner(repository.full_name);
  return (
    getFuzzyMatchIndices(query, repository.name) !== null ||
    getFuzzyMatchIndices(query, ownerName) !== null ||
    getFuzzyMatchIndices(query, repository.full_name) !== null
  );
}
