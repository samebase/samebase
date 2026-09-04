import { RepositoryWorkspacePaneHeader } from "@/repository/editor/RepositoryWorkspacePaneHeader";

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
            <span className="hidden max-w-[18rem] shrink-0 truncate text-sm font-medium @2xl:block">
              {headerTitle}
            </span>
          ) : null}
        </div>
      }
    />
  );
}
