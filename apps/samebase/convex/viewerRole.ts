import type { Doc } from "./_generated/dataModel";
import { isAdminUser } from "./userAccess";
import type { ViewerRole } from "../shared/accessModel";

export function readViewerRoleForUser(
  user: Pick<Doc<"users">, "accountDeletion" | "email" | "isApproved">,
): ViewerRole {
  if (user.accountDeletion !== undefined) {
    return "role_deleting";
  }
  if (isAdminUser(user.email)) {
    return "role_staff";
  }
  if (user.isApproved) {
    return "role_member";
  }
  return "role_pending_access";
}
