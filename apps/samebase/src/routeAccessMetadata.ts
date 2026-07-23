import type { RouteStaticData } from "./routing/permissions";
import type { FileRoutesByFullPath } from "./routeTree.gen";

type RouteMetadata = Pick<
  RouteStaticData,
  "access" | "appWorkspaceRouteChrome" | "availableEnvironments" | "pathSuggestion" | "prerender"
>;

/**
 * Config-time consumers need route access policy without importing route
 * components. Standard package `#` imports would make config-loaded modules
 * easier for Node to resolve than the app-only `@` alias, but Vite config
 * should still stay on metadata-only modules instead of the full route tree.
 */
const routeAccessMetadataByPath = {
  "/": { access: "access_public", appWorkspaceRouteChrome: { leftPane: "none" } },
  "/agents/connect": {
    access: "access_public",
    appWorkspaceRouteChrome: { leftPane: "none" },
    pathSuggestion: "hidden",
    prerender: false,
  },
  "/account-deletion": {
    access: "access_account_deletion",
    appWorkspaceRouteChrome: { leftPane: "none", mobilePane: "main" },
  },
  "/admin/account-deletions": {
    access: "access_admin",
    appWorkspaceRouteChrome: { leftPane: "none", mobilePane: "main" },
  },
  "/connect-repo": {
    access: "access_repo_connect",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/indexDB": { access: "access_admin" },
  "/landing": { access: "access_public", pathSuggestion: "redirect", prerender: false },
  "/docs/do-it-yourself": { access: "access_public", pathSuggestion: "hidden" },
  "/docs/receipts": { access: "access_public", pathSuggestion: "hidden" },
  "/docs/the-stack": { access: "access_public", pathSuggestion: "hidden" },
  "/landing-preview": {
    access: "access_public",
    appWorkspaceRouteChrome: { leftPane: "none" },
    pathSuggestion: "hidden",
  },
  "/localStorage": { access: "access_admin" },
  "/logo": { access: "access_public" },
  "/logo/iso": { access: "access_admin" },
  "/logo/raster": { access: "access_admin" },
  "/logo/raster-seams": {
    access: "access_admin",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/logo/single-cube": {
    access: "access_admin",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/logo/svg": { access: "access_admin", appWorkspaceRouteChrome: { leftPane: "none" } },
  "/logo/transition": {
    access: "access_admin",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/logo/transition/menger": {
    access: "access_admin",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/logo/transition/transforms": {
    access: "access_admin",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/machines": { access: "access_machines" },
  "/machines/connect": {
    access: "access_machines",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/new-app": {
    access: "access_app_create",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/oauth/mcp/consent": {
    access: "access_public",
    appWorkspaceRouteChrome: { leftPane: "none" },
    pathSuggestion: "hidden",
  },
  "/pitch": { access: "access_admin", appWorkspaceRouteChrome: { leftPane: "none" } },
  "/pitch/print": { access: "access_admin", appWorkspaceRouteChrome: { leftPane: "none" } },
  "/pitch/print/mobile": {
    access: "access_admin",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/pricing": { access: "access_public", pathSuggestion: "hidden" },
  "/privacy": { access: "access_public", appWorkspaceRouteChrome: { leftPane: "none" } },
  "/providers": {
    access: "access_provider_connections",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/research/codex-app-server": {
    access: "access_admin",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/research/codex-app-server/browser": {
    access: "access_admin",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/settings": {
    access: "access_user_preferences",
    appWorkspaceRouteChrome: { leftPane: "none", mobilePane: "main" },
  },
  "/terms": { access: "access_public", appWorkspaceRouteChrome: { leftPane: "none" } },
  "/test": {
    availableEnvironments: ["local"],
    access: "access_admin",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/vault/": { access: "access_dashboard", appWorkspaceRouteChrome: { leftPane: "none" } },
  "/vault/$": { access: "access_files_read" },
  "/vault/$owner/$repo": { access: "access_dashboard" },
  "/vault/$owner/$repo/codespace/$branch/chat": {
    access: "access_machines",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/vault/$owner/$repo/db/$branch/project/$convexProjectId": {
    access: "access_files_read",
    appWorkspaceRouteChrome: { leftPane: "none" },
  },
  "/vault/$owner/$repo/schema/$branch/project/$convexProjectId": {
    access: "access_schema_graph",
  },
  "/visual-fixture": {
    access: "access_public",
    appWorkspaceRouteChrome: {
      dataTestId: "visual-fixture-shell",
    },
    availableEnvironments: ["local"],
  },
} as const satisfies Record<keyof FileRoutesByFullPath, RouteMetadata>;

export const ROUTE_ACCESS_METADATA_BY_PATH: Record<keyof FileRoutesByFullPath, RouteMetadata> =
  routeAccessMetadataByPath;
