import {
  Outlet,
  RouterContextProvider,
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRouter,
  useRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import {
  createElement,
  forwardRef,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";

/**
 * Keep router imports behind a repo-owned seam so runtime migrations can happen
 * in one place instead of across every app component, test, and fixture.
 *
 * TODO(tanstack-router-migration): Delete this compatibility bridge.
 * The current runtime is TanStack Router, but this file still exposes a
 * React Router-like API surface so we can migrate incrementally.
 *
 * Follow-up work should move callers onto the real TanStack approach:
 * - replace `BrowserRouter`/`MemoryRouter` callsites with route-aware TanStack
 *   providers or explicit router test helpers
 * - replace string-only `Link` and `useNavigate` usage with typed TanStack
 *   route navigation options
 * - replace the `useLocation` shape shim with route-aware TanStack hooks
 * - replace `useSearchParams` with route-owned `validateSearch` + `useSearch`
 * - delete the React Router-style `location.state` normalization once callers
 *   stop depending on that shape
 */
type CompatNavigateOptions = {
  replace?: boolean;
  state?: unknown;
};

type CompatNavigateTarget = number | string;

type CompatLocation = {
  hash: string;
  key: string;
  pathname: string;
  search: string;
  state: unknown;
};

type SearchParamsInit = ConstructorParameters<typeof URLSearchParams>[0];

type SetSearchParamsAction =
  | SearchParamsInit
  | ((previous: URLSearchParams) => SearchParamsInit);

type SetSearchParams = (
  nextSearchParams: SetSearchParamsAction,
  navigateOptions?: CompatNavigateOptions,
) => void;

type MemoryRouterProps = {
  children?: ReactNode;
  initialEntries?: string[];
  initialIndex?: number;
};

type BrowserRouterProps = {
  children?: ReactNode;
};

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  replace?: boolean;
  reloadDocument?: boolean;
  state?: unknown;
  to: string;
};

const INTERNAL_ABSOLUTE_URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

function CompatRouterRoot() {
  return createElement(Outlet);
}

const compatRouterRootRoute = createRootRoute({
  component: CompatRouterRoot,
});

function createCompatRouter(history: RouterHistory) {
  // TODO(tanstack-router-migration): this "context only" router exists so old
  // hook consumers can keep working before their routes are modeled directly in
  // TanStack Router. Prefer real route trees and typed route helpers instead.
  return createRouter({
    defaultPreload: false,
    history,
    routeTree: compatRouterRootRoute,
  });
}

function readCompatLocationState(state: Record<string, unknown>): unknown {
  const userState: Record<string, unknown> = { ...state };

  delete userState.key;
  delete userState.__TSR_key;
  delete userState.__TSR_index;
  delete userState.__hashScrollIntoViewOptions;
  delete userState.__tempKey;
  delete userState.__tempLocation;

  return Object.keys(userState).length > 0 ? userState : null;
}

function isExternalHref(href: string): boolean {
  return href.startsWith("//") || INTERNAL_ABSOLUTE_URL_PATTERN.test(href);
}

function shouldHandleInternalClick(
  event: ReactMouseEvent<HTMLAnchorElement>,
  target: string | undefined,
): boolean {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey
  ) {
    return false;
  }

  return target === undefined || target === "_self";
}

function buildSearchString(searchParams: URLSearchParams): string {
  const nextSearch = searchParams.toString();

  return nextSearch.length > 0 ? `?${nextSearch}` : "";
}

function buildLocationHref(
  location: Pick<CompatLocation, "hash" | "pathname">,
  search: string,
) {
  return `${location.pathname}${search}${location.hash}`;
}

export function BrowserRouter({ children }: BrowserRouterProps): ReactElement {
  const [router] = useState(() => createCompatRouter(createBrowserHistory()));

  return createElement(RouterContextProvider, {
    children,
    router,
  });
}

export function MemoryRouter({
  children,
  initialEntries = ["/"],
  initialIndex,
}: MemoryRouterProps): ReactElement {
  const [router] = useState(() =>
    createCompatRouter(
      createMemoryHistory({
        initialEntries,
        initialIndex,
      }),
    ),
  );

  return createElement(RouterContextProvider, {
    children,
    router,
  });
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { onClick, reloadDocument, replace, state, target, to, ...anchorProps },
  ref,
) {
  const navigate = useNavigate();
  const handleClick = useCallback(
    (event: ReactMouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);

      if (
        reloadDocument ||
        isExternalHref(to) ||
        !shouldHandleInternalClick(event, target)
      ) {
        return;
      }

      event.preventDefault();
      navigate(to, { replace, state });
    },
    [navigate, onClick, reloadDocument, replace, state, target, to],
  );

  return createElement("a", {
    ...anchorProps,
    href: to,
    onClick: handleClick,
    ref,
    target,
  });
});

export function useLocation(): CompatLocation {
  const router = useRouter();
  const location = useSyncExternalStore(
    router.history.subscribe,
    () => router.history.location,
    () => router.history.location,
  );

  return useMemo(() => {
    const locationUrl = new URL(
      location.href,
      typeof window === "undefined"
        ? "https://noter.invalid"
        : window.location.origin,
    );
    const locationState: Record<string, unknown> = { ...location.state };
    const key =
      typeof locationState.__TSR_key === "string"
        ? locationState.__TSR_key
        : typeof locationState.key === "string"
          ? locationState.key
          : location.href;

    return {
      hash: locationUrl.hash,
      key,
      pathname: locationUrl.pathname,
      search: locationUrl.search,
      state: readCompatLocationState(locationState),
    };
  }, [location.href, location.state]);
}

export function useNavigate() {
  const router = useRouter();

  return useCallback(
    (to: CompatNavigateTarget, options: CompatNavigateOptions = {}) => {
      if (typeof to === "number") {
        router.history.go(to);
        return;
      }

      if (options.replace) {
        router.history.replace(to, options.state);
        return;
      }

      router.history.push(to, options.state);
    },
    [router.history],
  );
}

export function useSearchParams(): [URLSearchParams, SetSearchParams] {
  // TODO(tanstack-router-migration): this intentionally preserves the old
  // `URLSearchParams` API, but the long-term TanStack path is route-level
  // search validation plus typed `useSearch` accessors.
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );

  const setSearchParams = useCallback<SetSearchParams>(
    (nextSearchParams, navigateOptions = {}) => {
      const resolvedSearchParams =
        typeof nextSearchParams === "function"
          ? nextSearchParams(new URLSearchParams(searchParams))
          : nextSearchParams;
      const nextSearch = buildSearchString(
        new URLSearchParams(resolvedSearchParams),
      );

      navigate(buildLocationHref(location, nextSearch), navigateOptions);
    },
    [location, navigate, searchParams],
  );

  return [searchParams, setSearchParams];
}
