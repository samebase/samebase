import { RepositoryWorkspacePaneHeader } from "@/components/RepositoryWorkspacePaneHeader";
import { RouteUrlEditor } from "@/components/RouteUrlEditor";

export function FileViewMainHeader({
  headerTitle,
  onQuickOpen,
}: {
  headerTitle?: string;
  onQuickOpen: () => void;
}) {
  return (
    <RepositoryWorkspacePaneHeader
      onQuickOpen={onQuickOpen}
      middle={
        <div className="flex min-w-0 items-center gap-2">
          {headerTitle ? (
            <span className="hidden max-w-[28%] shrink-0 truncate text-sm font-medium md:block">
              {headerTitle}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <RouteUrlEditor />
          </div>
        </div>
      }
    />
  );
}
