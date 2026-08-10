import { isAdminUser } from "./userAccess";
import type { NonDeletedUserLifecycleDoc } from "./userLifecycle";
import type { ViewerRole } from "../shared/accessModel";

export function readViewerRoleForUser(user: NonDeletedUserLifecycleDoc): ViewerRole {
  switch (user.state) {
    case "deleting":
      return "role_deleting";
    case "active":
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
