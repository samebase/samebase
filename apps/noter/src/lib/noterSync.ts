import { linkOptions } from "@tanstack/react-router";
import { buildPathWithQuery } from "./queryParams";
import { buildMachinesRouteSearch } from "./authenticatedRouteSearch";
import { stringifyTanStackSearch } from "./tanstackSearchParams";

export const MACHINES_ROUTE = "/machines";
export const MACHINE_CONNECT_ROUTE = "/machines/connect";
export const NOTER_SYNC_PUBLIC_SCRIPT_PATH = "/noter.ts";
export type NoterSyncCommandTargetOs = "linux" | "macos" | "windows";

function quoteShellArg(value: string): string {
  return "'" + value.replace(/'/g, `'"'"'`) + "'";
}

/**
 * PowerShell aliases `curl` to `Invoke-WebRequest`, so the direct-download
 * bootstrap needs `curl.exe` when the machine is Windows.
 */
function readDirectDownloadCommand(targetOs?: NoterSyncCommandTargetOs | null) {
  return targetOs === "windows" ? "curl.exe -fsSL" : "curl -fsSL";
}

export function buildNoterSyncScriptUrl(origin: string): string {
  return new URL(NOTER_SYNC_PUBLIC_SCRIPT_PATH, origin).toString();
}

export function buildMachinesWorkspacePath(args?: {
  machineId?: string | null;
  threadId?: string | null;
}): string {
  const options = buildMachinesWorkspaceLinkOptions(args);
  return buildPathWithQuery({
    pathname: options.to,
    search: stringifyTanStackSearch(options.search),
  });
}

export function buildMachinesWorkspaceLinkOptions(args?: {
  machineId?: string | null;
  threadId?: string | null;
}) {
  return linkOptions({
    to: MACHINES_ROUTE,
    search: buildMachinesRouteSearch(args),
  });
}

export function buildPublishedNoterSyncConnectCommand(): string {
  return "npx @noter-md/sync connect";
}

export function buildPublishedNoterSyncRunCommand(): string {
  return "npx @noter-md/sync run";
}

export function buildDirectNoterSyncConnectCommand(
  scriptUrl: string,
  targetOs?: NoterSyncCommandTargetOs | null,
): string {
  const quotedScriptUrl = quoteShellArg(scriptUrl);
  return `${readDirectDownloadCommand(targetOs)} ${quotedScriptUrl} | node --input-type=module - connect ${quotedScriptUrl}`;
}

export function buildDirectNoterSyncRunCommand(
  scriptUrl: string,
  targetOs?: NoterSyncCommandTargetOs | null,
): string {
  const quotedScriptUrl = quoteShellArg(scriptUrl);
  return `${readDirectDownloadCommand(targetOs)} ${quotedScriptUrl} | node --input-type=module - run`;
}
