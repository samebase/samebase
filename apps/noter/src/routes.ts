import { index, rootRoute, route } from "@tanstack/virtual-file-routes";
import {
  CODEX_APP_SERVER_RESEARCH_ROUTE,
  CODEX_APP_SERVER_THREAD_BROWSER_ROUTE,
} from "./lib/codexAppServerResearch";
import { MACHINE_CONNECT_ROUTE, MACHINES_ROUTE } from "./lib/noterSync";
import { MCP_CONSENT_APP_PATH } from "../shared/mcpOAuth";

/**
 * Use virtual file routes so the generated route tree can preserve the current
 * shipped path surface without forcing awkward filenames for paths like
 * `/vault/$`.
 */
export const routes = rootRoute("root.tsx", [
  index("index.tsx"),
  route("/home", "home.tsx"),
  route("/test", "test.tsx"),
  route("/privacy", "privacy.tsx"),
  route("/terms", "terms.tsx"),
  route("/logo", "logo.tsx"),
  route("/logo/iso", "logo-iso.tsx"),
  route("/logo/svg", "logo-svg.tsx"),
  route("/logo/single-cube", "logo-iso-study.tsx"),
  route("/logo/transition", "logo-transition-lab.tsx"),
  route("/logo/transition/transforms", "logo-transition-transforms-lab.tsx"),
  route("/pitch", "pitch.tsx"),
  route("/pitch/print", "pitch-print.tsx"),
  route("/pitch/print/mobile", "pitch-print-mobile.tsx"),
  route(CODEX_APP_SERVER_RESEARCH_ROUTE, "codex-research.tsx"),
  route(
    CODEX_APP_SERVER_THREAD_BROWSER_ROUTE,
    "codex-thread-browser-research.tsx",
  ),
  route(MCP_CONSENT_APP_PATH, "mcp-consent.tsx"),
  route("/pricing", "pricing.tsx"),
  route("/add", "add-repository.tsx"),
  route(MACHINES_ROUTE, "machines.tsx"),
  route(MACHINE_CONNECT_ROUTE, "machine-connect.tsx"),
  route("/vault/$owner/$repo/codespace/$branch/chat", "codespace-chat.tsx"),
  route("/vault/$", "vault-file.tsx"),
]);
