import { createRouter as createTanStackRouter, type RouterHistory } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";
import { createAppQueryClients } from "@/lib/appQueryClient";
import { parseTanStackSearch, stringifyTanStackSearch } from "@/lib/tanstackSearchParams";

export function getRouter() {
  return createAppRouter();
}

export function createAppRouter(history?: RouterHistory) {
  const queryClients = createAppQueryClients();
  const router = createTanStackRouter({
    context: queryClients,
    defaultPreload: false,
    history,
    notFoundMode: "root",
    parseSearch: parseTanStackSearch,
    routeTree,
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
}
