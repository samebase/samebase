import { createRouter as createTanStackRouter, type RouterHistory } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";
import { createAppQueryClients } from "@/lib/appQueryClient";
import { APP_WORKSPACE_MAIN_SCROLL_RESTORATION_ID } from "@/lib/appWorkspaceSidebarPreferences";
import { AppRouteErrorPage } from "@/components/AppRouteErrorPage";
import { parseTanStackSearch, stringifyTanStackSearch } from "@/lib/tanstackSearchParams";
import type { Id } from "../convex/_generated/dataModel";

const workspaceMainScrollSelector = `[data-scroll-restoration-id="${APP_WORKSPACE_MAIN_SCROLL_RESTORATION_ID}"]`;

export function getRouter() {
  return createAppRouter();
}

export function createAppRouter(history?: RouterHistory) {
  const queryClients = createAppQueryClients();
  const router = createTanStackRouter({
    context: queryClients,
    defaultErrorComponent: AppRouteErrorPage,
    defaultOnCatch: (error, errorInfo) => {
      console.error("Route failure", error, errorInfo);
    },
    defaultPreload: false,
    history,
    notFoundMode: "root",
    parseSearch: parseTanStackSearch,
    routeTree,
    scrollRestoration: true,
    scrollToTopSelectors: [workspaceMainScrollSelector],
    stringifySearch: stringifyTanStackSearch,
  });

  setupRouterSsrQueryIntegration({
    queryClient: queryClients.queryClient,
    router,
  });

  return router;
}

export type AppRouter = ReturnType<typeof getRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }

  interface HistoryState {
    // Marks query-dialog entries so Cancel can safely return to the entry beneath them.
    settingsDeleteAccountDialog?: true;
    repositoryDashboardDialog?:
      | {
          dialog: "add-cloudflare";
          repairWorkerId?: Id<"repositoryCloudflareWorkers">;
        }
      | {
          dialog: "add-convex";
          repairProjectId?: Id<"repositoryConvexProjects">;
        }
      | { dialog: "delete" };
  }
}
