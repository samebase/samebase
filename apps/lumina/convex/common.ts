import { getAuthUserId } from "@convex-dev/auth/server";
import { Auth } from "convex/server";

export async function getUserId(ctx: { auth: Auth }) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("User not authenticated");
  }
  return userId;
}
