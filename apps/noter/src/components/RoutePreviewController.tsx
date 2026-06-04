import { readIsomorphicOrigin } from "@/lib/isomorphic";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";
import { useLocation, useRouter } from "@tanstack/react-router";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  keepState,
  runTransition,
  runTransitionActions,
} from "@/components/RouteUrlEditor/typedTransitionTable";
import type {
  TypedTransitionActionHandlerTable,
  TypedTransitionResult,
  TypedTransitionTable,
} from "@/components/RouteUrlEditor/typedTransitionTable";

const ROUTE_PREVIEW_LINK_SELECTOR = 'a[data-route-preview-link="true"]';

type RoutePreviewState =
  | {
      kind: "idle";
      /**
       * URL that should be visible when no temporary route preview is active.
       */
      href: string;
      /**
       * Last URL requested by the controller that has not settled in TanStack Router yet.
       */
      pendingHref: string | null;
    }
  | {
      kind: "previewing";
      /**
       * URL restored when the pointer leaves the preview surface.
       */
      restoreHref: string;
      /**
       * URL that should be visible while previewing.
       */
      href: string;
      /**
       * Last URL requested by the controller that has not settled in TanStack Router yet.
       */
      pendingHref: string | null;
      /**
       * Original preview target committed on click even if the link re-renders.
       */
      targetHref: string;
    };

type RoutePreviewClickContext = {
  preventDefault: () => void;
  setAnchorHref: (href: string) => void;
  stopPropagation: () => void;
};

type RoutePreviewEvent =
  | {
      type: "clickedPreviewLink";
      context: RoutePreviewClickContext;
      targetHref: string;
    }
  | {
      type: "leftPreviewSurface";
    }
  | {
      type: "movedPointer";
      /**
       * Route href under the pointer, or null when the pointer is not over a preview link.
       */
      targetHref: string | null;
    }
  | {
      type: "routeChanged";
      href: string;
    };

type RoutePreviewAction =
  | {
      brand: "commitPreviewRoute";
      context: RoutePreviewClickContext;
      currentHref: string;
      restoreHref: string;
      targetHref: string;
    }
  | {
      brand: "navigateClickedRoute";
      context: RoutePreviewClickContext;
      fromHref: string;
      targetHref: string;
    }
  | {
      brand: "replaceRoute";
      fromHref: string;
      toHref: string;
    };

type RoutePreviewTransitionResult = TypedTransitionResult<RoutePreviewState, RoutePreviewAction>;

type RoutePreviewTransitionTable = TypedTransitionTable<
  RoutePreviewState["kind"],
  RoutePreviewEvent["type"],
  RoutePreviewState,
  RoutePreviewEvent,
  RoutePreviewTransitionResult
>;

type RoutePreviewActionHandlerTable = TypedTransitionActionHandlerTable<
  RoutePreviewAction["brand"],
  RoutePreviewAction
