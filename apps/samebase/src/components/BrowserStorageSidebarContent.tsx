import { INDEXED_DB_ROUTE } from "@/lib/indexedDbRoute";
import { LOCAL_STORAGE_ROUTE } from "@/lib/localStorageRoute";
import { Link } from "@tanstack/react-router";

type BrowserStorageView = "indexDB" | "localStorage";

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

export function BrowserStorageSidebarContent({ currentView }: { currentView: BrowserStorageView }) {
  return (
    <nav
      aria-label="Storage views"
      className="flex flex-col items-start gap-3 overflow-hidden px-2 py-3 text-base text-muted-foreground [&>a]:max-w-full [&>a]:line-clamp-2 [&>a]:wrap-anywhere"
    >
      {browserStorageViews.map((view) => (
        <Link
          key={view.view}
          aria-current={view.view === currentView ? "page" : undefined}
          data-testid={view.testId}
          to={view.path}
        >
          {view.path}
        </Link>
      ))}
    </nav>
  );
}
