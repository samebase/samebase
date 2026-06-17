const ADMIN_USERNAMES = ["nicu-chiciuc"];
const ADMIN_EMAILS = new Set(["nicu.dev@gmail.com", "nicuchiciuc@gmail.com", "nicu@noter.md"]);

export function isAdminUser(
  githubUsername: string | null | undefined,
  email?: string | null,
): boolean {
  if (githubUsername && ADMIN_USERNAMES.includes(githubUsername)) {
    return true;
  }
  if (!email) {
    return false;
  }
  return ADMIN_EMAILS.has(email.toLowerCase());
}

/**
 * Keep invite approval in persisted user data so operators can flip one
 * `users.isApproved` field instead of editing a code-side email allowlist.
 */
export function hasAppAccess(args: {
  githubUsername: string | null | undefined;
  email?: string | null;
  isApproved?: boolean | null | undefined;
}): boolean {
  if (args.isApproved === true) {
    return true;
  }
  return isAdminUser(args.githubUsername, args.email);
}
