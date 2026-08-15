import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { linkStyle } from "@/components/styles";

export type CloudflareBuildTokenOption = {
  name: string;
  uuid: string;
};

function buildCloudflareWorkersUrl(accountId: string): string {
  return `https://dash.cloudflare.com/${encodeURIComponent(accountId)}/workers-and-pages`;
}

function formatCloudflareBuildTokenOption(
  token: CloudflareBuildTokenOption,
  tokens: readonly CloudflareBuildTokenOption[],
): string {
  const duplicateName = tokens.some(
    (candidate) => candidate.uuid !== token.uuid && candidate.name === token.name,
  );
  return duplicateName ? `${token.name} (${token.uuid.slice(0, 8)})` : token.name;
}

export function CloudflareBuildTokenField({
  accountId,
  disabled,
  error,
  id,
  isLoading,
  onReload,
  onValueChange,
  selectionUnavailable,
  tokens,
  value,
}: {
  accountId: string | null;
  disabled: boolean;
  error: boolean;
  id: string;
  isLoading: boolean;
  onReload: () => void;
  onValueChange: (value: string) => void;
  selectionUnavailable: boolean;
  tokens: readonly CloudflareBuildTokenOption[];
  value: string;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-1.5">
        <Label>Workers Builds token</Label>
        <div className="text-xs text-muted-foreground" role="status">
          Loading Workers Builds tokens...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid gap-1.5">
        <Label>Workers Builds token</Label>
        <div className="flex flex-wrap items-center gap-2 text-xs text-red-600" role="alert">
          <span>Could not load Workers Builds tokens.</span>
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
        <Label>Workers Builds token</Label>
        <div className="text-xs leading-5 text-muted-foreground">
          No Workers Builds tokens are listed. Create one in Cloudflare&apos;s Workers Builds setup,
          then reload.{" "}
          {accountId ? (
            <a
              className={linkStyle}
              href={buildCloudflareWorkersUrl(accountId)}
              rel="noreferrer noopener"
              target="_blank"
            >
              Open Cloudflare
            </a>
          ) : null}
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
      <Label htmlFor={id}>Workers Builds token</Label>
      <Select disabled={disabled} onValueChange={onValueChange} value={value}>
        <SelectTrigger className="w-full" id={id}>
          <SelectValue placeholder="Choose a token">
            {selectedToken
              ? formatCloudflareBuildTokenOption(selectedToken, tokens)
              : "Choose a token"}
          </SelectValue>
        </SelectTrigger>
        <AppSelectContent>
          {tokens.map((token) => (
            <AppSelectItem key={token.uuid} value={token.uuid}>
              {formatCloudflareBuildTokenOption(token, tokens)}
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
