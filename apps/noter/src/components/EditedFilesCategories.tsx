import {
  Pencil1Icon,
  PlusIcon,
  TrashIcon,
  UpdateIcon,
} from "@radix-ui/react-icons";
import { api } from "../../convex/_generated/api";
import { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { linkStyle } from "./styles";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import { buildPathWithUpdatedQuery, setQueryParam } from "@/lib/queryParams";
import type { Id } from "../../convex/_generated/dataModel";

type StagedFile = NonNullable<
  Awaited<(typeof api.fileStaging.getByNewPath)["_returnType"]>
>;
type StagedFilesSummary = NonNullable<
  (typeof api.fileStaging.listStagedFilesBranchSummaries)["_returnType"]
>[number]["counts"];

const EMPTY_STAGED_FILES_SUMMARY: StagedFilesSummary = {
  modified: 0,
  deleted: 0,
  new: 0,
  renamed: 0,
  renamedAndModified: 0,
  total: 0,
};

// Helper function to categorize staged files by change type
function categorizeStagedFiles(stagedFiles: StagedFile[]) {
  const categories: {
    deleted: StagedFile[];
    renamed: StagedFile[];
    renamedAndModified: StagedFile[];
    modified: StagedFile[];
    new: StagedFile[];
  } = {
    deleted: [],
    renamed: [],
    renamedAndModified: [],
    modified: [],
    new: [],
  };

  stagedFiles.forEach((file) => {
    if (file.fileDeleted) {
      categories.deleted.push(file);
    } else if (file.parentCommitSha === null) {
      // New files (parentCommitSha is null)
      categories.new.push(file);
    } else if (file.filePath !== file.initialFilePath) {
      // It's a rename
      if (file.content !== file.initialContent) {
        // Renamed AND modified
        categories.renamedAndModified.push(file);
      } else {
        // Just renamed
        categories.renamed.push(file);
      }
    } else if (file.content !== file.initialContent) {
      // Just modified
      categories.modified.push(file);
    }
  });

  return categories;
}

function summarizeCategories(
  categories: ReturnType<typeof categorizeStagedFiles>,
): StagedFilesSummary {
  const modified = categories.modified.length;
  const deleted = categories.deleted.length;
  const renamed = categories.renamed.length;
  const renamedAndModified = categories.renamedAndModified.length;
  const created = categories.new.length;

  return {
    modified,
    deleted,
    new: created,
    renamed,
    renamedAndModified,
    total: modified + deleted + created + renamed + renamedAndModified,
  };
}

export function EditedFilesCategoriesPopoverTrigger({
  counts,
}: {
  counts: StagedFilesSummary;
}) {
  // Single line with all categories and different colors
  return (
    <div className="flex items-center gap-3">
      {counts.modified > 0 && (
        <div className="flex items-center gap-1 text-blue-600">
          <Pencil1Icon className="w-3 h-3" />
          <span className="text-xs">{counts.modified}</span>
        </div>
      )}
      {counts.deleted > 0 && (
        <div className="flex items-center gap-1 text-red-600">
          <TrashIcon className="w-3 h-3" />
          <span className="text-xs">{counts.deleted}</span>
        </div>
      )}
      {counts.new > 0 && (
        <div className="flex items-center gap-1 text-green-600">
          <PlusIcon className="w-3 h-3" />
          <span className="text-xs">{counts.new}</span>
        </div>
      )}
      {counts.renamed > 0 && (
        <div className="flex items-center gap-1 text-purple-600">
          <UpdateIcon className="w-3 h-3" />
          <span className="text-xs">{counts.renamed}</span>
        </div>
      )}
      {counts.renamedAndModified > 0 && (
        <div className="flex items-center gap-1 text-orange-600">
          <UpdateIcon className="w-3 h-3" />
          <Pencil1Icon className="w-3 h-3" />
          <span className="text-xs">{counts.renamedAndModified}</span>
        </div>
      )}
    </div>
  );
}

export function EditedFilesCategories({
  categories,
  repositoryFullName,
  branch,
  onFileSelected,
}: {
  categories: ReturnType<typeof categorizeStagedFiles>;
  repositoryFullName: string;
  branch: string;
  onFileSelected?: () => void;
}) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const navigateToStagedFile = useCallback(
    (file: StagedFile) => {
      const encodedFilePath = file.filePath
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
      const encodedBranch = encodeURIComponent(branch);
      const nextPath = `/vault/${repositoryFullName}/${encodedBranch}/${encodedFilePath}`;
      onFileSelected?.();
      void navigate(
        buildPathWithUpdatedQuery(
          {
            pathname: nextPath,
            search,
          },
          (searchParams) => {
            // Deleted files should open in the same diff-first review route as
            // deleted rows in the sidebar tree.
            setQueryParam(searchParams, "diff", file.fileDeleted);
            setQueryParam(searchParams, "review", !file.fileDeleted);
          },
        ),
      );
    },
    [branch, navigate, onFileSelected, repositoryFullName, search],
  );
  const sections = [];

  if (categories.modified.length > 0) {
    sections.push(
      <div key="modified" className="space-y-1">
        <div className="flex items-center gap-2 text-xs font-medium text-blue-600">
          <Pencil1Icon className="w-3 h-3" />
          Modified ({categories.modified.length})
        </div>
        <div className="space-y-1 pl-5">
          {categories.modified.map((file) => (
            <button
              key={file.filePath}
              onClick={() => {
                navigateToStagedFile(file);
              }}
              className={`block text-xs text-left hover:bg-muted/50 transition-colors p-1 corner-notch-1 truncate w-full ${linkStyle}`}
            >
              {file.filePath}
            </button>
          ))}
        </div>
      </div>,
    );
  }

  if (categories.renamed.length > 0) {
    sections.push(
      <div key="renamed" className="space-y-1">
        <div className="flex items-center gap-2 text-xs font-medium text-purple-600">
          <UpdateIcon className="w-3 h-3" />
          Renamed ({categories.renamed.length})
        </div>
        <div className="space-y-1 pl-5">
          {categories.renamed.map((file) => (
            <button
              key={file.filePath}
              onClick={() => {
                navigateToStagedFile(file);
              }}
              className={`block text-xs text-left hover:bg-muted/50 transition-colors p-1 corner-notch-1 truncate w-full ${linkStyle}`}
            >
              <div className="text-muted-foreground">
                {file.initialFilePath} →
              </div>
              <div className="font-medium">{file.filePath}</div>
            </button>
          ))}
        </div>
      </div>,
    );
  }

  if (categories.renamedAndModified.length > 0) {
    sections.push(
      <div key="renamedAndModified" className="space-y-1">
        <div className="flex items-center gap-2 text-xs font-medium text-orange-600">
          <UpdateIcon className="w-3 h-3" />
          <Pencil1Icon className="w-2.5 h-2.5" />
          Renamed & Modified ({categories.renamedAndModified.length})
        </div>
        <div className="space-y-1 pl-5">
          {categories.renamedAndModified.map((file) => (
            <button
              key={file.filePath}
              onClick={() => {
                navigateToStagedFile(file);
              }}
              className={`block text-xs text-left hover:bg-muted/50 transition-colors p-1 corner-notch-1 truncate w-full ${linkStyle}`}
            >
              <div className="text-muted-foreground">
                {file.initialFilePath} →
              </div>
              <div className="font-medium">{file.filePath}</div>
            </button>
          ))}
        </div>
      </div>,
    );
  }

  if (categories.deleted.length > 0) {
    sections.push(
      <div key="deleted" className="space-y-1">
        <div className="flex items-center gap-2 text-xs font-medium text-red-600">
          <TrashIcon className="w-3 h-3" />
          Deleted ({categories.deleted.length})
        </div>
        <div className="space-y-1 pl-5">
          {categories.deleted.map((file) => (
            <button
              key={file.filePath}
              onClick={() => {
                navigateToStagedFile(file);
              }}
              className={`block text-xs text-left hover:bg-muted/50 transition-colors p-1 corner-notch-1 truncate w-full text-muted-foreground line-through ${linkStyle}`}
            >
              {file.filePath}
            </button>
          ))}
        </div>
      </div>,
    );
  }

  if (categories.new.length > 0) {
    sections.push(
      <div key="new" className="space-y-1">
        <div className="flex items-center gap-2 text-xs font-medium text-green-600">
          <PlusIcon className="w-3 h-3" />
          New ({categories.new.length})
        </div>
        <div className="space-y-1 pl-5">
          {categories.new.map((file) => (
            <button
              key={file.filePath}
              onClick={() => {
                navigateToStagedFile(file);
              }}
              className={`block text-xs text-left hover:bg-muted/50 transition-colors p-1 corner-notch-1 truncate w-full ${linkStyle}`}
            >
              {file.filePath}
            </button>
          ))}
        </div>
      </div>,
    );
  }

  return sections;
}

