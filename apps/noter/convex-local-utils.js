// @ts-check
import { spawnSync } from "child_process";

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
export const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * @param {string} url
 * @returns {number | null}
 */
export const parsePort = (url) => {
  try {
    const parsed = new URL(url);
    const asNumber = Number(parsed.port);
    return Number.isFinite(asNumber) && asNumber > 0 ? asNumber : null;
  } catch {
    return null;
  }
};

/**
 * @param {number} port
 * @returns {string[]}
 */
export const listListeningPids = (port) => {
  /**
   * @param {unknown} value
   * @returns {value is string}
   */
  const isString = (value) => typeof value === "string";

  if (process.platform === "win32") {
    const netstatResult = spawnSync("netstat", ["-ano", "-p", "tcp"], {
      stdio: "pipe",
      encoding: "utf8",
    });
    if (netstatResult.status !== 0 || !netstatResult.stdout) {
      return [];
    }

    return netstatResult.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(/\s+/))
      .filter((parts) => parts.length >= 5 && /LISTENING/i.test(parts[3] ?? ""))
      .filter((parts) => {
        const localAddress = parts[1] ?? "";
        return (
          localAddress.endsWith(`:${port}`) ||
          localAddress.endsWith(`]:${port}`)
        );
      })
      .map((parts) => parts.at(-1))
      .filter(isString)
      .filter((pid, index, all) => all.indexOf(pid) === index);
  }

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

/**
 * @param {number} port
 * @returns {boolean}
 */
export const isPortInUse = (port) => listListeningPids(port).length > 0;
