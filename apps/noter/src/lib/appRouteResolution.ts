import {
  CODEX_APP_SERVER_RESEARCH_ROUTE,
  CODEX_APP_SERVER_THREAD_BROWSER_ROUTE,
} from "@/lib/codexAppServerResearch";
import { isChatOnlyCodespaceRoute, parseVaultPathContext } from "./vaultRoutes";

export type AuthenticatedAppRoute =
  | "dashboard"
  | "codespaceChat"
  | "fileView"
  | "test"
  | "none";

function normalizeAppPathname(pathname: string): string {
  if (pathname === "/") {
    return pathname;
  }

  return pathname.replace(/\/+$/, "");
}

/**
 * Keep authenticated route matching in a router-agnostic helper so the route
 * tree can move without another rewrite of `App.tsx`.
 */
export function resolveAuthenticatedAppRoute(
  pathname: string,
): AuthenticatedAppRoute {
  const normalizedPathname = normalizeAppPathname(pathname);

  if (normalizedPathname === "/") {
    return "dashboard";
  }

  if (normalizedPathname === "/test") {
    return "test";
  }

  if (isChatOnlyCodespaceRoute(normalizedPathname)) {
    return "codespaceChat";
  }

  const vaultContext = parseVaultPathContext(normalizedPathname);
  if (vaultContext.repositoryFullName !== undefined) {
    return "fileView";
  }

  return "none";
}

export function isStandaloneAppPathname(pathname: string): boolean {
  const normalizedPathname = normalizeAppPathname(pathname);

  return (
    normalizedPathname === "/logo" ||
    normalizedPathname === "/logo-iso" ||
    normalizedPathname === "/logo-svg" ||
    normalizedPathname === "/logo-iso-study" ||
    normalizedPathname === "/logo-transition-lab" ||
    normalizedPathname === "/logo-transition-lab-transforms" ||
    normalizedPathname === "/privacy" ||
    normalizedPathname === "/terms" ||
    normalizedPathname === "/pitch" ||
    normalizedPathname === "/pitch/print" ||
    normalizedPathname === "/pitch/print/mobile" ||
    normalizedPathname === CODEX_APP_SERVER_RESEARCH_ROUTE ||
    normalizedPathname === CODEX_APP_SERVER_THREAD_BROWSER_ROUTE
  );
}
