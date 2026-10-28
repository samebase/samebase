import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { isProdUiModeActive, isProductionPublicOrigin } from "@/lib/prodUiMode";
import { readRootRouteSearch } from "@/routeSearch/root";
import { rootQueries } from "@/routes/root.queries";

/**
Whether the page offers the GitHub and Google buttons of the identity hub. A linked worktree and CI
(the `local_worktree` profile) have no hub, so they offer only the password form; `?prod-ui` keeps
the buttons of the production page. Until the root loader's policy loads, the buttons show, as on
the prerendered page.
*/
export function useHubSignInVisible(): boolean {
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const { data: deploymentAuthPolicy } = useQuery(rootQueries.deploymentAuthPolicy);
  const deploymentProfile = deploymentAuthPolicy?.deploymentProfile;
  return (
    deploymentProfile?.kind !== "local_worktree" ||
    isProdUiModeActive({
      deploymentProfile,
      productionPublicOrigin: isProductionPublicOrigin(),
      search: readRootRouteSearch(searchStr),
    })
  );
}