>;

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
       * Search string restored on pointer leave.
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
   */
  previewLinkProps: {
    "data-route-preview-link": "true";
    onClickCapture: (event: MouseEvent<HTMLAnchorElement>) => void;
    onMouseEnter: (event: MouseEvent<HTMLAnchorElement>) => void;
  };
  /**
   * Standard props for the container that owns a group of preview links.
   *
   * The surface sends pointer leave as the direct restore path. While previewing,
   * the provider also samples document mouseover events for replaced rails.
   */
  previewSurfaceProps: {
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

function readDocumentRoutePreviewLinkHref(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const routePreviewLink = target.closest(ROUTE_PREVIEW_LINK_SELECTOR);
  if (!(routePreviewLink instanceof HTMLAnchorElement)) {
    return null;
  }

  return readAnchorRouteHref(routePreviewLink);
}

function shouldLetBrowserHandleClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function setAnchorHref(anchor: HTMLAnchorElement, routeHref: string) {
  anchor.href = new URL(routeHref, new URL(readIsomorphicOrigin())).href;
}

function readSamePath(leftHref: string, rightHref: string): boolean {
  const appOrigin = new URL(readIsomorphicOrigin());
  return new URL(leftHref, appOrigin).pathname === new URL(rightHref, appOrigin).pathname;
}

function readRouteChangedIdleState(
  prev: Extract<RoutePreviewState, { kind: "idle" }>,
  href: string,
): RoutePreviewTransitionResult {
  if (prev.pendingHref) {
    if (readSamePath(prev.pendingHref, href)) {
      return keepState({
        ...prev,
        href,
        pendingHref: null,
      });
    }

    return keepState(prev);
  }

  if (prev.href === href) {
    return keepState(prev);
  }

  return keepState({
    kind: "idle",
    href,
    pendingHref: null,
  });
}

function readRouteChangedPreviewingState(
  prev: Extract<RoutePreviewState, { kind: "previewing" }>,
  href: string,
): RoutePreviewTransitionResult {
  if (prev.pendingHref) {
    if (readSamePath(prev.pendingHref, href)) {
      return keepState({
        ...prev,
        href,
        pendingHref: null,
      });
    }

    return keepState(prev);
  }

  if (!readSamePath(prev.href, href)) {
    return keepState({
      kind: "idle",
      href,
      pendingHref: null,
    });
  }

  return keepState({
    ...prev,
    href,
  });
}

function startPreview(
  prev: Extract<RoutePreviewState, { kind: "idle" }>,
  targetHref: string,
): RoutePreviewTransitionResult {
  if (targetHref === prev.href) {
    return keepState(prev);
  }

  return {
    actions: [
      {
        brand: "replaceRoute",
        fromHref: prev.href,
        toHref: targetHref,
      },
    ],
    state: {
      kind: "previewing",
      href: targetHref,
      pendingHref: targetHref,
      restoreHref: prev.href,
      targetHref,
    },
  };
}

function restorePreview(
  prev: Extract<RoutePreviewState, { kind: "previewing" }>,
): RoutePreviewTransitionResult {
  if (prev.href === prev.restoreHref) {
    return keepState({
      kind: "idle",
      href: prev.restoreHref,
      pendingHref: null,
    });
  }

  return {
    actions: [
      {
        brand: "replaceRoute",
        fromHref: prev.href,
        toHref: prev.restoreHref,
      },
    ],
    state: {
      kind: "idle",
      href: prev.restoreHref,
      pendingHref: prev.restoreHref,
    },
  };
}

function retargetPreview(
  prev: Extract<RoutePreviewState, { kind: "previewing" }>,
  targetHref: string,
): RoutePreviewTransitionResult {
  if (targetHref === prev.targetHref) {
    return keepState(prev);
  }

  if (targetHref === prev.restoreHref) {
    return restorePreview(prev);
  }

  return {
    actions: [
      {
        brand: "replaceRoute",
        fromHref: prev.href,
        toHref: targetHref,
      },
    ],
    state: {
      ...prev,
      href: targetHref,
      pendingHref: targetHref,
      targetHref,
    },
  };
}

const routePreviewTransition: RoutePreviewTransitionTable = {
  idle: {
    clickedPreviewLink: (prev, event) => ({
      actions: [
        {
          brand: "navigateClickedRoute",
          context: event.context,
          fromHref: prev.href,
          targetHref: event.targetHref,
        },
      ],
      state: {
        kind: "idle",
        href: event.targetHref,
        pendingHref: event.targetHref,
      },
    }),
    leftPreviewSurface: keepState,
    movedPointer: (prev, event) =>
      event.targetHref ? startPreview(prev, event.targetHref) : keepState(prev),
    routeChanged: (prev, event) => readRouteChangedIdleState(prev, event.href),
  },

  previewing: {
    clickedPreviewLink: (prev, event) => ({
      actions: [
        {
          brand: "commitPreviewRoute",
          context: event.context,
          currentHref: prev.href,
          restoreHref: prev.restoreHref,
          targetHref: prev.targetHref,
        },
      ],
      state: {
        kind: "idle",
        href: prev.targetHref,
        pendingHref: prev.targetHref,
      },
    }),
    leftPreviewSurface: restorePreview,
    movedPointer: (prev, event) =>
      event.targetHref ? retargetPreview(prev, event.targetHref) : restorePreview(prev),
    routeChanged: (prev, event) => readRouteChangedPreviewingState(prev, event.href),
  },
};

function readRoutePreviewSnapshot(state: RoutePreviewState): RoutePreviewSnapshot {
  if (state.kind === "idle") {
    return {
      kind: "idle",
      href: state.href,
      search: readSearch(state.href),
    };
  }

  return {
    kind: "previewing",
    restoreSearch: readSearch(state.restoreHref),
    targetHref: state.targetHref,
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
  const store = useCreateStore<RoutePreviewState>({
    kind: "idle",
    href: location.href,
    pendingHref: null,
  });
  const state = useSelector(store);

  const navigateHref = useCallback(
    async ({
      fromHref,
      replace,
      toHref,
    }: {
      fromHref: string;
      replace: boolean;
      toHref: string;
    }) => {
      const origin = readIsomorphicOrigin();
      const appOrigin = new URL(origin);
      const fromUrl = new URL(fromHref, appOrigin);
      const toUrl = new URL(toHref, appOrigin);
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
        return;
      }

      await router.navigate({
        hash: readHash(toUrl),
        replace,
        search,
        to: toUrl.pathname,
      });
    },
    [router],
  );

  const runRoutePreviewActions = useCallback(
    (actions: RoutePreviewAction[]) => {
      const actionHandlers: RoutePreviewActionHandlerTable = {
        commitPreviewRoute: (action) => {
          action.context.preventDefault();
          action.context.stopPropagation();
          action.context.setAnchorHref(action.targetHref);

          const commitRoute = async () => {
            if (action.currentHref !== action.restoreHref) {
              await navigateHref({
                fromHref: action.currentHref,
                replace: true,
                toHref: action.restoreHref,
              });
            }

            if (action.targetHref !== action.restoreHref) {
              await navigateHref({
                fromHref: action.restoreHref,
                replace: false,
                toHref: action.targetHref,
              });
            }
          };
          void commitRoute();
        },
        navigateClickedRoute: (action) => {
          action.context.preventDefault();
          action.context.stopPropagation();
          action.context.setAnchorHref(action.targetHref);
          void navigateHref({
            fromHref: action.fromHref,
            replace: false,
            toHref: action.targetHref,
          });
        },
        replaceRoute: (action) => {
          void navigateHref({
            fromHref: action.fromHref,
            replace: true,
            toHref: action.toHref,
          });
        },
      };

      runTransitionActions(actionHandlers, actions);
    },
    [navigateHref],
  );

  const sendEvent = useCallback(
    (event: RoutePreviewEvent) => {
      let transitionActions: RoutePreviewAction[] = [];

      store.setState((prev) => {
        const next = runTransition(routePreviewTransition, prev, event);
        transitionActions = next.actions;

        return next.state;
      });

      runRoutePreviewActions(transitionActions);
    },
    [runRoutePreviewActions, store],
  );

  useLayoutEffect(() => {
    sendEvent({
      type: "routeChanged",
      href: location.href,
    });
  }, [location.href, sendEvent]);

  useLayoutEffect(() => {
    if (state.kind !== "previewing") {
      return;
    }

    // Hover navigation can re-render or replace the rail before React delivers
    // an anchor-level leave event. While previewing, each entered element tells
    // the FSM whether the pointer is still on a preview link.
    function handleDocumentMouseOver(event: globalThis.MouseEvent) {
      sendEvent({
        type: "movedPointer",
        targetHref: readDocumentRoutePreviewLinkHref(event.target),
      });
    }

    function handleDocumentMouseOut(event: globalThis.MouseEvent) {
      if (event.relatedTarget) {
        return;
      }

      sendEvent({
        type: "leftPreviewSurface",
      });
    }

    document.addEventListener("mouseover", handleDocumentMouseOver, true);
    document.addEventListener("mouseout", handleDocumentMouseOut, true);

    return () => {
      document.removeEventListener("mouseover", handleDocumentMouseOver, true);
      document.removeEventListener("mouseout", handleDocumentMouseOut, true);
    };
  }, [sendEvent, state.kind]);

  const previewLinkProps = useMemo(
    () => ({
      "data-route-preview-link": "true" as const,
      onClickCapture(event: MouseEvent<HTMLAnchorElement>) {
        if (shouldLetBrowserHandleClick(event)) {
          return;
        }

        sendEvent({
          type: "clickedPreviewLink",
          context: {
            preventDefault: () => {
              event.preventDefault();
            },
            setAnchorHref: (href) => {
              setAnchorHref(event.currentTarget, href);
            },
            stopPropagation: () => {
              event.stopPropagation();
            },
          },
          targetHref: readAnchorRouteHref(event.currentTarget),
        });
      },
      onMouseEnter(event: MouseEvent<HTMLAnchorElement>) {
        sendEvent({
          type: "movedPointer",
          targetHref: readAnchorRouteHref(event.currentTarget),
        });
      },
    }),
    [sendEvent],
  );

  const previewSurfaceProps = useMemo(
    () => ({
      onMouseLeave() {
        sendEvent({
          type: "leftPreviewSurface",
        });
      },
    }),
    [sendEvent],
  );

  const controller = {
    previewLinkProps,
    previewSurfaceProps,
    snapshot: readRoutePreviewSnapshot(state),
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
