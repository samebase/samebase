import {
  Pencil1Icon,
  PlusIcon,
  TrashIcon,
  UpdateIcon,
} from "@radix-ui/react-icons";
import { api } from "convex/_generated/api";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { linkStyle } from "./styles";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

type StagedFile = NonNullable<
  Awaited<(typeof api.fileStaging.getByNewPath)["_returnType"]>
>;

// Helper function to categorize staged files by change type
export function categorizeStagedFiles(stagedFiles: StagedFile[]) {
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

export function EditedFilesCategoriesPopoverTrigger({
  categories,
}: {
  categories: ReturnType<typeof categorizeStagedFiles>;
}) {
  // Single line with all categories and different colors
  return (
    <div className="flex items-center gap-3">
      {categories.modified.length > 0 && (
        <div className="flex items-center gap-1 text-blue-600">
          <Pencil1Icon className="w-3 h-3" />
          <span className="text-xs">{categories.modified.length}</span>
        </div>
      )}
      {categories.deleted.length > 0 && (
        <div className="flex items-center gap-1 text-red-600">
          <TrashIcon className="w-3 h-3" />
          <span className="text-xs">{categories.deleted.length}</span>
        </div>
      )}
      {categories.new.length > 0 && (
        <div className="flex items-center gap-1 text-green-600">
          <PlusIcon className="w-3 h-3" />
          <span className="text-xs">{categories.new.length}</span>
        </div>
      )}
      {categories.renamed.length > 0 && (
        <div className="flex items-center gap-1 text-purple-600">
          <UpdateIcon className="w-3 h-3" />
          <span className="text-xs">{categories.renamed.length}</span>
        </div>
      )}
      {categories.renamedAndModified.length > 0 && (
        <div className="flex items-center gap-1 text-orange-600">
          <UpdateIcon className="w-3 h-3" />
          <Pencil1Icon className="w-3 h-3" />
          <span className="text-xs">
            {categories.renamedAndModified.length}
          </span>
        </div>
      )}
    </div>
  );
}

export function EditedFilesCategories({
  categories,
  repositoryFullName,
  branch,
}: {
  categories: ReturnType<typeof categorizeStagedFiles>;
  repositoryFullName: string;
  branch: string;
}) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const navigateToDiffViewer = useCallback(
    (filePath: string) => {
      const searchParams = new URLSearchParams(search);
      searchParams.delete("diff");
      const baseQuery = searchParams.toString();
      const queryString = baseQuery.length > 0 ? `${baseQuery}&diff` : "diff";

      void navigate(
        `/vault/${repositoryFullName}/${branch}/${filePath}?${queryString}`,
      );
    },
    [branch, navigate, repositoryFullName, search],
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
                navigateToDiffViewer(file.filePath);
              }}
              className={`block text-xs text-left hover:bg-muted/50 transition-colors p-1 rounded truncate w-full ${linkStyle}`}
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
                navigateToDiffViewer(file.filePath);
              }}
              className={`block text-xs text-left hover:bg-muted/50 transition-colors p-1 rounded truncate w-full ${linkStyle}`}
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
                navigateToDiffViewer(file.filePath);
              }}
              className={`block text-xs text-left hover:bg-muted/50 transition-colors p-1 rounded truncate w-full ${linkStyle}`}
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
            <div
              key={file.filePath}
              className="block text-xs text-left p-1 rounded truncate w-full text-muted-foreground line-through"
            >
              {file.filePath}
            </div>
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
                navigateToDiffViewer(file.filePath);
              }}
              className={`block text-xs text-left hover:bg-muted/50 transition-colors p-1 rounded truncate w-full ${linkStyle}`}
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
  repositoryFullName,
  branch,
  stagedFiles,
}: {
  repositoryFullName: string;
  branch: string;
  stagedFiles: StagedFile[];
}) {
  const categories = categorizeStagedFiles(stagedFiles);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`text-xs text-muted-foreground ${linkStyle} flex items-center gap-2`}
        >
          <div className="flex items-center gap-1">
            <EditedFilesCategoriesPopoverTrigger categories={categories} />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-80 p-3">
        <div className="space-y-3">
          <div className="text-sm font-medium">Staged Changes</div>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            <EditedFilesCategories
              categories={categories}
              repositoryFullName={repositoryFullName}
              branch={branch}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
