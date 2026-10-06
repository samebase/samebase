import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
} from "@/components/repository-dashboard/RepositoryDashboardLogos";
import { useAction, useMutation, useQuery as useConvexQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { ExternalLink, Loader2 } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { buildCloudflareCiApiTokenUrl } from "../../../shared/cloudflareResourceUrls";

type CiCredentialsStatus = (typeof api.users.getCiCredentialsStatus)["_returnType"];
type SavedCiCredential = NonNullable<CiCredentialsStatus["cloudflare" | "convex"]>;

function CiCredentialRow({
  canManageOrganization,
  connected,
  help,
  icon,
  inputLabel,
  label,
  missingConnection,
  onRemove,
  onSave,
  saved,
}: {
  canManageOrganization: boolean;
  connected: boolean;
  help: ReactNode;
  icon: ReactNode;
  inputLabel: string;
  label: string;
  missingConnection: string;
  onRemove: () => Promise<unknown>;
  onSave: (token: string) => Promise<unknown>;
  saved: SavedCiCredential | null;
}) {
  const inputId = useId();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "remove" | null>(null);

  const run = async (kind: "save" | "remove", write: () => Promise<unknown>) => {
    setPending(kind);
    setError(null);
    try {
      await write();
      setToken("");
    } catch (writeError) {
      setError(
        writeError instanceof ConvexError && typeof writeError.data === "string"
          ? writeError.data
          : `Could not ${kind} the ${label}.`,
      );
    } finally {
      setPending(null);
    }
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = token.trim();
    if (trimmed && pending === null) {
      void run("save", () => onSave(trimmed));
    }
  };

  return (
    <div
      data-testid="ci-credential-row"
      className="flex flex-wrap items-start gap-3 border-b border-border/50 pb-5 last:border-b-0"
    >
      <div className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</div>
      <div className="min-w-0 flex-1 basis-80">
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {saved ? (
            <>
              Saved
              {saved.connectedBy ? (
                <>
                  {" by "}
                  <span className="font-medium text-foreground">{saved.connectedBy.label}</span>
                </>
              ) : null}
            </>
          ) : (
            "Not saved"
          )}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">{help}</div>
        {canManageOrganization ? (
          <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={handleSubmit}>
            <Label htmlFor={inputId} className="sr-only">
              {inputLabel}
            </Label>
            <Input
              id={inputId}
              type="password"
              autoComplete="off"
              className="basis-60 flex-1"
              disabled={!connected || pending !== null}
              placeholder={connected ? inputLabel : missingConnection}
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                setError(null);
              }}
            />
            <Button
              type="submit"
              size="sm"
              disabled={!connected || pending !== null || !token.trim()}
            >
              {pending === "save" ? <Loader2 className="animate-spin" /> : null}
              {pending === "save" ? "Saving..." : "Save"}
            </Button>
            {saved ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending !== null}
                onClick={() => {
                  void run("remove", onRemove);
                }}
              >
                {pending === "remove" ? <Loader2 className="animate-spin" /> : null}
                {pending === "remove" ? "Removing..." : "Remove"}
              </Button>
            ) : null}
          </form>
        ) : null}
        {error ? (
          <p role="alert" className="mt-2 text-xs text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
The two tokens that Samebase writes as GitHub Actions secrets into a repository that its GitHub
Actions set up. Samebase's own provider connections above never go into a repository.
*/
export function CiCredentialsSection({
  canManageOrganization,
  cloudflareAccountId,
  convexConnected,
  githubOwnerLogin,
  organizationId,
}: {
  canManageOrganization: boolean;
  /** The connected Cloudflare account; null while Cloudflare is not connected. */
  cloudflareAccountId: string | null;
  convexConnected: boolean;
  githubOwnerLogin: string;
  organizationId: Id<"organizations">;
}) {
  const status = useConvexQuery(api.users.getCiCredentialsStatus, { organizationId });
  const setCloudflareCiToken = useAction(api.users.setCloudflareCiToken);
  const setConvexCiToken = useAction(api.users.setConvexCiToken);
  const removeCiToken = useMutation(api.users.removeCiToken);
  if (status === undefined) {
    return null;
  }

  return (
    <section data-testid="ci-credentials" className="mt-10 max-w-3xl">
      <h2 className="text-sm font-medium">CI credentials</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Samebase writes these tokens as secrets into each repository that GitHub Actions set up.
      </p>
      <div className="mt-5 space-y-5">
        <CiCredentialRow
          canManageOrganization={canManageOrganization}
          connected={cloudflareAccountId !== null}
          help={
            <>
              A user API token from{" "}
              {cloudflareAccountId === null ? (
                "Cloudflare API tokens"
              ) : (
                <a
                  className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4"
                  href={buildCloudflareCiApiTokenUrl({
                    accountId: cloudflareAccountId,
                    tokenName: `samebase actions ci ${githubOwnerLogin}`,
                  })}
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  Cloudflare API tokens
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              )}{" "}
              for the connected account, with these permissions: Account Settings Read, Workers
              Scripts Edit, Secrets Store Edit.
            </>
          }
          icon={<CloudflareProviderLogo />}
          inputLabel="Cloudflare API token"
          label="Cloudflare CI token"
          missingConnection="Connect Cloudflare first"
          onRemove={() => removeCiToken({ organizationId, provider: "cloudflare" })}
          onSave={(token) => setCloudflareCiToken({ organizationId, token })}
          saved={status.cloudflare}
        />
        <CiCredentialRow
          canManageOrganization={canManageOrganization}
          connected={convexConnected}
          help="A team access token from the settings of the connected Convex team."
          icon={<ConvexProviderLogo />}
          inputLabel="Convex team access token"
          label="Convex CI token"
          missingConnection="Connect Convex first"
          onRemove={() => removeCiToken({ organizationId, provider: "convex" })}
          onSave={(token) => setConvexCiToken({ organizationId, token })}
          saved={status.convex}
        />
      </div>
    </section>
  );
}
