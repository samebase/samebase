import type { NoterRouteStaticData } from "./lib/routePermissions";
import type { FileRoutesByFullPath } from "./routeTree.gen";

type NoterRouteAccessMetadata = Pick<NoterRouteStaticData, "availableOn" | "permission">;

/**
 * Config-time consumers need route access policy without importing route
 * components. Standard package `#` imports would make config-loaded modules
 * easier for Node to resolve than the app-only `@` alias, but Vite config
 * should still stay on metadata-only modules instead of the full route tree.
 */
const noterRouteAccessMetadataByPath = {
  "/": { permission: "public" },
  "/add": { permission: "admin" },
  "/home": { permission: "admin" },
  "/indexDB": { permission: "public" },
  "/landing-preview": { permission: "admin" },
  "/localStorage": { permission: "public" },
  "/logo": { permission: "public" },
  "/logo/iso": { permission: "public" },
  "/logo/raster": { permission: "public" },
  "/logo/raster-seams": { permission: "public" },
  "/logo/single-cube": { permission: "public" },
  "/logo/svg": { permission: "public" },
  "/logo/transition": { permission: "public" },
  "/logo/transition/transforms": { permission: "public" },
  "/machines": { permission: "admin" },
  "/machines/connect": { permission: "admin" },
  "/oauth/mcp/consent": { permission: "admin" },
  "/pitch": { permission: "admin" },
  "/pitch/print": { permission: "admin" },
  "/pitch/print/mobile": { permission: "admin" },
  "/pricing": { permission: "admin" },
  "/privacy": { permission: "public" },
  "/research/codex-app-server": { permission: "admin" },
  "/research/codex-app-server/browser": { permission: "admin" },
  "/terms": { permission: "public" },
  "/test": { availableOn: ["local"], permission: "admin" },
  "/vault/$": { permission: "admin" },
  "/vault/$owner/$repo/codespace/$branch/chat": { permission: "admin" },
  "/visual-fixture": { availableOn: ["local"], permission: "public" },
} as const satisfies Record<keyof FileRoutesByFullPath, NoterRouteAccessMetadata>;

export const NOTER_ROUTE_ACCESS_METADATA_BY_PATH: Record<
  keyof FileRoutesByFullPath,
  NoterRouteAccessMetadata
> = noterRouteAccessMetadataByPath;
