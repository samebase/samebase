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

type ConnectWithToken = (args: { token: string }) => Promise<unknown>;

const API_CREDENTIAL_COPY = {
  cloudflare: {
    connectLabel: "Connect Cloudflare",
    description: "Paste a Cloudflare user API token.",
    emptyError: "API token is required.",
    failureMessage: "Could not connect Cloudflare.",
    inputLabel: "Cloudflare user API token",
    title: "Connect Cloudflare with API token",
  },
  convex: {
    connectLabel: "Connect Convex",
    description: "Paste a Convex team token.",
    emptyError: "Team token is required.",
    failureMessage: "Could not connect Convex.",
    inputLabel: "Convex team token",
    title: "Connect Convex with API key",
  },
} as const;

type ApiKeyDialogProvider = keyof typeof API_CREDENTIAL_COPY;

type UseApiKeyConnectDialogArgs = {
  connectWithToken: ConnectWithToken;
  provider: ApiKeyDialogProvider;
};

export const useApiKeyConnectDialog = ({
  connectWithToken,
  provider,
}: UseApiKeyConnectDialogArgs) => {
  const copy = API_CREDENTIAL_COPY[provider];
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
      setApiKeyError(copy.emptyError);
      return;
    }

    isConnectingApiKeyRef.current = true;
    setIsConnectingApiKey(true);
    setApiKeyError(null);

    try {
      await connectWithToken({ token });
      setIsApiKeyDialogOpen(false);
      setApiKeyInput("");
      setApiKeyError(null);
    } catch (error) {
      setApiKeyError(error instanceof Error ? error.message : copy.failureMessage);
    } finally {
      isConnectingApiKeyRef.current = false;
      setIsConnectingApiKey(false);
    }
  }, [apiKeyInput, connectWithToken, copy.emptyError, copy.failureMessage, isApiKeyDialogOpen]);

  const apiKeySubmitLabel = isConnectingApiKey ? "Connecting..." : copy.connectLabel;

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
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={apiKeyInputId}>{copy.inputLabel}</Label>
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
              placeholder={copy.inputLabel}
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
      copy.description,
      copy.inputLabel,
      copy.title,
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
