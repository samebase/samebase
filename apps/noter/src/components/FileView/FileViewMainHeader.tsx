import { RepositoryWorkspacePaneHeader } from "#src/components/RepositoryWorkspacePaneHeader.tsx";

export function FileViewMainHeader({
  currentUrl,
  headerTitle,
  onQuickOpen,
}: {
  currentUrl: string;
  headerTitle?: string;
  onQuickOpen: () => void;
}) {
  return (
    <RepositoryWorkspacePaneHeader
      onQuickOpen={onQuickOpen}
      middle={
        <div className="flex min-w-0 items-center gap-2">
          {headerTitle ? (
            <span className="block max-w-[40%] shrink-0 truncate text-sm font-medium">
              {headerTitle}
            </span>
          ) : null}
          <span
            data-testid="file-view-main-header-url"
            className="block min-w-0 flex-1 select-text truncate text-sm text-muted-foreground"
            title={currentUrl}
          >
            {currentUrl}
          </span>
        </div>
      }
    />
  );
}
