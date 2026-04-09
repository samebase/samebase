import {
  Outlet,
  createRootRoute,
  retainSearchParams,
} from "@tanstack/react-router";
import { NotFoundRoutePage } from "@/components/NotFoundRoutePage";
import { RouterGestureDebugOverlay } from "@/components/RouterGestureDebugOverlay";
import { validateRootRouteSearch } from "@/lib/rootRouteSearch";

function AppRouterRoot() {
  return (
    <>
      <Outlet />
      <RouterGestureDebugOverlay />
    </>
  );
}

export const Route = createRootRoute({
  component: AppRouterRoot,
  notFoundComponent: NotFoundRoutePage,
  search: {
    middlewares: [retainSearchParams(["devtools"])],
  },
  validateSearch: validateRootRouteSearch,
});
