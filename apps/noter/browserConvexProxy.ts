import fs from "node:fs";
import { normalizeEnvValue } from "./scripts/normalizeEnvValue.ts";

export function readEnvFileValue(
  envPath: string,
  key: string,
): string | undefined {
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

export function resolveBrowserConvexProxyTarget(args: {
  devOrigin: string | undefined;
  envProxyTarget: string | undefined;
  localEnvConvexUrl: string | undefined;
}): string | undefined {
  const devOrigin = normalizeEnvValue(args.devOrigin);
  const envProxyTarget = normalizeEnvValue(args.envProxyTarget);
  const localEnvConvexUrl = normalizeEnvValue(args.localEnvConvexUrl);

  if (!devOrigin) {
    return envProxyTarget;
  }

  return localEnvConvexUrl ?? envProxyTarget;
}
