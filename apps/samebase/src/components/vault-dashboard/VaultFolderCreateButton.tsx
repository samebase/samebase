import { useState } from "react";
import type { ReactMutation } from "convex/react";
import type { FunctionReference } from "convex/server";
import { FolderPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { VaultFolderDialog } from "./VaultFolderDialog";

type VaultFolderMutation<Mutation extends FunctionReference<"mutation">> = (
  ...args: Parameters<ReactMutation<Mutation>>
) => Promise<void | Awaited<ReturnType<ReactMutation<Mutation>>>>;

export type VaultFolderCreate = VaultFolderMutation<typeof api.vault.folders.createVaultFolder>;

export function VaultFolderCreateButton({
  organizationId,
  organizationName,
  onCreateVaultFolder,
}: {
  organizationId: Id<"organizations">;
  organizationName: string;
  onCreateVaultFolder: VaultFolderCreate;
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
        <VaultFolderDialog
          kind="create"
          onCreate={(name) => onCreateVaultFolder({ name, organizationId })}
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
