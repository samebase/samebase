export const MACHINE_CONNECT_ROUTE = "/machines/connect";
export const NOTER_SYNC_PUBLIC_SCRIPT_PATH = "/noter.js";

function quoteShellArg(value: string): string {
  return "'" + value.replace(/'/g, `'"'"'`) + "'";
}

export function buildNoterSyncScriptUrl(origin: string): string {
  return new URL(NOTER_SYNC_PUBLIC_SCRIPT_PATH, origin).toString();
}

export function buildPublishedNoterSyncConnectCommand(): string {
  return "npx @noter-md/sync connect";
}

export function buildDirectNoterSyncConnectCommand(scriptUrl: string): string {
  const quotedScriptUrl = quoteShellArg(scriptUrl);
  return `curl -fsSL ${quotedScriptUrl} | node --input-type=module - connect ${quotedScriptUrl}`;
}

export function readMachineConnectBootstrapSearch(search: string): {
  openedByCli: boolean;
} {
  const searchParams = new URLSearchParams(search);

  return {
    openedByCli: searchParams.has("openedByCli"),
  };
}
