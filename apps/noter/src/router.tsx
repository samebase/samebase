import {
  createRouter,
  type RouterHistory,
  type TrailingSlashOption,
} from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";
import {
  parseTanStackSearch,
  stringifyTanStackSearch,
} from "@/lib/tanstackSearchParams";

const trailingSlash: TrailingSlashOption = "never";

function buildRouter(history?: RouterHistory) {
  const router = createRouter({
    defaultPreload: false,
    history,
    notFoundMode: "root",
    parseSearch: parseTanStackSearch,
    routeTree,
    stringifySearch: stringifyTanStackSearch,
    trailingSlash,
  });

  // Test helpers still pass an explicit history and expect the router state to
  // be ready immediately, but Start's shell prerender constructs the router
  // before client transition state exists.
  if (history) {
    void router.load({ sync: true });
  }

  return router;
}

export function getRouter(history?: RouterHistory) {
  return buildRouter(history);
}

export type AppRouter = ReturnType<typeof getRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
