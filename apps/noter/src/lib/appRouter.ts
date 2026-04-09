import {
  RouterProvider,
  createBrowserHistory,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { createElement, useState, type ReactElement } from "react";
import { routeTree } from "@/routeTree.gen";
import {
  parseTanStackSearch,
  stringifyTanStackSearch,
} from "@/lib/tanstackSearchParams";

export function createAppRouter(history: RouterHistory) {
  const router = createRouter({
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

export type AppRouter = ReturnType<typeof createAppRouter>;

export function AppRouterProvider(): ReactElement {
  const [router] = useState(() => createAppRouter(createBrowserHistory()));

  return createElement(RouterProvider, { router });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
