import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useQueries } from "@tanstack/react-query";
import { useAction } from "convex/react";

const GITHUB_IDENTITY_STALE_MS = 60_000;

export type OrganizationGitHubIdentityObservation =
  (typeof api.github.observeOrganizationGitHubIdentity)["_returnType"];

export function organizationGitHubIdentityQueryKey(organizationId: Id<"organizations">) {
  return ["organization-github-identity", organizationId] as const;
}

export function useOrganizationGitHubIdentities(
  organizationIds: readonly Id<"organizations">[],
): ReadonlyMap<Id<"organizations">, OrganizationGitHubIdentityObservation> {
  const observeOrganizationGitHubIdentity = useAction(api.github.observeOrganizationGitHubIdentity);
  const uniqueOrganizationIds = [...new Set(organizationIds)].sort((left, right) =>
    left.localeCompare(right),
  );
  const queries = useQueries({
    queries: uniqueOrganizationIds.map((organizationId) => ({
      queryKey: organizationGitHubIdentityQueryKey(organizationId),
      queryFn: async () => await observeOrganizationGitHubIdentity({ organizationId }),
      refetchOnWindowFocus: "always" as const,
      staleTime: GITHUB_IDENTITY_STALE_MS,
      retry: false,
    })),
  });

  const observations = new Map<Id<"organizations">, OrganizationGitHubIdentityObservation>();
  uniqueOrganizationIds.forEach((organizationId, index) => {
    const observation = queries[index]?.data;
    if (observation) {
      observations.set(organizationId, observation);
    }
  });
  return observations;
}
