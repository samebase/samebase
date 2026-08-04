import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useCacheQuery } from "@/lib/convexQueryCache";

export function useOrganizationVaults(organizationId: Id<"organizations">) {
  return useCacheQuery(api.vault.dashboard.getUserVaults, { organizationId });
}