export function EditedFilesCategoriesPopover({
  vaultId,
  repositoryFullName,
  branch,
  stagedFiles,
  summaryCounts,
}: {
  vaultId?: Id<"vaults">;
  repositoryFullName: string;
  branch: string;
  stagedFiles?: StagedFile[];
  summaryCounts?: StagedFilesSummary;
}) {
  const [open, setOpen] = useState(false);
  const shouldLoadStagedFiles =
    open && stagedFiles === undefined && vaultId !== undefined;
  const stagedFilesFromQuery = useQuery(
    api.fileStaging.listStagedFiles,
    shouldLoadStagedFiles ? { vaultId, branch } : "skip",
  );
  const resolvedStagedFiles =
    stagedFiles ??
    (stagedFilesFromQuery === undefined ? undefined : stagedFilesFromQuery);
  const categories =
    resolvedStagedFiles !== undefined
      ? categorizeStagedFiles(resolvedStagedFiles)
      : null;
  const counts =
    categories !== null
      ? summarizeCategories(categories)
      : summaryCounts ?? EMPTY_STAGED_FILES_SUMMARY;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`text-xs text-muted-foreground ${linkStyle} flex items-center gap-2`}
        >
          <div className="flex items-center gap-1">
            <EditedFilesCategoriesPopoverTrigger counts={counts} />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-80 p-3">
        <div className="space-y-3">
          <div className="text-sm font-medium">Staged Changes</div>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {categories !== null && (
              <EditedFilesCategories
                categories={categories}
                repositoryFullName={repositoryFullName}
                branch={branch}
                onFileSelected={() => setOpen(false)}
              />
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
