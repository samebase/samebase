export const MACHINE_CONNECT_ROUTE = "/machines/connect";
export const MACHINE_LIVE_CONTROL_ROUTE = "/machines/:machineId/live";
export const NOTER_SYNC_PUBLIC_SCRIPT_PATH = "/noter.js";

function quoteShellArg(value: string): string {
  return "'" + value.replace(/'/g, `'"'"'`) + "'";
}

export function buildNoterSyncScriptUrl(origin: string): string {
  return new URL(NOTER_SYNC_PUBLIC_SCRIPT_PATH, origin).toString();
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

export function buildDirectNoterSyncConnectCommand(scriptUrl: string): string {
  const quotedScriptUrl = quoteShellArg(scriptUrl);
  return `curl -fsSL ${quotedScriptUrl} | node --input-type=module - connect ${quotedScriptUrl}`;
}

export function buildDirectNoterSyncRunCommand(scriptUrl: string): string {
  const quotedScriptUrl = quoteShellArg(scriptUrl);
  return `curl -fsSL ${quotedScriptUrl} | node --input-type=module - run`;
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
