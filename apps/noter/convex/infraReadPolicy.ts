type RedactionLevel = "default" | "strict" | "raw_fallback";
export type ProdAccessMode = "MVP_OWNER_MODE" | "MULTI_USER_MODE";

function truncateText(text: string, maxChars = 15000): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n... (truncated)`;
}

export function getProdAccessMode(): ProdAccessMode {
  return "MVP_OWNER_MODE";
}

function redactDefault(text: string): string {
  let output = text;

  // Authorization/cookies/tokens.
  output = output.replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"']+/gi, "$1[REDACTED]");
  output = output.replace(/(x[-_]?(api[-_])?key\s*[:=]\s*)[^\s"']+/gi, "$1[REDACTED]");
  output = output.replace(/(token\s*[:=]\s*)[^\s"']+/gi, "$1[REDACTED]");
  output = output.replace(/(cookie\s*[:=]\s*)[^\n]+/gi, "$1[REDACTED]");
  output = output.replace(/(secret\s*[:=]\s*)[^\s"']+/gi, "$1[REDACTED]");
  output = output.replace(/(password\s*[:=]\s*)[^\s"']+/gi, "$1[REDACTED]");

  // PII.
  output = output.replace(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    "[REDACTED_EMAIL]",
  );
  output = output.replace(/\+?[0-9][0-9().\-\s]{7,}[0-9]/g, "[REDACTED_PHONE]");

  return output;
}

function redactStrict(text: string): string {
  let output = redactDefault(text);
  output = output.replace(/[A-Za-z0-9_-]{24,}/g, "[REDACTED_TOKEN]");
  output = output.replace(/"value"\s*:\s*"[^"]+"/g, '"value":"[REDACTED]"');
  return output;
}

export function applyRedaction(args: {
  raw: string;
  requestedLevel: RedactionLevel;
  mode: ProdAccessMode;
}): {
  output: string;
  effectiveLevel: RedactionLevel;
} {
  if (args.mode === "MULTI_USER_MODE") {
    return {
      output: truncateText(redactStrict(args.raw)),
      effectiveLevel: "strict",
    };
  }

  if (args.requestedLevel === "raw_fallback") {
    const redacted = truncateText(redactDefault(args.raw));
    const raw = truncateText(args.raw);
    return {
      output:
        `${redacted}\n\n---\nRaw payload (owner mode explicit fallback):\n\n` +
        "```json\n" +
        `${raw}\n` +
        "```",
      effectiveLevel: "raw_fallback",
    };
  }

  if (args.requestedLevel === "strict") {
    return {
      output: truncateText(redactStrict(args.raw)),
      effectiveLevel: "strict",
    };
  }

  return {
    output: truncateText(redactDefault(args.raw)),
    effectiveLevel: "default",
  };
}
