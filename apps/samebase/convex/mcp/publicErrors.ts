import { ConvexError } from "convex/values";

import { AppResourceNameConflictError } from "../../shared/appResourceNames";

export function publicMcpErrorMessage(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  if (error instanceof AppResourceNameConflictError) {
    return error.message;
  }
  return "Samebase could not complete this request. Check the app in Samebase before retrying.";
}
