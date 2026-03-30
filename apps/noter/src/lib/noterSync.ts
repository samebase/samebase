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

export function buildPublishedNoterSyncRunCommand(): string {
  return "npx @noter-md/sync run";
}

export function buildDirectNoterSyncConnectCommand(scriptUrl: string): string {
  const quotedScriptUrl = quoteShellArg(scriptUrl);
  return `SCRIPT_URL=${quotedScriptUrl}; SCRIPT_CONTENT="$(curl -fsSL "$SCRIPT_URL")" && printf '%s\\n' "$SCRIPT_CONTENT" | node --input-type=module - connect "$SCRIPT_URL"`;
}

export function buildDirectNoterSyncRunCommand(scriptUrl: string): string {
  const quotedScriptUrl = quoteShellArg(scriptUrl);
  return `SCRIPT_URL=${quotedScriptUrl}; SCRIPT_CONTENT="$(curl -fsSL "$SCRIPT_URL")" && printf '%s\\n' "$SCRIPT_CONTENT" | node --input-type=module - run`;
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
