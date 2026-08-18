import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { linkStyle } from "@/components/styles";
import { DOCS_CLOUDFLARE_SETUP_ROUTE } from "@/routeSearch/landingPreview";
import { Link } from "@tanstack/react-router";

export type CloudflareBuildTokenOption = {
  name: string;
  uuid: string;
};

function formatCloudflareBuildTokenOption(
  token: CloudflareBuildTokenOption,
  tokens: readonly CloudflareBuildTokenOption[],
  lastUsedUuid: string | null,
): string {
  const duplicateName = tokens.some(
    (candidate) => candidate.uuid !== token.uuid && candidate.name === token.name,
  );
  const label = duplicateName ? `${token.name} (${token.uuid.slice(0, 8)})` : token.name;
  return token.uuid === lastUsedUuid ? `${label} · Last used` : label;
}

export function CloudflareBuildTokenField({
  disabled,
  emptyState,
  error,
  id,
  isLoading,
  lastUsedUuid,
  onReload,
  onValueChange,
  selectionUnavailable,
  tokens,
  value,
}: {
  disabled: boolean;
  emptyState: "deferred" | "required";
  error: boolean;
  id: string;
  isLoading: boolean;
  lastUsedUuid: string | null;
  onReload: () => void;
  onValueChange: (value: string) => void;
  selectionUnavailable: boolean;
  tokens: readonly CloudflareBuildTokenOption[];
  value: string;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-1.5">
        <Label>API token</Label>
        <div className="text-xs text-muted-foreground" role="status">
          Loading API tokens...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid gap-1.5">
        <Label>API token</Label>
        <div className="flex flex-wrap items-center gap-2 text-xs text-red-600" role="alert">
          <span>Could not load API tokens.</span>
          <Button disabled={disabled} onClick={onReload} size="xs" type="button" variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div className="grid gap-1.5">
        <Label>API token</Label>
        <div
          className={
            emptyState === "deferred"
              ? "text-xs leading-5 text-amber-700"
              : "text-xs leading-5 text-muted-foreground"
          }
          role="status"
        >
          {emptyState === "deferred" ? (
            <>
              No API token is available. Samebase will create the GitHub repository and Convex
              project, but it will not create a Cloudflare Worker. Complete first-time Cloudflare
              setup after you create the app.{" "}
              <Link className={linkStyle} to={DOCS_CLOUDFLARE_SETUP_ROUTE}>
                View first-time Cloudflare setup
              </Link>
            </>
          ) : (
            <>No API tokens are listed. Create one in Cloudflare Workers Builds, then reload.</>
          )}
        </div>
        <Button
          className="justify-self-start"
          disabled={disabled}
          onClick={onReload}
          size="xs"
          type="button"
          variant="outline"
        >
          Reload tokens
        </Button>
      </div>
    );
  }

  const selectedToken = tokens.find((token) => token.uuid === value);

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>API token</Label>
      <Select disabled={disabled} onValueChange={onValueChange} value={value}>
        <SelectTrigger className="w-full" id={id}>
          <SelectValue placeholder="Choose a token">
            {selectedToken
              ? formatCloudflareBuildTokenOption(selectedToken, tokens, lastUsedUuid)
              : "Choose a token"}
          </SelectValue>
        </SelectTrigger>
        <AppSelectContent>
          {tokens.map((token) => (
            <AppSelectItem key={token.uuid} value={token.uuid}>
              {formatCloudflareBuildTokenOption(token, tokens, lastUsedUuid)}
            </AppSelectItem>
          ))}
        </AppSelectContent>
      </Select>
      {selectionUnavailable && (
        <div className="text-xs text-red-600" role="alert">
          This token is not in Cloudflare&apos;s current list. Choose another token.
        </div>
      )}
    </div>
  );
}
