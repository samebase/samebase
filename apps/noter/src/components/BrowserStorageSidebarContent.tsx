import { INDEXED_DB_ROUTE } from "@/lib/indexedDbRoute";
import { LOCAL_STORAGE_ROUTE } from "@/lib/localStorageRoute";
import { routePreviewLinkInteractionClassName } from "@/components/routePreviewLinkStyles";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useCallback, type MouseEvent } from "react";

type BrowserStorageView = "indexDB" | "localStorage";
type BrowserStorageRoutePreview = {
  basePath: string;
  targetPath: string;
};

const browserStorageViews = [
  {
    path: LOCAL_STORAGE_ROUTE,
    testId: "local-storage-sidebar-file",
    view: "localStorage",
  },
  {
    path: INDEXED_DB_ROUTE,
    testId: "indexed-db-sidebar-file",
    view: "indexDB",
  },
] as const satisfies readonly {
  path: string;
  testId: string;
  view: BrowserStorageView;
}[];

// Hovering a storage link swaps routes, which remounts this left sidebar before pointer leave fires.
let browserStorageRoutePreview: BrowserStorageRoutePreview | null = null;

function readBrowserStorageLinkPath(anchor: HTMLAnchorElement): string {
  return new URL(anchor.href).pathname;
}

function shouldLetBrowserHandleClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

export function BrowserStorageSidebarContent({ currentView }: { currentView: BrowserStorageView }) {
  const location = useLocation();
  const router = useRouter();
  const currentPath = location.pathname;

  const navigatePath = useCallback(
    (path: string, replace: boolean) =>
      router.navigate({
        replace,
        to: path,
      }),
    [router],
  );

  const previewRouteLink = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      const targetPath = readBrowserStorageLinkPath(event.currentTarget);
      if (targetPath === currentPath) {
        return;
      }

      browserStorageRoutePreview = {
        basePath: browserStorageRoutePreview?.basePath ?? currentPath,
        targetPath,
      };
      void navigatePath(targetPath, true);
    },
    [currentPath, navigatePath],
  );

  const restoreRoutePreview = useCallback(() => {
    const preview = browserStorageRoutePreview;
    if (preview === null) {
      return;
    }

    if (currentPath !== preview.targetPath) {
      return;
    }

    browserStorageRoutePreview = null;
    if (preview.basePath !== currentPath) {
      void navigatePath(preview.basePath, true);
    }
  }, [currentPath, navigatePath]);

  const commitRoutePreview = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      const preview = browserStorageRoutePreview;
      if (preview === null || shouldLetBrowserHandleClick(event)) {
        return;
      }

      event.preventDefault();
      browserStorageRoutePreview = null;

      const commitPreview = async () => {
        if (preview.basePath !== currentPath) {
          await navigatePath(preview.basePath, true);
        }
        if (preview.targetPath !== preview.basePath) {
          await navigatePath(preview.targetPath, false);
        }
      };
      void commitPreview();
    },
    [currentPath, navigatePath],
  );

  return (
    <nav
      aria-label="Storage views"
      className="flex flex-col items-start gap-3 overflow-hidden px-2 py-3 text-sm text-muted-foreground [&>a]:max-w-full [&>a]:line-clamp-2 [&>a]:[overflow-wrap:anywhere]"
    >
      {browserStorageViews.map((view) => (
        <Link
          key={view.view}
          aria-current={view.view === currentView ? "page" : undefined}
          data-testid={view.testId}
          to={view.path}
          onClick={commitRoutePreview}
          onMouseEnter={previewRouteLink}
          onMouseLeave={restoreRoutePreview}
          className={routePreviewLinkInteractionClassName}
        >
          {view.path}
        </Link>
      ))}
    </nav>
  );
}
