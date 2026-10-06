import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CloudflareProviderLogo } from "@/components/repository-dashboard/RepositoryDashboardLogos";
import { useAction, useMutation, useQuery as useConvexQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { ExternalLink, Loader2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { buildCloudflareCiApiTokenUrl } from "../../../shared/cloudflareResourceUrls";

/**
The Cloudflare token that Samebase writes as a GitHub Actions secret into each repository that its
GitHub Actions set up. The Convex access token is not pasted: Samebase mints one per repository
through the organization's Convex OAuth connection. Samebase's own provider connections above never
go into a repository.
*/
export function CiCredentialsSection({
  canManageOrganization,
  cloudflareAccountId,
  githubOwnerLogin,
  organizationId,
}: {
  canManageOrganization: boolean;
  /** The connected Cloudflare account; null while Cloudflare is not connected. */
  cloudflareAccountId: string | null;
  githubOwnerLogin: string;
  organizationId: Id<"organizations">;
}) {
  const status = useConvexQuery(api.users.getCiCredentialsStatus, { organizationId });
  const setCloudflareCiToken = useAction(api.users.setCloudflareCiToken);
  const removeCloudflareCiToken = useMutation(api.users.removeCloudflareCiToken);
  const inputId = useId();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "remove" | null>(null);
  if (status === undefined) {
    return null;
  }

  const saved = status.cloudflare;
  const connected = cloudflareAccountId !== null;
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
          : `Could not ${kind} the Cloudflare CI token.`,
      );
    } finally {
      setPending(null);
    }
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = token.trim();
    if (trimmed && pending === null) {
      void run("save", () => setCloudflareCiToken({ organizationId, token: trimmed }));
    }
  };

  return (
    <section data-testid="ci-credentials" className="mt-10 max-w-3xl">
      <h2 className="text-sm font-medium">CI credentials</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Samebase writes this token as a secret into each repository that GitHub Actions set up. It
        mints each repository's Convex access token through the Convex OAuth connection.
      </p>
      <div className="mt-5 flex flex-wrap items-start gap-3">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center">
          <CloudflareProviderLogo />
        </div>
        <div className="min-w-0 flex-1 basis-80">
          <div className="text-sm font-medium">Cloudflare CI token</div>
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
          <div className="mt-2 text-xs text-muted-foreground">
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
          </div>
          {canManageOrganization ? (
            <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={handleSubmit}>
              <Label htmlFor={inputId} className="sr-only">
                Cloudflare API token
              </Label>
              <Input
                id={inputId}
                type="password"
                autoComplete="off"
                className="basis-60 flex-1"
                disabled={!connected || pending !== null}
                placeholder={connected ? "Cloudflare API token" : "Connect Cloudflare first"}
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
                    void run("remove", () => removeCloudflareCiToken({ organizationId }));
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
    </section>
  );
}
