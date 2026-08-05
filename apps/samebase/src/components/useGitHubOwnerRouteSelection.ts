import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function useGitHubOwnerRouteSelection(githubOwnerLogin: string | null) {
  const githubOwners = useQuery(api.organizations.listForViewer);
  const normalizedLogin = githubOwnerLogin?.trim().toLowerCase();
  const selectedOwner =
    githubOwnerLogin === null
      ? githubOwners?.length === 1
        ? githubOwners[0]
        : null
      : (githubOwners?.find((owner) => owner.githubOwnerLogin.toLowerCase() === normalizedLogin) ??
        null);

  return { githubOwners, selectedOwner };
}
