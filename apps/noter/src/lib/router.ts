import {
  BrowserRouter as ReactRouterBrowserRouter,
  Link as ReactRouterLink,
  MemoryRouter as ReactRouterMemoryRouter,
  useLocation as useReactRouterLocation,
  useNavigate as useReactRouterNavigate,
  useSearchParams as useReactRouterSearchParams,
} from "react-router-dom";

/**
 * Keep router imports behind a repo-owned seam so runtime migrations can happen
 * in one place instead of across every app component, test, and fixture.
 */
export const BrowserRouter = ReactRouterBrowserRouter;
export const Link = ReactRouterLink;
export const MemoryRouter = ReactRouterMemoryRouter;
export const useLocation = useReactRouterLocation;
export const useNavigate = useReactRouterNavigate;
export const useSearchParams = useReactRouterSearchParams;
