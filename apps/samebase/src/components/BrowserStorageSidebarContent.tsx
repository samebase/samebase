import { INDEXED_DB_ROUTE } from "@/lib/indexedDbRoute";
import { LOCAL_STORAGE_ROUTE } from "@/lib/localStorageRoute";
import { APP_SIDEBAR_NAVIGATION_LINK_PROPS } from "@/components/appSidebarNavigation";
import { Link } from "@tanstack/react-router";

const browserStorageViews = [
  {
    path: LOCAL_STORAGE_ROUTE,
    testId: "local-storage-sidebar-file",
  },
  {
    path: INDEXED_DB_ROUTE,
    testId: "indexed-db-sidebar-file",
  },
] as const;

export function BrowserStorageSidebarContent() {
  return (
    <nav
      aria-label="Storage views"
      className="flex flex-col items-start gap-3 overflow-hidden px-2 py-3 text-base text-muted-foreground [&>a]:max-w-full [&>a]:line-clamp-2 [&>a]:wrap-anywhere"
    >
      {browserStorageViews.map((view) => (
        <Link
          {...APP_SIDEBAR_NAVIGATION_LINK_PROPS}
          key={view.path}
          data-testid={view.testId}
          to={view.path}
        >
          {view.path}
        </Link>
      ))}
    </nav>
  );
}
