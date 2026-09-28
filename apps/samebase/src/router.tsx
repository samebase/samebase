import { createRouter as createTanStackRouter, type RouterHistory } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import {
  defaultGetScrollRestorationKey,
  scrollRestorationCache,
  type ScrollRestorationEntry,
} from "@tanstack/router-core";
import { routeTree } from "./routeTree.gen";
import { createAppQueryClients } from "@/lib/appQueryClient";
import { APP_WORKSPACE_MAIN_SCROLL_RESTORATION_ID } from "@/appShell/appWorkspaceSidebarPreferences";
import { AppRouteErrorPage } from "@/appShell/AppRouteErrorPage";
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

  router.subscribe("onRendered", (event) => {
    if (scrollRestorationCache === null || typeof document === "undefined") {
      return;
    }

    const destinationKey = defaultGetScrollRestorationKey(event.toLocation);
    // TanStack deliberately skips caching a destination when resetScroll is false.
    // Give that new history entry its own copy so a later Back restores this position.
    if (destinationKey in scrollRestorationCache.state) {
      return;
    }

    const sourceKey = event.fromLocation
      ? defaultGetScrollRestorationKey(event.fromLocation)
      : undefined;
    const sourceWasReplaced =
      event.fromLocation !== undefined &&
      event.fromLocation.state.__TSR_index === event.toLocation.state.__TSR_index;
    const sourceEntries = sourceKey ? scrollRestorationCache.state[sourceKey] : undefined;
    const destinationEntries: Record<string, ScrollRestorationEntry> = {};
    for (const [selector, entry] of Object.entries(sourceEntries ?? {})) {
      destinationEntries[selector] = {
        scrollX: entry.scrollX,
        scrollY: entry.scrollY,
      };
    }

    const mainPane = document.querySelector<HTMLElement>(workspaceMainScrollSelector);
    if (mainPane) {
      destinationEntries[workspaceMainScrollSelector] = {
        scrollX: mainPane.scrollLeft,
        scrollY: mainPane.scrollTop,
      };
    }
    destinationEntries["window"] = {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };

    scrollRestorationCache.set((state) => {
      state[destinationKey] = destinationEntries;
      if (sourceWasReplaced && sourceKey !== undefined && sourceKey !== destinationKey) {
        delete state[sourceKey];
      }
      return state;
    });
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
