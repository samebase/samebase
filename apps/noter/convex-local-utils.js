import { spawnSync } from "child_process";

export const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const parsePort = (url) => {
  try {
    const parsed = new URL(url);
    const asNumber = Number(parsed.port);
    return Number.isFinite(asNumber) && asNumber > 0 ? asNumber : null;
  } catch {
    return null;
  }
};

export const listListeningPids = (port) => {
  const result = spawnSync("lsof", [`-tiTCP:${port}`, "-sTCP:LISTEN"], {
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.status !== 0 || !result.stdout) {
    return [];
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
};

export const isPortInUse = (port) => listListeningPids(port).length > 0;
