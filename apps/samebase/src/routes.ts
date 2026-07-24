import { index, rootRoute, route } from "@tanstack/virtual-file-routes";
import { CONNECT_REPO_ROUTE } from "./lib/connectRepoRoute";
import { DASHBOARD_ROUTE } from "./lib/dashboardRoute";
import { INDEXED_DB_ROUTE } from "./lib/indexedDbRoute";
import {
  DOCS_DO_IT_YOURSELF_ROUTE,
  DOCS_RECEIPTS_ROUTE,
  DOCS_THE_STACK_ROUTE,
  LANDING_PREVIEW_ROUTE,
} from "./routeSearch/landingPreview";
import { LOCAL_STORAGE_ROUTE } from "./lib/localStorageRoute";
import { NEW_APP_ROUTE } from "./lib/newAppRoute";
import { AGENT_BROWSER_HANDOFF_ROUTE } from "../shared/agentBrowserHandoff";
import { MCP_CONSENT_APP_PATH } from "../shared/mcpOAuth";
import { PROVIDERS_ROUTE } from "./lib/providersRoute";
import { SETTINGS_ROUTE } from "./lib/settingsRoute";
import { ACCOUNT_DELETION_ROUTE } from "./lib/accountDeletionRoute";

/**
 * Use virtual file routes so the generated route tree can preserve the current
 * shipped path surface without forcing awkward filenames for paths like
 * `/vault/$`.
 */
export const routes = rootRoute("root.tsx", [
  index("index.tsx"),
  route(INDEXED_DB_ROUTE, "indexDB.tsx"),
  route(LOCAL_STORAGE_ROUTE, "localStorage.tsx"),
  route("/logo", "logo.tsx"),
  route("/logo/hover/carpet", "logo-carpet-hover-research.tsx"),
  route("/logo/iso", "logo-iso.tsx"),
  route("/logo/raster", "logo-raster.tsx"),
  route("/logo/raster-seams", "logo-raster-seams.tsx"),
  route("/logo/svg", "logo-svg.tsx"),
  route("/logo/single-cube", "logo-iso-study.tsx"),
  route("/logo/transition", "logo-transition-lab.tsx"),
  route("/logo/transition/menger", "logo-menger-transition-research.tsx"),
  route("/logo/transition/transforms", "logo-transition-transforms-lab.tsx"),
  route("/privacy", "privacy.tsx"),
  route("/terms", "terms.tsx"),
  route("/test", "test.tsx"),
  route("/pitch", "pitch.tsx"),
  route("/pitch/print", "pitch-print.tsx"),
  route("/pitch/print/mobile", "pitch-print-mobile.tsx"),
  route("/visual-fixture", "visual-fixture.tsx"),
  route(AGENT_BROWSER_HANDOFF_ROUTE, "agents-connect.tsx"),
  route(MCP_CONSENT_APP_PATH, "mcp-consent.tsx"),
  route("/landing", "landing.tsx"),
  route(DOCS_DO_IT_YOURSELF_ROUTE, "docs-do-it-yourself.tsx"),
  route(DOCS_RECEIPTS_ROUTE, "docs-receipts.tsx"),
  route(DOCS_THE_STACK_ROUTE, "docs-the-stack.tsx"),
  route(LANDING_PREVIEW_ROUTE, "landing-preview.tsx"),
  route("/pricing", "pricing.tsx"),
  route(CONNECT_REPO_ROUTE, "connect-repo.tsx"),
  route(NEW_APP_ROUTE, "new-app.tsx"),
  route(PROVIDERS_ROUTE, "providers.tsx"),
  route(SETTINGS_ROUTE, "settings.tsx"),
  route(ACCOUNT_DELETION_ROUTE, "account-deletion.tsx"),
  route("/admin/account-deletions", "admin-account-deletions.tsx"),
  route(DASHBOARD_ROUTE, [index("vault-dashboard-root.tsx"), route("$", "vault-file.tsx")]),
  route(`${DASHBOARD_ROUTE}/$owner/$repo`, "vault-dashboard.tsx"),
  route(`${DASHBOARD_ROUTE}/$owner/$repo/settings`, "vault-settings.tsx"),
  route("/vaultold", [index("vaultold-dashboard-root.tsx")]),
  route("/vaultold/$owner/$repo", "vaultold-dashboard.tsx"),
  route(
    `${DASHBOARD_ROUTE}/$owner/$repo/db/$branch/project/$convexProjectId`,
    "vault-database-project.tsx",
  ),
  route(
    `${DASHBOARD_ROUTE}/$owner/$repo/schema/$branch/project/$convexProjectId`,
    "vault-schema-project.tsx",
  ),
]);
