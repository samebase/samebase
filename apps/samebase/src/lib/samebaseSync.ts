import { linkOptions } from "@tanstack/react-router";
import { buildMachinesRouteSearch } from "@/routeSearch/machines";
import { stringifyTanStackSearch } from "./tanstackSearchParams";

export const MACHINES_ROUTE = "/machines";
export const MACHINE_CONNECT_ROUTE = "/machines/connect";
export const SAMEBASE_SYNC_PUBLIC_SCRIPT_PATH = "/samebase.ts";
export type SamebaseSyncCommandTargetOs = "linux" | "macos" | "windows";

function quoteShellArg(value: string): string {
  return "'" + value.replace(/'/g, `'"'"'`) + "'";
}

/**
 * PowerShell aliases `curl` to `Invoke-WebRequest`, so the direct-download
 * bootstrap needs `curl.exe` when the machine is Windows.
 */
function readDirectDownloadCommand(targetOs?: SamebaseSyncCommandTargetOs | null) {
  return targetOs === "windows" ? "curl.exe -fsSL" : "curl -fsSL";
}

export function buildSamebaseSyncScriptUrl(origin: string): string {
  return new URL(SAMEBASE_SYNC_PUBLIC_SCRIPT_PATH, origin).toString();
}

export function buildMachinesWorkspacePath(args?: {
  machineId?: string | null;
  threadId?: string | null;
}): string {
  const options = buildMachinesWorkspaceLinkOptions(args);
  return `${options.to}${stringifyTanStackSearch(options.search)}`;
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

export function buildPublishedSamebaseSyncConnectCommand(): string {
  return "npx @samebase/sync connect";
}

export function buildPublishedSamebaseSyncRunCommand(): string {
  return "npx @samebase/sync run";
}

export function buildDirectSamebaseSyncConnectCommand(
  scriptUrl: string,
  targetOs?: SamebaseSyncCommandTargetOs | null,
): string {
  const quotedScriptUrl = quoteShellArg(scriptUrl);
  return `${readDirectDownloadCommand(targetOs)} ${quotedScriptUrl} | node --input-type=module - connect ${quotedScriptUrl}`;
}

export function buildDirectSamebaseSyncRunCommand(
  scriptUrl: string,
  targetOs?: SamebaseSyncCommandTargetOs | null,
): string {
  const quotedScriptUrl = quoteShellArg(scriptUrl);
  return `${readDirectDownloadCommand(targetOs)} ${quotedScriptUrl} | node --input-type=module - run`;
}
