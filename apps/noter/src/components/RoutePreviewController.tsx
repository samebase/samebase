import { readIsomorphicOrigin } from "@/lib/isomorphic";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";
import { useLocation, useRouter } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

type RoutePreview = {
  /**
   * URL restored on mouseleave.
   *
   * Example: hovering "/terms" while currently at "/?dev" stores "/?dev".
   */
  restoreHref: string;
  /**
   * URL the router actually shows or is expected to show during preview.
   *
   * Example: a reset-link preview can request targetHref "/?reset" while the
   * router displays previewHref "/".
   */
  previewHref: string;
  /**
   * URL requested when the preview started.
   *
   * Example: clicking the hovered "/terms" link commits targetHref "/terms",
   * even if the link re-rendered while the preview was active.
   */
  targetHref: string;
};

type RoutePreviewSnapshot =
  | {
      kind: "idle";
      /**
       * Current URL. There is no separate preview URL in idle state.
       */
      href: string;
      search: string;
    }
  | {
      kind: "previewing";
      /**
       * Search string restored on mouseleave.
       */
      restoreSearch: string;
      /**
       * URL requested when the preview started.
       */
      targetHref: string;
    };

type RoutePreviewController = {
  /**
   * Derived route preview state for rendering.
   *
   * Example: while hovering "/terms" at "/?dev", snapshot.kind is
   * "previewing" and snapshot.restoreSearch stays "?dev" so query toggles do
   * not relabel under the pointer.
   */
  snapshot: RoutePreviewSnapshot;
  /**
   * Standard props for links that preview on hover and commit on left click.
   *
   * Example: a sidebar link only spreads these props. The controller keeps the
   * ref-backed current URL, restore URL, and exact search clearing logic here.
   */
  previewLinkProps: {
    onClickCapture: (event: MouseEvent<HTMLAnchorElement>) => void;
    onMouseEnter: (event: MouseEvent<HTMLAnchorElement>) => void;
    onMouseLeave: () => void;
  };
};

const RoutePreviewControllerContext = createContext<RoutePreviewController | null>(null);

/**
 * Builds a TanStack search object for moving from one href to another.
 *
 * fromHref is the URL before navigation.
 *
 * toHref is the URL after navigation.
 *
 * Example: fromHref "/?dev&dark" and toHref "/?dev" returns an object with
 * dark set to undefined so the router removes it.
 */
function readExactSearch(args: {
  fromHref: string;
  toHref: string;
  origin: string;
}): Record<string, unknown> {
  const appOrigin = new URL(args.origin);
  const fromUrl = new URL(args.fromHref, appOrigin);
  const toUrl = new URL(args.toHref, appOrigin);
  const fromSearch = parseTanStackSearch(fromUrl.search);
  const toSearch: Record<string, unknown> = parseTanStackSearch(toUrl.search);

  for (const key of Object.keys(fromSearch)) {
    if (!(key in toSearch)) {
      toSearch[key] = undefined;
    }
  }

  return toSearch;
}

function readHash(url: URL): string {
  return url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
}

function readSearch(href: string): string {
  return new URL(href, new URL(readIsomorphicOrigin())).search;
}

function readAnchorRouteHref(anchor: HTMLAnchorElement): string {
  const url = new URL(anchor.href);
  return `${url.pathname}${url.search}${url.hash}`;
}

function shouldLetBrowserHandleClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function setAnchorHref(anchor: HTMLAnchorElement, routeHref: string) {
  anchor.href = new URL(routeHref, new URL(readIsomorphicOrigin())).href;
}

function readRoutePreviewSnapshot(
  preview: RoutePreview | null,
  currentHref: string,
): RoutePreviewSnapshot {
  if (preview === null) {
    return {
      kind: "idle",
      href: currentHref,
      search: readSearch(currentHref),
    };
  }

  return {
    kind: "previewing",
    restoreSearch: readSearch(preview.restoreHref),
    targetHref: preview.targetHref,
  };
}

/**
 * Owns temporary route previews for the workspace.
 *
 * Example: sidebar hover, URL-editor focus, and other future preview sources
 * should share this provider so only one temporary URL can be active at a time.
 */
