/* @refresh reload */
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/solid-router";
import { TanStackRouterDevtools } from "@tanstack/solid-router-devtools";
import { render } from "solid-js/web";
import "./index.css";
import { WorkspaceLayoutPage } from "#src/routes/workspace-layout-page.tsx";

const root = document.getElementById("root");

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: WorkspaceLayoutPage,
});

const routeTree = rootRoute.addChildren([indexRoute]);

const router = createRouter({
  routeTree,
});

declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router;
  }
}

render(() => <RouterProvider router={router} />, root!);
