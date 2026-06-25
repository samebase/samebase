const ADMIN_EMAILS = new Set(["nicuchiciuc@gmail.com", "nicu@samebase.com"]);

export function isAdminUser(email?: string | null): boolean {
  if (!email) {
    return false;
  }
  return ADMIN_EMAILS.has(email.toLowerCase());
}

/**
 * Keep invite approval in persisted user data so operators can flip one
 * `users.isApproved` field instead of editing a code-side email allowlist.
 */
export function hasAppAccess(isApproved?: boolean | null): boolean {
  return isApproved === true;
}
