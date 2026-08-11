import { ConvexError } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import type { OrganizationDeletionState } from "./model";

export function readOrganizationDeletionState(
  organization: Doc<"organizations">,
): OrganizationDeletionState {
  return organization.deletion ?? { state: "not_deleting" };
}

export function requireOrganizationNotDeleting(organization: Doc<"organizations">): void {
  const deletion = readOrganizationDeletionState(organization);
  if (deletion.state === "deleting") {
    throw new ConvexError("Organization deletion is in progress.");
  }
  if (deletion.state === "delete_failed") {
    throw new ConvexError("Retry organization deletion before you change this organization.");
  }
}
