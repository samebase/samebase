import {
  createRouter as createTanStackRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import {
  parseTanStackSearch,
  stringifyTanStackSearch,
} from "#src/lib/tanstackSearchParams.ts";

export function getRouter() {
  return createTanStackRouter({
    defaultPreload: false,
    notFoundMode: "root",
    parseSearch: parseTanStackSearch,
    routeTree,
    stringifySearch: stringifyTanStackSearch,
  });
}

export function createAppRouter(history: RouterHistory) {
  const router = createTanStackRouter({
    defaultPreload: false,
    history,
    notFoundMode: "root",
    parseSearch: parseTanStackSearch,
    routeTree,
    stringifySearch: stringifyTanStackSearch,
  });

  void router.load({ sync: true });

  return router;
}

export type AppRouter = ReturnType<typeof getRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
