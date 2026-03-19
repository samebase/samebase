import { useCallback, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/dialog";
import { Input } from "@/components/input";
import { Label } from "@/components/label";

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

const assertNever = (value: never): never => {
  throw new Error(`Unhandled provider: ${String(value)}`);
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
  const isConnectingApiKeyRef = useRef(false);
  const apiKeyInputId = useId();
  const apiKeyErrorId = `${apiKeyInputId}-error`;

  const openApiKeyDialog = useCallback((provider: ApiKeyProvider) => {
    setApiKeyDialogProvider(provider);
    setApiKeyInput("");
    setApiKeyError(null);
  }, []);

  const closeApiKeyDialog = useCallback(() => {
    if (isConnectingApiKeyRef.current) {
      return;
    }
    setApiKeyDialogProvider(null);
    setApiKeyInput("");
    setApiKeyError(null);
  }, []);

  const handleConnectWithApiKey = useCallback(async () => {
    if (!apiKeyDialogProvider || isConnectingApiKeyRef.current) {
      return;
    }

    const token = apiKeyInput.trim();
    if (!token) {
      setApiKeyError("API key is required.");
      return;
    }

    isConnectingApiKeyRef.current = true;
    setIsConnectingApiKey(true);
    setApiKeyError(null);

    try {
      switch (apiKeyDialogProvider) {
        case "github":
          await connectGithubWithApiKey({ token });
          break;
        case "convex":
          await connectConvexWithApiKey({ token });
          break;
        case "netlify":
          await connectNetlifyWithApiKey({ token });
          break;
        default:
          assertNever(apiKeyDialogProvider);
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
      isConnectingApiKeyRef.current = false;
      setIsConnectingApiKey(false);
    }
  }, [
    apiKeyDialogProvider,
    apiKeyInput,
    connectConvexWithApiKey,
    connectGithubWithApiKey,
    connectNetlifyWithApiKey,
  ]);

  const apiKeyProviderLabel = getApiKeyProviderLabel(apiKeyDialogProvider);
  const apiKeySubmitLabel = isConnectingApiKey
    ? "Connecting..."
    : `Connect ${apiKeyProviderLabel}`;

  const apiKeyDialog = useMemo(
    () => (
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
            <Label htmlFor={apiKeyInputId}>
              {`${apiKeyProviderLabel} API key`}
            </Label>
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
    [
      apiKeyDialogProvider,
      apiKeyError,
      apiKeyErrorId,
      apiKeyInput,
      apiKeyInputId,
      apiKeyProviderLabel,
      apiKeySubmitLabel,
      closeApiKeyDialog,
      handleConnectWithApiKey,
      isConnectingApiKey,
    ],
  );

  return {
    openApiKeyDialog,
    apiKeyDialog,
  };
};
