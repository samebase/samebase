const CODEX_RESEARCH_EMAIL_ALLOWLIST = new Set([
  "nicuchiciuc@gmail.com",
  "nicu.dev@gmail.com",
]);

export function canAccessCodexResearch(args: {
  email: string | null | undefined;
  isDev: boolean;
}): boolean {
  if (args.isDev) {
    return true;
  }

  const normalizedEmail = args.email?.trim().toLowerCase();
  if (!normalizedEmail) {
    return false;
  }

  return CODEX_RESEARCH_EMAIL_ALLOWLIST.has(normalizedEmail);
}
