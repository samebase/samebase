"use node";

export const INLINE_TEXT_MAX = 900_000;

/**
 * Guess a MIME type from the file extension.
 * Defaults to application/octet-stream if unknown.
 */
export function guessMime(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "md":
    case "markdown":
      return "text/markdown; charset=utf-8";
    case "txt":
      return "text/plain; charset=utf-8";
    case "json":
      return "application/json; charset=utf-8";
    case "yaml":
    case "yml":
      return "application/x-yaml; charset=utf-8";
    case "csv":
      return "text/csv; charset=utf-8";

    // code / config files – treat as plain text
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
    case "css":
    case "html":
    case "xml":
    case "toml":
      return "text/plain; charset=utf-8";

    // images
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "vox":
      return "application/octet-stream";

    default:
      console.log("unknown mime", ext);
      return "application/octet-stream";
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      await sleep(150 * (i + 1));
    }
  }
  if (lastError !== undefined) {
    throw lastError;
  }
  throw new Error("Retry failed without an error");
}

export function isTextBuffer(buf: Uint8Array): boolean {
  const len = Math.min(buf.length, 8000); // sample first 8KB
  let suspicious = 0;

  for (let i = 0; i < len; i++) {
    const byte = buf[i];
    // Allow: tab, line feed, carriage return
    if (byte === 9 || byte === 10 || byte === 13) continue;
    // Printable ASCII
    if (byte >= 32 && byte <= 126) continue;
    // UTF-8 multibyte starts (quick + permissive)
    if (byte >= 128) continue;

    suspicious++;
    if (suspicious > 10) return false; // too many weird bytes
  }
  return true;
}
