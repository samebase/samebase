import type { NoterRouteStaticData } from "./lib/routePermissions";
import type { FileRoutesByFullPath } from "./routeTree.gen";

type NoterRouteAccessMetadata = Pick<NoterRouteStaticData, "access" | "availableEnvironments">;

/**
 * Config-time consumers need route access policy without importing route
 * components. Standard package `#` imports would make config-loaded modules
 * easier for Node to resolve than the app-only `@` alias, but Vite config
 * should still stay on metadata-only modules instead of the full route tree.
 */
const noterRouteAccessMetadataByPath = {
  "/": { access: "access_public" },
  "/connect-repo": { access: "access_repo_connect" },
  "/home": { access: "access_dashboard" },
  "/indexDB": { access: "access_admin" },
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
  "/oauth/mcp/consent": { access: "access_mcp" },
  "/pitch": { access: "access_admin" },
  "/pitch/print": { access: "access_admin" },
  "/pitch/print/mobile": { access: "access_admin" },
  "/pricing": { access: "access_dashboard" },
  "/privacy": { access: "access_public" },
  "/research/codex-app-server": { access: "access_admin" },
  "/research/codex-app-server/browser": { access: "access_admin" },
  "/terms": { access: "access_public" },
  "/test": { availableEnvironments: ["local"], access: "access_admin" },
  "/vault/$": { access: "access_files_read" },
  "/vault/$owner/$repo/codespace/$branch/chat": { access: "access_machines" },
  "/visual-fixture": { availableEnvironments: ["local"], access: "access_public" },
} as const satisfies Record<keyof FileRoutesByFullPath, NoterRouteAccessMetadata>;

export const NOTER_ROUTE_ACCESS_METADATA_BY_PATH: Record<
  keyof FileRoutesByFullPath,
  NoterRouteAccessMetadata
> = noterRouteAccessMetadataByPath;
