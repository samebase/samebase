import { isAdminUser } from "./access";
import type { NonDeletedUserLifecycleDoc } from "./lifecycle";
import type { ViewerRole } from "../../shared/accessModel";

export function readViewerRoleForUser(user: NonDeletedUserLifecycleDoc): ViewerRole {
  switch (user.state) {
    case "deleting":
      return "role_deleting";
    case "active":
      if (user.termsAcceptedAt === undefined && (isAdminUser(user.email) || user.isApproved)) {
        return "role_terms_pending";
      }
      if (isAdminUser(user.email)) {
        return "role_staff";
      }
      if (user.isApproved) {
        return "role_member";
      }
      return "role_pending_access";
    default:
      user satisfies never;
      throw new Error("Samebase account state is invalid.");
  }
}
