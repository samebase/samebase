import fs from "node:fs";
import { normalizeEnvValue } from "./scripts/normalizeEnvValue.ts";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function readEnvFileValue(envPath: string, key: string): string | undefined {
  if (!fs.existsSync(envPath)) {
    return undefined;
  }

  const prefix = `${key}=`;
  const contents = fs.readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    if (!line.startsWith(prefix)) {
      continue;
    }
    return normalizeEnvValue(line.slice(prefix.length));
  }

  return undefined;
}

function isLoopbackDevOrigin(origin: string): boolean {
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export function resolveBrowserConvexProxyTarget(args: {
  devOrigin: string | undefined;
  envProxyTarget: string | undefined;
  localEnvConvexUrl: string | undefined;
}): string | undefined {
  const devOrigin = normalizeEnvValue(args.devOrigin);
  const envProxyTarget = normalizeEnvValue(args.envProxyTarget);
  const localEnvConvexUrl = normalizeEnvValue(args.localEnvConvexUrl);

  if (!devOrigin || isLoopbackDevOrigin(devOrigin)) {
    return envProxyTarget;
  }

  return localEnvConvexUrl ?? envProxyTarget;
}
