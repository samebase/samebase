import {
  buildPathWithQuery,
  setQueryParam,
  updateQueryParams,
} from "./queryParams";

export const MACHINES_ROUTE = "/machines";
export const MACHINE_CONNECT_ROUTE = "/machines/connect";
export const MACHINE_LIVE_CONTROL_ROUTE = "/machines/:machineId/live";
export const NOTER_SYNC_PUBLIC_SCRIPT_PATH = "/noter.js";
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
  return buildPathWithQuery({
    pathname: MACHINES_ROUTE,
    search: updateQueryParams(undefined, (nextSearchParams) => {
      setQueryParam(
        nextSearchParams,
        "machineId",
        args?.machineId?.trim().length ? args.machineId.trim() : null,
      );
      setQueryParam(
        nextSearchParams,
        "threadId",
        args?.threadId?.trim().length ? args.threadId.trim() : null,
      );
    }),
  });
}

export function buildMachineLiveControlPath(machineId: string): string {
  return `/machines/${encodeURIComponent(machineId)}/live`;
}

export function readMachineLiveControlPath(pathname: string): {
  machineId: string;
} | null {
  const match = pathname.match(/^\/machines\/([^/]+)\/live$/);
  if (!match) {
    return null;
  }

  try {
    return {
      machineId: decodeURIComponent(match[1]),
    };
  } catch {
    return null;
  }
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

export function readMachineConnectBootstrapSearch(search: string): {
  openedByCli: boolean;
  requestId: string | null;
} {
  const searchParams = new URLSearchParams(search);
  const requestId = searchParams.get("requestId");

  return {
    openedByCli: searchParams.has("openedByCli"),
    requestId:
      typeof requestId === "string" && requestId.length > 0 ? requestId : null,
  };
}
