import { useCallback, useId, useMemo, useRef, useState } from "react";
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
import { Label } from "@/components/ui/label";

type ConnectWithApiKey = (args: { token: string }) => Promise<unknown>;

type UseApiKeyConnectDialogArgs = {
  connectConvexWithApiKey: ConnectWithApiKey;
};

export const useApiKeyConnectDialog = ({ connectConvexWithApiKey }: UseApiKeyConnectDialogArgs) => {
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [isConnectingApiKey, setIsConnectingApiKey] = useState(false);
  const isConnectingApiKeyRef = useRef(false);
  const apiKeyInputId = useId();
  const apiKeyErrorId = `${apiKeyInputId}-error`;

  const openApiKeyDialog = useCallback(() => {
    setIsApiKeyDialogOpen(true);
    setApiKeyInput("");
    setApiKeyError(null);
  }, []);

  const closeApiKeyDialog = useCallback(() => {
    if (isConnectingApiKeyRef.current) {
      return;
    }
    setIsApiKeyDialogOpen(false);
    setApiKeyInput("");
    setApiKeyError(null);
  }, []);

  const handleConnectWithApiKey = useCallback(async () => {
    if (!isApiKeyDialogOpen || isConnectingApiKeyRef.current) {
      return;
    }

    const token = apiKeyInput.trim();
    if (!token) {
      setApiKeyError("Team token is required.");
      return;
    }

    isConnectingApiKeyRef.current = true;
    setIsConnectingApiKey(true);
    setApiKeyError(null);

    try {
      await connectConvexWithApiKey({ token });
      setIsApiKeyDialogOpen(false);
      setApiKeyInput("");
      setApiKeyError(null);
    } catch (error) {
      setApiKeyError(error instanceof Error ? error.message : "Could not connect Convex.");
    } finally {
      isConnectingApiKeyRef.current = false;
      setIsConnectingApiKey(false);
    }
  }, [apiKeyInput, connectConvexWithApiKey, isApiKeyDialogOpen]);

  const apiKeySubmitLabel = isConnectingApiKey ? "Connecting..." : "Connect Convex";

  const apiKeyDialog = useMemo(
    () => (
      <Dialog
        open={isApiKeyDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeApiKeyDialog();
          }
        }}
      >
        <AppDialogContent>
          <DialogHeader>
            <DialogTitle>Connect Convex with API key</DialogTitle>
            <DialogDescription>Paste a Convex team token.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={apiKeyInputId}>Convex team token</Label>
            <Input
              id={apiKeyInputId}
              type="password"
              autoComplete="off"
              value={apiKeyInput}
              onChange={(event) => {
                setApiKeyInput(event.target.value);
                if (apiKeyError) {
                  setApiKeyError(null);
                }
              }}
              placeholder="Convex team token"
              disabled={isConnectingApiKey}
              aria-invalid={apiKeyError !== null}
              aria-describedby={apiKeyError ? apiKeyErrorId : undefined}
            />
            {apiKeyError ? (
              <p
                id={apiKeyErrorId}
                role="alert"
                aria-live="assertive"
                className="text-xs text-red-600"
              >
                {apiKeyError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeApiKeyDialog} disabled={isConnectingApiKey}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                void handleConnectWithApiKey();
              }}
              disabled={isConnectingApiKey || apiKeyInput.trim().length === 0}
            >
              {apiKeySubmitLabel}
            </Button>
          </DialogFooter>
        </AppDialogContent>
      </Dialog>
    ),
    [
      apiKeyError,
      apiKeyErrorId,
      apiKeyInput,
      apiKeyInputId,
      apiKeySubmitLabel,
      closeApiKeyDialog,
      handleConnectWithApiKey,
      isApiKeyDialogOpen,
      isConnectingApiKey,
    ],
  );

  return {
    openApiKeyDialog,
    apiKeyDialog,
  };
};
