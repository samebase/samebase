import type { RouteStaticData } from "./routing/permissions";
import type { FileRoutesByFullPath } from "./routeTree.gen";

type RouteMetadata = Pick<
  RouteStaticData,
  "access" | "availableEnvironments" | "pathSuggestion" | "prerender"
>;

/**
 * Config-time consumers need route access policy without importing route
 * components. Standard package `#` imports would make config-loaded modules
 * easier for Node to resolve than the app-only `@` alias, but Vite config
 * should still stay on metadata-only modules instead of the full route tree.
 */
const routeAccessMetadataByPath = {
  "/": { access: "access_public" },
  "/connect-repo": { access: "access_repo_connect" },
  "/home": { access: "access_dashboard" },
  "/indexDB": { access: "access_admin" },
  "/landing": { access: "access_public", pathSuggestion: "hidden", prerender: false },
  "/landing-preview": { access: "access_admin" },
  "/localStorage": { access: "access_admin" },
  "/logo": { access: "access_public" },
  "/logo/iso": { access: "access_admin" },
  "/logo/raster": { access: "access_admin" },
  "/logo/raster-seams": { access: "access_admin" },
  "/logo/single-cube": { access: "access_admin" },
  "/logo/svg": { access: "access_admin" },
  "/logo/transition": { access: "access_admin" },
  "/logo/transition/transforms": { access: "access_admin" },
  "/machines": { access: "access_machines" },
  "/machines/connect": { access: "access_machines" },
  "/new-app": { access: "access_app_create" },
  "/oauth/mcp/consent": { access: "access_public", pathSuggestion: "hidden" },
  "/pitch": { access: "access_admin" },
  "/pitch/print": { access: "access_admin" },
  "/pitch/print/mobile": { access: "access_admin" },
  "/pricing": { access: "access_dashboard" },
  "/privacy": { access: "access_public" },
  "/providers": { access: "access_provider_connections" },
  "/research/codex-app-server": { access: "access_admin" },
  "/research/codex-app-server/browser": { access: "access_admin" },
  "/terms": { access: "access_public" },
  "/test": { availableEnvironments: ["local"], access: "access_admin" },
  "/vault/$": { access: "access_files_read" },
  "/vault/$owner/$repo": { access: "access_dashboard" },
  "/vault/$owner/$repo/codespace/$branch/chat": { access: "access_machines" },
  "/vault/$owner/$repo/db/$branch/root": { access: "access_files_read" },
  "/vault/$owner/$repo/db/$branch/mono/$": { access: "access_files_read" },
  "/vault/$owner/$repo/schema/$branch/root": { access: "access_schema_graph" },
  "/vault/$owner/$repo/schema/$branch/mono/$": { access: "access_schema_graph" },
  "/visual-fixture": { availableEnvironments: ["local"], access: "access_public" },
} as const satisfies Record<keyof FileRoutesByFullPath, RouteMetadata>;

export const ROUTE_ACCESS_METADATA_BY_PATH: Record<keyof FileRoutesByFullPath, RouteMetadata> =
  routeAccessMetadataByPath;
