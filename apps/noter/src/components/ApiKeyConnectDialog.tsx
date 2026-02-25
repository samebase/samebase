import { useCallback, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type ApiKeyProvider = "github" | "convex" | "netlify";

type ConnectWithApiKey = (args: { token: string }) => Promise<unknown>;

type UseApiKeyConnectDialogArgs = {
  connectGithubWithApiKey: ConnectWithApiKey;
  connectConvexWithApiKey: ConnectWithApiKey;
  connectNetlifyWithApiKey: ConnectWithApiKey;
};

const getApiKeyProviderLabel = (provider: ApiKeyProvider | null): string => {
  if (provider === "github") return "GitHub";
  if (provider === "convex") return "Convex";
  if (provider === "netlify") return "Netlify";
  return "Provider";
};

export const useApiKeyConnectDialog = ({
  connectGithubWithApiKey,
  connectConvexWithApiKey,
  connectNetlifyWithApiKey,
}: UseApiKeyConnectDialogArgs) => {
  const [apiKeyDialogProvider, setApiKeyDialogProvider] =
    useState<ApiKeyProvider | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [isConnectingApiKey, setIsConnectingApiKey] = useState(false);
  const apiKeyInputId = useId();
  const apiKeyErrorId = `${apiKeyInputId}-error`;

  const openApiKeyDialog = useCallback((provider: ApiKeyProvider) => {
    setApiKeyDialogProvider(provider);
    setApiKeyInput("");
    setApiKeyError(null);
  }, []);

  const closeApiKeyDialog = useCallback(() => {
    if (isConnectingApiKey) {
      return;
    }
    setApiKeyDialogProvider(null);
    setApiKeyInput("");
    setApiKeyError(null);
  }, [isConnectingApiKey]);

  const handleConnectWithApiKey = useCallback(async () => {
    if (!apiKeyDialogProvider || isConnectingApiKey) {
      return;
    }

    const token = apiKeyInput.trim();
    if (!token) {
      setApiKeyError("API key is required.");
      return;
    }

    setIsConnectingApiKey(true);
    setApiKeyError(null);

    try {
      if (apiKeyDialogProvider === "github") {
        await connectGithubWithApiKey({ token });
      } else if (apiKeyDialogProvider === "convex") {
        await connectConvexWithApiKey({ token });
      } else {
        await connectNetlifyWithApiKey({ token });
      }
      setApiKeyDialogProvider(null);
      setApiKeyInput("");
      setApiKeyError(null);
    } catch (error) {
      setApiKeyError(
        error instanceof Error
          ? error.message
          : "Failed to connect using API key",
      );
    } finally {
      setIsConnectingApiKey(false);
    }
  }, [
    apiKeyDialogProvider,
    apiKeyInput,
    connectConvexWithApiKey,
    connectGithubWithApiKey,
    connectNetlifyWithApiKey,
    isConnectingApiKey,
  ]);

  const apiKeyProviderLabel = getApiKeyProviderLabel(apiKeyDialogProvider);
  const apiKeySubmitLabel = isConnectingApiKey
    ? "Connecting..."
    : `Connect ${apiKeyProviderLabel}`;

  return {
    openApiKeyDialog,
    apiKeyDialog: (
      <Dialog
        open={apiKeyDialogProvider !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeApiKeyDialog();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{`Connect ${apiKeyProviderLabel} with API key`}</DialogTitle>
            <DialogDescription>
              Paste your {apiKeyProviderLabel} API key or token to connect this
              account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={apiKeyInputId}>
              {`${apiKeyProviderLabel} API key`}
            </label>
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
              placeholder={`${apiKeyProviderLabel} API key`}
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
            <Button
              variant="outline"
              onClick={closeApiKeyDialog}
              disabled={isConnectingApiKey}
            >
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
        </DialogContent>
      </Dialog>
    ),
  };
};
