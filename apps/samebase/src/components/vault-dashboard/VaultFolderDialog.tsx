import { useState } from "react";
import { AppDialogContent } from "@/components/AppDialogContent";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type VaultFolderDialogProps =
  | {
      kind: "create";
      onCreate: (name: string) => Promise<unknown>;
      onOpenChange: (open: boolean) => void;
    }
  | {
      folderName: string;
      kind: "rename";
      onOpenChange: (open: boolean) => void;
      onRename: (name: string) => Promise<unknown>;
    }
  | {
      folderName: string;
      kind: "delete";
      onDelete: () => Promise<unknown>;
      onOpenChange: (open: boolean) => void;
      vaultCount: number;
    };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The folder could not be saved.";
}

export function VaultFolderDialog(props: VaultFolderDialogProps) {
  const [name, setName] = useState(props.kind === "create" ? "" : props.folderName);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isDelete = props.kind === "delete";

  const title =
    props.kind === "create"
      ? "New folder"
      : props.kind === "rename"
        ? "Rename folder"
        : "Delete folder";

  async function submit() {
    setPending(true);
    setError(null);

    try {
      if (props.kind === "create") {
        await props.onCreate(name);
      } else if (props.kind === "rename") {
        await props.onRename(name);
      } else {
        await props.onDelete();
      }
      props.onOpenChange(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!pending) {
          props.onOpenChange(open);
        }
      }}
    >
      <AppDialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {props.kind === "delete" ? (
            <DialogDescription>
              {props.vaultCount} {props.vaultCount === 1 ? "vault will" : "vaults will"} move to
              Ungrouped. The vaults will not be deleted.
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {isDelete ? null : (
          <Input
            aria-label="Folder name"
            autoFocus
            disabled={pending}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button
            disabled={pending}
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={pending || (!isDelete && name.trim().length === 0)}
            type="button"
            variant={isDelete ? "destructive" : "default"}
            onClick={() => void submit()}
          >
            {pending
              ? isDelete
                ? "Deleting"
                : "Saving"
              : isDelete
                ? "Delete folder"
                : "Save folder"}
          </Button>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}
