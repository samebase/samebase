import type { DatabaseReader } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findPasswordReviewAuthUser(
  db: DatabaseReader,
  email: string,
): Promise<Doc<"users"> | null> {
  const normalizedEmail = normalizeAuthEmail(email);
  const users = await db
    .query("users")
    .withIndex("email", (q) => q.eq("email", normalizedEmail))
    .take(16);
  if (users.length === 16) {
    throw new Error(`Too many users exist for ${normalizedEmail}`);
  }

  const approvedUsers = users.filter((user) => user.isApproved === true);
  if (approvedUsers.length > 1) {
    throw new Error(`Multiple approved users exist for ${normalizedEmail}`);
  }
  if (approvedUsers.length === 1) {
    return approvedUsers[0];
  }

  const verifiedUsers = users.filter((user) => user.emailVerificationTime !== undefined);
  if (verifiedUsers.length > 1) {
    throw new Error(`Multiple verified users exist for ${normalizedEmail}`);
  }
  return verifiedUsers[0] ?? null;
}
