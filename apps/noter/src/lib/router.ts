import {
  BrowserRouter as ReactRouterBrowserRouter,
  Link as ReactRouterLink,
  MemoryRouter as ReactRouterMemoryRouter,
  Route as ReactRouterRoute,
  Routes as ReactRouterRoutes,
  useLocation as useReactRouterLocation,
  useNavigate as useReactRouterNavigate,
  useParams as useReactRouterParams,
  useSearchParams as useReactRouterSearchParams,
} from "react-router-dom";

/**
 * Keep router imports behind a repo-owned seam so runtime migrations can happen
 * in one place instead of across every app component, test, and fixture.
 */
export const BrowserRouter = ReactRouterBrowserRouter;
export const Link = ReactRouterLink;
export const MemoryRouter = ReactRouterMemoryRouter;
export const Route = ReactRouterRoute;
export const Routes = ReactRouterRoutes;
export const useLocation = useReactRouterLocation;
export const useNavigate = useReactRouterNavigate;
export const useParams = useReactRouterParams;
export const useSearchParams = useReactRouterSearchParams;
