import { useRef, useState } from "react";
import { ConvexError } from "convex/values";
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
  return error instanceof ConvexError && typeof error.data === "string"
    ? error.data
    : "The folder could not be updated.";
}

export function VaultFolderDialog(props: VaultFolderDialogProps) {
  const [name, setName] = useState(props.kind === "create" ? "" : props.folderName);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitPending = useRef(false);
  const isDelete = props.kind === "delete";

  const title =
    props.kind === "create"
      ? "New folder"
      : props.kind === "rename"
        ? "Rename folder"
        : "Delete folder";

  async function submit() {
    if (submitPending.current) {
      return;
    }

    submitPending.current = true;
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
      submitPending.current = false;
      setPending(false);
    }
  }

  const submitLabel =
    props.kind === "create"
      ? pending
        ? "Creating"
        : "Create folder"
      : pending
        ? "Renaming"
        : "Rename folder";

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
          {props.kind === "delete" && props.vaultCount > 0 ? (
            <DialogDescription>
              {props.vaultCount} {props.vaultCount === 1 ? "vault will" : "vaults will"} move to
              Unfiled. The vaults will not be deleted.
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {isDelete ? (
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
              disabled={pending}
              type="button"
              variant="destructive"
              onClick={() => void submit()}
            >
              {pending ? "Deleting" : "Delete folder"}
            </Button>
          </DialogFooter>
        ) : (
          <form
            className="grid gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Input
              aria-invalid={error ? true : undefined}
              aria-label="Folder name"
              autoFocus
              disabled={pending}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                disabled={pending}
                type="button"
                variant="outline"
                onClick={() => props.onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button disabled={pending || name.trim().length === 0} type="submit">
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        )}
        {isDelete && error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </AppDialogContent>
    </Dialog>
  );
}
