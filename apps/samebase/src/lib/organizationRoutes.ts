export const ORGANIZATIONS_ROUTE = "/org";
export const ORGANIZATION_ROUTE = "/org/$owner";
export const ORGANIZATION_VAULTS_ROUTE = "/org/$owner/vaults";
export const ORGANIZATION_PROVIDERS_ROUTE = "/org/$owner/providers";
export const ORGANIZATION_MEMBERS_ROUTE = "/org/$owner/settings/members";
export const ORGANIZATION_NEW_APP_ROUTE = "/org/$owner/new-app";
export const ORGANIZATION_CONNECT_REPO_ROUTE = "/org/$owner/connect-repo";
export const ORGANIZATION_SETTINGS_ROUTE = "/org/$owner/settings";

export type OrganizationRouteSection =
  | "vaults"
  | "providers"
  | "members"
  | "new-app"
  | "connect-repo"
  | "settings";

const ORGANIZATION_ROUTE_SUFFIX_BY_SECTION = {
  "connect-repo": "/connect-repo",
  "new-app": "/new-app",
  members: "/settings/members",
  providers: "/providers",
  settings: "/settings",
  vaults: "/vaults",
} as const satisfies Record<OrganizationRouteSection, string>;

export function buildOrganizationRoutePath(args: {
  owner: string;
  section: OrganizationRouteSection;
}): string {
  return `/org/${encodeURIComponent(args.owner)}${ORGANIZATION_ROUTE_SUFFIX_BY_SECTION[args.section]}`;
}
