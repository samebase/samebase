function normalizeImageComponent(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeImageTag(value: string): string {
  return value.trim();
}

export function buildDaytonaDepsImageName(args: {
  owner: string;
  repo: string;
  tag: string;
}): string {
  const owner = normalizeImageComponent(args.owner);
  const repo = normalizeImageComponent(args.repo);
  const tag = normalizeImageTag(args.tag);
  return `ghcr.io/${owner}/${repo}-daytona-deps:${tag}`;
}

export function resolveDaytonaDepsImageCandidates(args: {
  owner: string;
  repo: string;
  inputHash: string | null;
  lockHash: string | null;
}): string[] {
  const normalizedOwner = args.owner.trim();
  const normalizedRepo = args.repo.trim();
  if (normalizedOwner.length === 0 || normalizedRepo.length === 0) {
    return [];
  }

  const candidates = new Set<string>();

  for (const tag of [args.inputHash, args.lockHash]) {
    const normalizedTag = tag?.trim() ?? "";
    if (normalizedTag.length === 0) {
      continue;
    }
    candidates.add(
      buildDaytonaDepsImageName({
        owner: normalizedOwner,
        repo: normalizedRepo,
        tag: normalizedTag,
      }),
    );
  }

  return [...candidates];
}
