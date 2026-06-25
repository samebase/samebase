const ADMIN_EMAILS = new Set(["nicuchiciuc@gmail.com", "nicu@samebase.com"]);

export function isAdminUser(email?: string | null): boolean {
  if (!email) {
    return false;
  }
  return ADMIN_EMAILS.has(email.toLowerCase());
}
