import { useState } from "react";
import type { ReactMutation } from "convex/react";
import type { FunctionReference } from "convex/server";
import { FolderPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { RepositoryFolderDialog } from "./RepositoryFolderDialog";

type RepositoryFolderMutation<Mutation extends FunctionReference<"mutation">> = (
  ...args: Parameters<ReactMutation<Mutation>>
) => Promise<void | Awaited<ReturnType<ReactMutation<Mutation>>>>;

export type RepositoryFolderCreate = RepositoryFolderMutation<
  typeof api.repository.folders.createRepositoryFolder
>;

export function RepositoryFolderCreateButton({
  organizationId,
  organizationName,
  onCreateRepositoryFolder,
}: {
  organizationId: Id<"organizations">;
  organizationName: string;
  onCreateRepositoryFolder: RepositoryFolderCreate;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Button
        aria-label={`New folder for ${organizationName}`}
        className="size-8 shrink-0"
        size="icon"
        title="New folder"
        type="button"
        variant="ghost"
        onClick={() => setDialogOpen(true)}
      >
        <FolderPlus />
      </Button>
      {dialogOpen ? (
        <RepositoryFolderDialog
          kind="create"
          onCreate={(name) => onCreateRepositoryFolder({ name, organizationId })}
          onOpenChange={(open) => {
            if (!open) {
              setDialogOpen(false);
            }
          }}
        />
      ) : null}
    </>
  );
}
