import {
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { createElement, useState, type ReactElement } from "react";
import App from "@/App";

function AppRouterRoot() {
  return createElement(Outlet);
}

const appRouterRootRoute = createRootRoute({
  component: AppRouterRoot,
});

const appIndexRoute = createRoute({
  getParentRoute: () => appRouterRootRoute,
  path: "/",
  component: App,
});

const appSplatRoute = createRoute({
  getParentRoute: () => appRouterRootRoute,
  path: "$",
  component: App,
});

const appRouteTree = appRouterRootRoute.addChildren([
  appIndexRoute,
  appSplatRoute,
]);

export function createAppRouter(history: RouterHistory) {
  const router = createRouter({
    defaultPreload: false,
    history,
    routeTree: appRouteTree,
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
