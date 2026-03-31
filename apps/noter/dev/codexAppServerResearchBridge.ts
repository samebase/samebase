import type { IncomingMessage } from "node:http";
import type { Plugin, ViteDevServer } from "vite";

import { CODEX_APP_SERVER_RESEARCH_API_BASE } from "../src/lib/codexAppServerResearch";
import {
  CodexLocalControlRuntime,
  createCodexLocalControlRouter,
} from "../../../packages/sync/noter.js";

/**
 * Register a dev-only local bridge around the shared machine-local Codex
 * control runtime so the browser, CLI, and Playwright all exercise the same
 * handler and runtime contract during Phase 1 extraction work.
 */
export function codexAppServerResearchBridgePlugin(args: {
  workspaceRoot: string;
}): Plugin {
  return {
    name: "codex-app-server-research-bridge",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      const runtime = new CodexLocalControlRuntime(args.workspaceRoot);
      const router = createCodexLocalControlRouter({
        routeBasePath: CODEX_APP_SERVER_RESEARCH_API_BASE,
        runtime,
      });

      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        if (!pathname.startsWith(CODEX_APP_SERVER_RESEARCH_API_BASE)) {
          next();
          return;
        }

        if (!requestIsFromLoopback(req)) {
          res.statusCode = 403;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              error:
                "codex-app-server-research-bridge only supports loopback requests.",
            }),
          );
          return;
        }

        void router(req, res, next);
      });
    },
  };
}

function requestIsFromLoopback(req: IncomingMessage): boolean {
  const remoteAddress = req.socket.remoteAddress;
  return (
    remoteAddress === "127.0.0.1" ||
    remoteAddress === "::1" ||
    remoteAddress === "::ffff:127.0.0.1"
  );
}
