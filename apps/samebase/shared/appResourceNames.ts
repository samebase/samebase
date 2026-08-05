export type AppResourceNameProvider = "convex" | "cloudflare";

type AppResourceNameValidationResult =
  | {
      valid: true;
      value: string;
    }
  | {
      valid: false;
      message: string;
      suggestion: string | null;
    };

const generatedNameMaxLengths = {
  convex: 40,
  // Samebase enables preview URLs when it creates a Worker. Cloudflare limits those names to 54 characters.
  cloudflare: 54,
} satisfies Record<AppResourceNameProvider, number>;

function trimDashes(value: string): string {
  return value.replace(/^-+|-+$/g, "");
}

export function sanitizeAppResourceName(
  rawName: string,
  provider: AppResourceNameProvider,
): string {
  const maxLength = generatedNameMaxLengths[provider];
  const sanitized = trimDashes(
    rawName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-"),
  );
  return trimDashes(sanitized.slice(0, maxLength));
}

export function buildDefaultAppResourceName(args: {
  repositoryName: string;
  provider: AppResourceNameProvider;
}): string {
  return sanitizeAppResourceName(args.repositoryName, args.provider);
}

export function validateAppResourceName(
  rawName: string,
  provider: AppResourceNameProvider,
): AppResourceNameValidationResult {
  const label = provider === "convex" ? "Convex project name" : "Cloudflare Worker name";
  const value = rawName.trim();
  const suggestion = sanitizeAppResourceName(value, provider);

  if (!value) {
    return {
      valid: false,
      message: `${label} is required.`,
      suggestion: suggestion || null,
    };
  }
  if (provider === "cloudflare") {
    const maxLength = generatedNameMaxLengths.cloudflare;
    if (value.length > maxLength) {
      return {
        valid: false,
        message: `${label} must be ${maxLength} characters or fewer.`,
        suggestion: suggestion || null,
      };
    }
    if (!/^[a-z0-9_][a-z0-9_-]*$/.test(value)) {
      return {
        valid: false,
        message: `${label} can use lowercase letters, numbers, underscores, and dashes, and cannot start with a dash.`,
        suggestion: suggestion || null,
      };
    }
  }

  return {
    valid: true,
    value,
  };
}

export function buildNumberedAppResourceNameSuggestion(args: {
  provider: AppResourceNameProvider;
  baseName: string;
  number: number;
}): string {
  const maxLength = generatedNameMaxLengths[args.provider];
  const suffix = `-${args.number}`;
  const stemMaxLength = maxLength - suffix.length;
  if (stemMaxLength <= 0) {
    const fallbackPrefix = "app";
    const suffixMaxLength = maxLength - fallbackPrefix.length;
    const fallbackSuffix = sanitizeAppResourceName(suffix, args.provider);
    return `${fallbackPrefix}${fallbackSuffix.slice(-suffixMaxLength)}`;
  }
  const sanitizedBase = sanitizeAppResourceName(args.baseName, args.provider);
  const stem = trimDashes(sanitizedBase.slice(0, stemMaxLength));
  if (stem) {
    return `${stem}${suffix}`;
  }
  return `app${suffix}`;
}
