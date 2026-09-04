import { index, rootRoute, route } from "@tanstack/virtual-file-routes";
import { DASHBOARD_ROUTE } from "./lib/dashboardRoute";
import { INDEXED_DB_ROUTE } from "./lib/indexedDbRoute";
import {
  DOCS_CLOUDFLARE_SETUP_ROUTE,
  DOCS_DO_IT_YOURSELF_ROUTE,
  DOCS_INDEX_ROUTE,
  DOCS_RECEIPTS_ROUTE,
  DOCS_THE_STACK_ROUTE,
  LANDING_PREVIEW_ROUTE,
} from "./routeSearch/landingPreview";
import { LOCAL_STORAGE_ROUTE } from "./lib/localStorageRoute";
import { AGENT_BROWSER_HANDOFF_ROUTE } from "../shared/agentBrowserHandoff";
import { MCP_CONSENT_APP_PATH } from "../shared/mcpOAuth";
import {
  ORGANIZATION_CONNECT_REPO_ROUTE,
  ORGANIZATION_NEW_APP_ROUTE,
  ORGANIZATION_MEMBERS_ROUTE,
  ORGANIZATION_PROVIDERS_ROUTE,
  ORGANIZATION_ROUTE,
  ORGANIZATION_SETTINGS_ROUTE,
  ORGANIZATION_REPOSITORIES_ROUTE,
  ORGANIZATIONS_ROUTE,
} from "./lib/organizationRoutes";
import { SETTINGS_ROUTE } from "./account/settingsRoute";
import { ACCOUNT_DELETION_ROUTE } from "./account/accountDeletionRoute";
import { ORGANIZATION_INVITATION_ROUTE } from "./lib/organizationInvitationRoute";

/**
 * Use virtual file routes so the generated route tree can preserve the current
 * shipped path surface without forcing awkward filenames for paths like
 * `/repo/$`.
 */
export const routes = rootRoute("root.tsx", [
  index("index.tsx"),
  route(INDEXED_DB_ROUTE, "indexDB.tsx"),
  route(LOCAL_STORAGE_ROUTE, "localStorage.tsx"),
  route("/logo", "logo.tsx"),
  route("/logo/hover/carpet", "logo-carpet-hover-research.tsx"),
  route("/logo/hover/menger", "logo-menger-hover-research.tsx"),
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
  route("/youtube", "youtube.tsx"),
  route("/discord", "discord.tsx"),
  route("/test", "test.tsx"),
  route("/pitch", "pitch.tsx"),
  route("/pitch/print", "pitch-print.tsx"),
  route("/pitch/print/mobile", "pitch-print-mobile.tsx"),
  route("/visual-fixture", "visual-fixture.tsx"),
  route(AGENT_BROWSER_HANDOFF_ROUTE, "agents-connect.tsx"),
  route(MCP_CONSENT_APP_PATH, "mcp-consent.tsx"),
  route("/landing", "landing.tsx"),
  route(DOCS_INDEX_ROUTE, "docs.tsx"),
  route(DOCS_CLOUDFLARE_SETUP_ROUTE, "docs-cloudflare-setup.tsx"),
  route(DOCS_DO_IT_YOURSELF_ROUTE, "docs-do-it-yourself.tsx"),
  route(DOCS_RECEIPTS_ROUTE, "docs-receipts.tsx"),
  route(DOCS_THE_STACK_ROUTE, "docs-the-stack.tsx"),
  route(LANDING_PREVIEW_ROUTE, "landing-preview.tsx"),
  route("/pricing", "pricing.tsx"),
  route(ORGANIZATIONS_ROUTE, "organizations.tsx"),
  route(ORGANIZATION_ROUTE, "org.tsx"),
  route(ORGANIZATION_REPOSITORIES_ROUTE, "org-repositories.tsx"),
  route(ORGANIZATION_PROVIDERS_ROUTE, "org-providers.tsx"),
  route(ORGANIZATION_NEW_APP_ROUTE, "org-new-app.tsx"),
  route(ORGANIZATION_CONNECT_REPO_ROUTE, "org-connect-repo.tsx"),
  route(ORGANIZATION_MEMBERS_ROUTE, "org-members.tsx"),
  route(ORGANIZATION_SETTINGS_ROUTE, "org-settings.tsx"),
  route(ORGANIZATION_INVITATION_ROUTE, "invite.tsx"),
  route(SETTINGS_ROUTE, "settings.tsx"),
  route(ACCOUNT_DELETION_ROUTE, "account-deletion.tsx"),
  route("/admin/users", "admin-users.tsx"),
  route("/admin/account-deletions", "admin-account-deletions.tsx"),
  route(DASHBOARD_ROUTE, [
    index("repository-dashboard-root.tsx"),
    route("$", "repository-file.tsx"),
  ]),
  route(`${DASHBOARD_ROUTE}/$owner/$repository`, "repository-dashboard.tsx"),
  route(`${DASHBOARD_ROUTE}/$owner/$repository/settings`, "repository-settings.tsx"),
  route(
    `${DASHBOARD_ROUTE}/$owner/$repository/db/$branch/project/$convexProjectId`,
    "repository-database-project.tsx",
  ),
  route(
    `${DASHBOARD_ROUTE}/$owner/$repository/schema/$branch/project/$convexProjectId`,
    "repository-schema-project.tsx",
  ),
]);
