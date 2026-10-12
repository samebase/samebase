import type { RouteStaticData } from "./routing/permissions";
import type { FileRoutesByFullPath } from "./routeTree.gen";

type RouteMetadata = Pick<
  RouteStaticData,
  "access" | "appWorkspaceRouteChrome" | "availableEnvironments" | "pathSuggestion" | "prerender"
>;
export type RoutePath = keyof FileRoutesByFullPath;

/**
 * Config-time consumers need route access policy without importing route
 * components. Standard package `#` imports would make config-loaded modules
 * easier for Node to resolve than the app-only `@` alias, but Vite config
 * should still stay on metadata-only modules instead of the full route tree.
 */
export const ROUTE_ACCESS_METADATA_BY_PATH = {
  "/": { access: "access_public" },
  "/agents/connect": {
    access: "access_public",
    appWorkspaceRouteChrome: { leftPane: "none" },
    pathSuggestion: "hidden",
    prerender: false,
  },
  "/account-deletion": {
    access: "access_account_deletion",
    appWorkspaceRouteChrome: { leftPane: "none" },
    pathSuggestion: "hidden",
  },
  "/org": {
    access: "access_dashboard",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/admin/account-deletions": {
    access: "access_admin",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/admin/users": {
    access: "access_admin",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/admin/emails": {
    access: "access_admin",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/indexDB": { access: "access_admin" },
  "/invite/$code": {
    access: "access_public",
    appWorkspaceRouteChrome: { leftPane: "none" },
    pathSuggestion: "hidden",
    prerender: false,
  },
  "/landing": { access: "access_public", pathSuggestion: "redirect", prerender: false },
  "/docs": { access: "access_public" },
  "/docs/cloudflare-setup": { access: "access_public" },
  "/docs/cloudflare-previews-migration": { access: "access_public" },
  "/docs/do-it-yourself": { access: "access_public" },
  "/docs/receipts": { access: "access_public" },
  "/docs/the-stack": { access: "access_public" },
  "/landing-preview": {
    access: "access_public",
    pathSuggestion: "redirect",
    prerender: false,
  },
  "/x.com": { access: "access_public", pathSuggestion: "redirect", prerender: false },
  "/youtube": { access: "access_public", pathSuggestion: "redirect", prerender: false },
  "/discord": { access: "access_public", pathSuggestion: "redirect", prerender: false },
  "/localStorage": { access: "access_admin" },
  "/logo": { access: "access_public", pathSuggestion: "dev" },
  "/logo/hover/carpet": { access: "access_public", pathSuggestion: "dev" },
  "/logo/hover/menger": { access: "access_public", pathSuggestion: "dev" },
  "/logo/iso": { access: "access_public", pathSuggestion: "dev" },
  "/logo/raster": { access: "access_public", pathSuggestion: "dev" },
  "/logo/raster-seams": {
    access: "access_public",
    appWorkspaceRouteChrome: { leftPane: "none" },
    pathSuggestion: "dev",
  },
  "/logo/single-cube": {
    access: "access_public",
    appWorkspaceRouteChrome: { leftPane: "none" },
    pathSuggestion: "dev",
  },
  "/logo/svg": {
    access: "access_public",
    appWorkspaceRouteChrome: { leftPane: "none" },
    pathSuggestion: "dev",
  },
  "/logo/transition": {
    access: "access_public",
    appWorkspaceRouteChrome: { leftPane: "none" },
    pathSuggestion: "dev",
  },
  "/logo/transition/menger": {
    access: "access_public",
    pathSuggestion: "dev",
  },
  "/logo/transition/transforms": {
    access: "access_public",
    appWorkspaceRouteChrome: { leftPane: "none" },
    pathSuggestion: "dev",
  },
  "/org/$owner": {
    access: "access_dashboard",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/org/$owner/connect-repo": {
    access: "access_repo_connect",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/org/$owner/new-app": {
    access: "access_app_create",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/org/$owner/providers": {
    access: "access_provider_connections",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/org/$owner/settings": {
    access: "access_dashboard",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/org/$owner/settings/members": {
    access: "access_dashboard",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/org/$owner/repositories": {
    access: "access_dashboard",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/oauth/mcp/consent": {
    access: "access_public",
    appWorkspaceRouteChrome: { leftPane: "none" },
    pathSuggestion: "hidden",
  },
  "/oauth/provider-complete": {
    access: "access_provider_connections",
    appWorkspaceRouteChrome: { leftPane: "none" },
    pathSuggestion: "hidden",
  },
  "/pitch": { access: "access_admin", appWorkspaceRouteChrome: { leftPane: "none" } },
  "/pitch/print": { access: "access_admin", appWorkspaceRouteChrome: { leftPane: "none" } },
  "/pitch/print/mobile": {
    access: "access_admin",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/pricing": { access: "access_public" },
  "/privacy": { access: "access_public", appWorkspaceRouteChrome: { leftPane: "none" } },
  "/settings": {
    access: "access_account_settings",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/terms": { access: "access_public", appWorkspaceRouteChrome: { leftPane: "none" } },
  "/test": {
    availableEnvironments: ["local"],
    access: "access_admin",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/repo/": { access: "access_dashboard", appWorkspaceRouteChrome: { leftPane: "none" } },
  "/repo/$": { access: "access_files_read" },
  "/repo/$owner/$repository": { access: "access_dashboard" },
  "/repo/$owner/$repository/settings": { access: "access_dashboard" },
  "/repo/$owner/$repository/db/$branch/project/$convexProjectId": {
    access: "access_dashboard",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/repo/$owner/$repository/schema/$branch/project/$convexProjectId": {
    access: "access_schema_graph",
  },
  "/repo/$owner/$repository/components/$deploymentName": {
    access: "access_dashboard",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/visual-fixture": {
    access: "access_public",
    availableEnvironments: ["local"],
  },
} as const satisfies Record<RoutePath, RouteMetadata>;

type RouteAccessMetadataByPath = typeof ROUTE_ACCESS_METADATA_BY_PATH;

export type PublicPrerenderRoutePath = {
  [Path in RoutePath]: RouteAccessMetadataByPath[Path] extends {
    access: "access_public";
  }
    ? RouteAccessMetadataByPath[Path] extends { prerender: false }
      ? never
      : Path extends `${string}$${string}`
        ? never
        : RouteAccessMetadataByPath[Path] extends {
              availableEnvironments: readonly string[];
            }
          ? "production" extends RouteAccessMetadataByPath[Path]["availableEnvironments"][number]
            ? Path
            : never
          : Path
    : never;
}[RoutePath];
