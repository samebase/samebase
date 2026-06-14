import type { NoterRouteStaticData } from "./lib/routePermissions";
import type { FileRoutesByFullPath } from "./routeTree.gen";

type NoterRouteAccessMetadata = Pick<NoterRouteStaticData, "availableEnvironments" | "permission">;

/**
 * Config-time consumers need route access policy without importing route
 * components. Standard package `#` imports would make config-loaded modules
 * easier for Node to resolve than the app-only `@` alias, but Vite config
 * should still stay on metadata-only modules instead of the full route tree.
 */
const noterRouteAccessMetadataByPath = {
  "/": { permission: "public" },
  "/connect-repo": { permission: "admin" },
  "/home": { permission: "admin" },
  "/indexDB": { permission: "admin" },
  "/landing-preview": { permission: "admin" },
  "/localStorage": { permission: "admin" },
  "/logo": { permission: "public" },
  "/logo/iso": { permission: "admin" },
  "/logo/raster": { permission: "admin" },
  "/logo/raster-seams": { permission: "admin" },
  "/logo/single-cube": { permission: "admin" },
  "/logo/svg": { permission: "admin" },
  "/logo/transition": { permission: "admin" },
  "/logo/transition/transforms": { permission: "admin" },
  "/machines": { permission: "admin" },
  "/machines/connect": { permission: "admin" },
  "/new-app": { permission: "admin" },
  "/oauth/mcp/consent": { permission: "admin" },
  "/pitch": { permission: "admin" },
  "/pitch/print": { permission: "admin" },
  "/pitch/print/mobile": { permission: "admin" },
  "/pricing": { permission: "admin" },
  "/privacy": { permission: "public" },
  "/research/codex-app-server": { permission: "admin" },
  "/research/codex-app-server/browser": { permission: "admin" },
  "/terms": { permission: "public" },
  "/test": { availableEnvironments: ["local"], permission: "admin" },
  "/vault/$": { permission: "admin" },
  "/vault/$owner/$repo/codespace/$branch/chat": { permission: "admin" },
  "/visual-fixture": { availableEnvironments: ["local"], permission: "public" },
} as const satisfies Record<keyof FileRoutesByFullPath, NoterRouteAccessMetadata>;

export const NOTER_ROUTE_ACCESS_METADATA_BY_PATH: Record<
  keyof FileRoutesByFullPath,
  NoterRouteAccessMetadata
> = noterRouteAccessMetadataByPath;
