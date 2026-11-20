import { useSuspenseQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { repositoryDashboardQueries } from "@/routes/repository-dashboard.queries";
import type { RepositoryStackViewControl } from "./RepositoryEnvironmentTree";

/**
The view of the stack cards that the viewer picked, from `ui_user_settings`, for every repository
overview. The route loader fetches it, so the first frame shows the picked view.
*/
export function useRepositoryStackView(): RepositoryStackViewControl {
  const { data } = useSuspenseQuery(repositoryDashboardQueries.dashboardSettings);
  const setView = useMutation(api.dashboardSettings.setRepositoryStackView).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.dashboardSettings.getDashboardSettings, {});
      if (current) {
        localStore.setQuery(
          api.dashboardSettings.getDashboardSettings,
          {},
          { ...current, repositoryStackView: args.view },
        );
      }
    },
  );

  return {
    view: data.repositoryStackView,
    onChange: (view) => {
      void setView({ view });
    },
  };
}
