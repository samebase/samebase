export type AppResourceNameProvider = "convex" | "cloudflare";

type AppResourceNameConfig = {
  label: string;
  maxLength: number;
};

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

const appResourceNameConfigs = {
  convex: {
    label: "Convex project name",
    maxLength: 40,
  },
  cloudflare: {
    label: "Cloudflare Worker name",
    maxLength: 63,
  },
} satisfies Record<AppResourceNameProvider, AppResourceNameConfig>;

function readConfig(provider: AppResourceNameProvider): AppResourceNameConfig {
  return appResourceNameConfigs[provider];
}

function trimDashes(value: string): string {
  return value.replace(/^-+|-+$/g, "");
}

export function sanitizeAppResourceName(
  rawName: string,
  provider: AppResourceNameProvider,
): string {
  const { maxLength } = readConfig(provider);
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
  const { label, maxLength } = readConfig(provider);
  const value = rawName.trim();
  const suggestion = sanitizeAppResourceName(value, provider);

  if (!value) {
    return {
      valid: false,
      message: `${label} is required.`,
      suggestion: suggestion || null,
    };
  }
  if (value.length > maxLength) {
    return {
      valid: false,
      message: `${label} must be ${maxLength} characters or fewer.`,
      suggestion: suggestion || null,
    };
  }
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)) {
    return {
      valid: false,
      message: `${label} can use lowercase letters, numbers, and dashes, and must start and end with a letter or number.`,
      suggestion: suggestion || null,
    };
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
  const { maxLength } = readConfig(args.provider);
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