export function RoutePreviewProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const router = useRouter();
  // The href this controller believes the URL bar should show now. It changes
  // synchronously when we call router.navigate, before TanStack location updates.
  const currentHrefRef = useRef(location.href);
  // The newest controller-owned navigation that has not settled yet. Older
  // queued navigations must not overwrite currentHrefRef after a newer request.
  const pendingNavigationHrefRef = useRef<string | null>(null);
  const routeNavigationQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Event handlers can run again before React renders the latest state update.
  const activePreviewRef = useRef<RoutePreview | null>(null);
  const [activePreview, setActivePreviewState] = useState<RoutePreview | null>(null);

  const setActivePreview = useCallback((preview: RoutePreview | null) => {
    activePreviewRef.current = preview;
    setActivePreviewState(preview);
  }, []);

  const readSnapshot = useCallback(
    () => readRoutePreviewSnapshot(activePreviewRef.current, currentHrefRef.current),
    [],
  );

  useLayoutEffect(() => {
    const latestLocationHref = router.latestLocation.href;
    const pendingNavigationHref = pendingNavigationHrefRef.current;

    if (pendingNavigationHref === latestLocationHref) {
      pendingNavigationHrefRef.current = null;
    } else if (pendingNavigationHref !== null) {
      currentHrefRef.current = latestLocationHref;
      const appOrigin = new URL(readIsomorphicOrigin());
      const pendingNavigationUrl = new URL(pendingNavigationHref, appOrigin);
      const latestUrl = new URL(latestLocationHref, appOrigin);
      // Same-path differences can be router canonicalization. Example: a reset
      // query preview may request a special href but settle at plain "/".
      if (pendingNavigationUrl.pathname !== latestUrl.pathname) {
        pendingNavigationHrefRef.current = null;
        setActivePreview(null);
      }
      return;
    }

    currentHrefRef.current = latestLocationHref;

    const preview = activePreviewRef.current;
    const appOrigin = new URL(readIsomorphicOrigin());
    const latestUrl = new URL(latestLocationHref, appOrigin);
    if (preview && latestUrl.pathname !== new URL(preview.previewHref, appOrigin).pathname) {
      setActivePreview(null);
    }
  }, [location.href, router, setActivePreview]);

  const navigateHref = useCallback(
    (toHref: string, replace: boolean, fromHref = currentHrefRef.current) => {
      const origin = readIsomorphicOrigin();
      const appOrigin = new URL(origin);
      const toUrl = new URL(toHref, appOrigin);
      const toRouteHref = `${toUrl.pathname}${toUrl.search}${toUrl.hash}`;
      currentHrefRef.current = toRouteHref;
      pendingNavigationHrefRef.current = toRouteHref;

      const runNavigation = async () => {
        const fromUrl = new URL(fromHref, appOrigin);
        const search = () =>
          readExactSearch({
            fromHref,
            toHref,
            origin,
          });

        if (fromUrl.pathname === toUrl.pathname) {
          await router.navigate({
            hash: readHash(toUrl),
            replace,
            resetScroll: false,
            search,
            to: toUrl.pathname,
          });
        } else {
          await router.navigate({
            hash: readHash(toUrl),
            replace,
            search,
            to: toUrl.pathname,
          });
        }

        const latestRouterHref = router.latestLocation.href;
        const preview = activePreviewRef.current;
        if (preview && (preview.targetHref === toHref || preview.targetHref === toRouteHref)) {
          setActivePreview({
            ...preview,
            previewHref: latestRouterHref,
          });
        }

        if (pendingNavigationHrefRef.current === toRouteHref) {
          currentHrefRef.current = latestRouterHref;
          pendingNavigationHrefRef.current = null;
        }
      };

      const navigation = routeNavigationQueueRef.current.then(runNavigation, runNavigation);
      routeNavigationQueueRef.current = navigation.catch(() => {});
      return navigation;
    },
    [router, setActivePreview],
  );

  const startPreview = useCallback(
    (targetHref: string) => {
      if (activePreviewRef.current) {
        return;
      }

      const restoreHref = currentHrefRef.current;
      if (targetHref === restoreHref) {
        return;
      }

      const preview = {
        previewHref: targetHref,
        restoreHref,
        targetHref,
      } satisfies RoutePreview;

      setActivePreview(preview);
      void navigateHref(targetHref, true, restoreHref);
    },
    [navigateHref, setActivePreview],
  );

  const restorePreview = useCallback(() => {
    const preview = activePreviewRef.current;
    if (!preview) {
      return;
    }

    setActivePreview(null);

    const currentHref = currentHrefRef.current;
    if (currentHref !== preview.previewHref || preview.restoreHref === currentHref) {
      return;
    }

    void navigateHref(preview.restoreHref, true, currentHref);
  }, [navigateHref, setActivePreview]);

  const commitPreview = useCallback(() => {
    const preview = activePreviewRef.current;
    if (!preview) {
      return null;
    }

    setActivePreview(null);

    const currentHref = currentHrefRef.current;
    const commitRoute = async () => {
      if (currentHref !== preview.restoreHref) {
        await navigateHref(preview.restoreHref, true, currentHref);
      }
      if (preview.targetHref !== preview.restoreHref) {
        await navigateHref(preview.targetHref, false, preview.restoreHref);
      }
    };
    void commitRoute();

    return preview.targetHref;
  }, [navigateHref, setActivePreview]);

  const previewLinkProps = useMemo(
    () => ({
      onClickCapture(event: MouseEvent<HTMLAnchorElement>) {
        if (shouldLetBrowserHandleClick(event)) {
          return;
        }

        const previewTargetHref = commitPreview();
        if (previewTargetHref) {
          event.preventDefault();
          event.stopPropagation();
          setAnchorHref(event.currentTarget, previewTargetHref);
          return;
        }

        const snapshot = readSnapshot();
        if (snapshot.kind !== "idle") {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const linkHref = readAnchorRouteHref(event.currentTarget);
        setAnchorHref(event.currentTarget, linkHref);
        void navigateHref(linkHref, false, snapshot.href);
      },
      onMouseEnter(event: MouseEvent<HTMLAnchorElement>) {
        const snapshot = readSnapshot();
        // A previewed query toggle can re-render into its "disable" href. Keep
        // the first hover target until the user leaves or clicks.
        if (snapshot.kind === "previewing") {
          return;
        }

        const targetHref = readAnchorRouteHref(event.currentTarget);
        if (targetHref === snapshot.href) {
          return;
        }

        startPreview(targetHref);
      },
      onMouseLeave() {
        restorePreview();
      },
    }),
    [commitPreview, navigateHref, readSnapshot, restorePreview, startPreview],
  );

  const snapshot = readRoutePreviewSnapshot(
    activePreview,
    activePreview === null ? location.href : currentHrefRef.current,
  );

  const controller = {
    previewLinkProps,
    snapshot,
  } satisfies RoutePreviewController;

  return (
    <RoutePreviewControllerContext.Provider value={controller}>
      {children}
    </RoutePreviewControllerContext.Provider>
  );
}

// oxlint-disable-next-line react-refresh/only-export-components
export function useRoutePreviewController() {
  const controller = useContext(RoutePreviewControllerContext);
  if (!controller) {
    throw new Error("RoutePreviewProvider is required before useRoutePreviewController.");
  }

  return controller;
}
