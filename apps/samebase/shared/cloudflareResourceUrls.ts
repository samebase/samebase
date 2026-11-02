/**
The permissions of the organization's Cloudflare CI token: the Worker, its Workers Builds link,
Alchemy's state store in the Secrets Store, and the account read. Cloudflare's
dashboard names them by permission group key and access type; `workers_ci` is Workers Builds
Configuration.
*/
const CLOUDFLARE_CI_TOKEN_PERMISSION_GROUPS = [
  { key: "workers_scripts", type: "edit" },
  { key: "workers_ci", type: "edit" },
  { key: "secrets_store", type: "edit" },
  { key: "account_settings", type: "read" },
] as const;

/**
Cloudflare's token template link: the page that creates a user API token with the CI permissions
preselected for one account and the given token name.
*/
export function buildCloudflareCiApiTokenUrl(args: {
  accountId: string;
  tokenName: string;
}): string {
  const url = new URL("https://dash.cloudflare.com/profile/api-tokens");
  url.searchParams.set(
    "permissionGroupKeys",
    JSON.stringify(CLOUDFLARE_CI_TOKEN_PERMISSION_GROUPS),
  );
  url.searchParams.set("accountId", args.accountId);
  url.searchParams.set("name", args.tokenName);
  return url.toString();
}
