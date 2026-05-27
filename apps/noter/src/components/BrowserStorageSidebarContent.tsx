import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { INDEXED_DB_ROUTE } from "@/lib/indexedDbRoute";
import { LOCAL_STORAGE_ROUTE } from "@/lib/localStorageRoute";

type BrowserStorageView = "indexedDB" | "localStorage";

const browserStorageViews = [
  {
    label: "localStorage",
    path: LOCAL_STORAGE_ROUTE,
    testId: "local-storage-sidebar-file",
    view: "localStorage",
  },
  {
    label: "indexedDB",
    path: INDEXED_DB_ROUTE,
    testId: "indexed-db-sidebar-file",
    view: "indexedDB",
  },
] as const satisfies readonly {
  label: string;
  path: string;
  testId: string;
  view: BrowserStorageView;
}[];

const BROWSER_STORAGE_SIDEBAR_ROW_CLASS_NAME =
  "flex h-8 min-w-0 items-center gap-2 px-2 text-sm font-medium";

export function BrowserStorageSidebarContent({ currentView }: { currentView: BrowserStorageView }) {
  return (
    <nav aria-label="Storage views" className="px-1 py-2">
      {browserStorageViews.map((view) => {
        const content = (
          <>
            <FileText className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">{view.label}</span>
          </>
        );

        if (view.view === currentView) {
          return (
            <div
              key={view.view}
              aria-current="page"
              data-testid={view.testId}
              className={BROWSER_STORAGE_SIDEBAR_ROW_CLASS_NAME}
            >
              {content}
            </div>
          );
        }

        return (
          <Link
            key={view.view}
            data-testid={view.testId}
            to={view.path}
            className={BROWSER_STORAGE_SIDEBAR_ROW_CLASS_NAME}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
