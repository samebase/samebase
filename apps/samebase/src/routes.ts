import { index, rootRoute, route } from "@tanstack/virtual-file-routes";
import {
  CODEX_APP_SERVER_RESEARCH_ROUTE,
  CODEX_APP_SERVER_THREAD_BROWSER_ROUTE,
} from "./codex/appServerResearch";
import { CONNECT_REPO_ROUTE } from "./lib/connectRepoRoute";
import { DASHBOARD_ROUTE } from "./lib/dashboardRoute";
import { INDEXED_DB_ROUTE } from "./lib/indexedDbRoute";
import {
  DOCS_DO_IT_YOURSELF_ROUTE,
  DOCS_THE_STACK_ROUTE,
  LANDING_PREVIEW_ROUTE,
} from "./routeSearch/landingPreview";
import { LOCAL_STORAGE_ROUTE } from "./lib/localStorageRoute";
import { NEW_APP_ROUTE } from "./lib/newAppRoute";
import { MACHINE_CONNECT_ROUTE, MACHINES_ROUTE } from "./lib/samebaseSync";
import { MCP_CONSENT_APP_PATH } from "../shared/mcpOAuth";
import { PROVIDERS_ROUTE } from "./lib/providersRoute";

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
  route("/logo/iso", "logo-iso.tsx"),
  route("/logo/raster", "logo-raster.tsx"),
  route("/logo/raster-seams", "logo-raster-seams.tsx"),
  route("/logo/svg", "logo-svg.tsx"),
  route("/logo/single-cube", "logo-iso-study.tsx"),
  route("/logo/transition", "logo-transition-lab.tsx"),
  route("/logo/transition/transforms", "logo-transition-transforms-lab.tsx"),
  route("/privacy", "privacy.tsx"),
  route("/terms", "terms.tsx"),
  route("/test", "test.tsx"),
  route("/walkthrough/cloudflare-worker-builds", "walkthrough-cloudflare-worker-builds.tsx"),
  route("/pitch", "pitch.tsx"),
  route("/pitch/print", "pitch-print.tsx"),
  route("/pitch/print/mobile", "pitch-print-mobile.tsx"),
  route("/visual-fixture", "visual-fixture.tsx"),
  route(CODEX_APP_SERVER_RESEARCH_ROUTE, "codex-research.tsx"),
  route(CODEX_APP_SERVER_THREAD_BROWSER_ROUTE, "codex-thread-browser-research.tsx"),
  route(MCP_CONSENT_APP_PATH, "mcp-consent.tsx"),
  route("/landing", "landing.tsx"),
  route(DOCS_DO_IT_YOURSELF_ROUTE, "docs-do-it-yourself.tsx"),
  route(DOCS_THE_STACK_ROUTE, "docs-the-stack.tsx"),
  route(LANDING_PREVIEW_ROUTE, "landing-preview.tsx"),
  route("/pricing", "pricing.tsx"),
  route(CONNECT_REPO_ROUTE, "connect-repo.tsx"),
  route(NEW_APP_ROUTE, "new-app.tsx"),
  route(PROVIDERS_ROUTE, "providers.tsx"),
  route(MACHINES_ROUTE, "machines.tsx"),
  route(MACHINE_CONNECT_ROUTE, "machine-connect.tsx"),
  route(DASHBOARD_ROUTE, [index("vault-dashboard-root.tsx"), route("$", "vault-file.tsx")]),
  route(`${DASHBOARD_ROUTE}/$owner/$repo`, "vault-dashboard.tsx"),
  route(`${DASHBOARD_ROUTE}/$owner/$repo/codespace/$branch/chat`, "codespace-chat.tsx"),
  route(`${DASHBOARD_ROUTE}/$owner/$repo/db/$branch/root`, "vault-database-root.tsx"),
  route(`${DASHBOARD_ROUTE}/$owner/$repo/db/$branch/mono/$`, "vault-database-mono.tsx"),
  route(`${DASHBOARD_ROUTE}/$owner/$repo/schema/$branch/root`, "vault-schema-root.tsx"),
  route(`${DASHBOARD_ROUTE}/$owner/$repo/schema/$branch/mono/$`, "vault-schema-mono.tsx"),
]);
