import {
  Pencil1Icon,
  PlusIcon,
  TrashIcon,
  UpdateIcon,
} from "@radix-ui/react-icons";
import { api } from "convex/_generated/api";
import { useNavigate } from "react-router-dom";
import { linkStyle } from "./styles";

// Helper function to categorize staged files by change type
function categorizeStagedFiles(stagedFiles: any[]) {
  const categories = {
    deleted: [] as any[],
    renamed: [] as any[],
    renamedAndModified: [] as any[],
    modified: [] as any[],
    new: [] as any[],
  };

  stagedFiles.forEach((file) => {
    if (file.fileDeleted) {
      categories.deleted.push(file);
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
    } else {
      // This shouldn't normally happen, but just in case
      categories.new.push(file);
    }
  });

  return categories;
}

export function EditedFilesCategories({
  stagedFiles,
  repositoryFullName,
  branch,
}: {
  repositoryFullName: string;
  branch: string;
  stagedFiles: (typeof api.fileStaging.listStagedFiles)["_returnType"];
}) {
  const navigate = useNavigate();
  const categories = categorizeStagedFiles(stagedFiles);
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
                void navigate(
                  `/vault/${repositoryFullName}/${branch}/${file.filePath}`,
                );
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
                void navigate(
                  `/vault/${repositoryFullName}/${branch}/${file.filePath}`,
                );
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
                void navigate(
                  `/vault/${repositoryFullName}/${branch}/${file.filePath}`,
                );
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
                void navigate(
                  `/vault/${repositoryFullName}/${branch}/${file.filePath}`,
                );
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
