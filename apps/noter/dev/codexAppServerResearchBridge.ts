import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Plugin, ViteDevServer } from "vite";

import { CODEX_APP_SERVER_RESEARCH_API_BASE } from "../src/lib/codexAppServerResearch";

type MiddlewareNext = (error?: Error) => void;

type CodexLocalControlRouter = (
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
  next: MiddlewareNext,
) => void | Promise<void>;

type CodexLocalControlRouterFactory = (args: {
  routeBasePath: string;
  runtime: CodexLocalControlRuntimeLike;
}) => CodexLocalControlRouter;

interface CodexLocalControlRuntimeLike {}

type CodexLocalControlRuntimeConstructor = new (
  workspaceRoot: string,
) => CodexLocalControlRuntimeLike;

type CodexLocalControlBridgeModule = {
  CodexLocalControlRuntime: CodexLocalControlRuntimeConstructor;
  createCodexLocalControlRouter: CodexLocalControlRouterFactory;
};

const currentDirectoryPath = path.dirname(fileURLToPath(import.meta.url));
const codexLocalControlBridgeModuleUrl = pathToFileURL(
  path.resolve(currentDirectoryPath, "../../../packages/sync/noter.ts"),
).href;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCodexLocalControlRuntimeConstructor(
  value: unknown,
): value is CodexLocalControlRuntimeConstructor {
  return typeof value === "function";
}

function isCodexLocalControlRouterFactory(value: unknown): value is CodexLocalControlRouterFactory {
  return typeof value === "function";
}

async function loadCodexLocalControlBridgeModule(): Promise<CodexLocalControlBridgeModule> {
  const candidateModule = await import(codexLocalControlBridgeModuleUrl);
  if (!isRecord(candidateModule)) {
    throw new Error("Expected noter.ts bridge module exports to be an object.");
  }

  const runtimeConstructor = candidateModule["CodexLocalControlRuntime"];
  const routerFactory = candidateModule["createCodexLocalControlRouter"];
  if (!isCodexLocalControlRuntimeConstructor(runtimeConstructor)) {
    throw new Error("Expected noter.ts bridge module to export CodexLocalControlRuntime.");
  }
  if (!isCodexLocalControlRouterFactory(routerFactory)) {
    throw new Error("Expected noter.ts bridge module to export createCodexLocalControlRouter.");
  }

  return {
    CodexLocalControlRuntime: runtimeConstructor,
    createCodexLocalControlRouter: routerFactory,
  };
}

/**
 * Register a dev-only local bridge around the shared machine-local Codex
 * control runtime so the browser, CLI, and Playwright all exercise the same
 * handler and runtime contract during Phase 1 extraction work.
 */
export function codexAppServerResearchBridgePlugin(args: { workspaceRoot: string }): Plugin {
  return {
    name: "codex-app-server-research-bridge",
    apply: "serve",
    async configureServer(server: ViteDevServer) {
      const bridgeModule = await loadCodexLocalControlBridgeModule();
      const { CodexLocalControlRuntime, createCodexLocalControlRouter } = bridgeModule;
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
              error: "codex-app-server-research-bridge only supports loopback requests.",
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
    remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1"
  );
}
