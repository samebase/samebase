import { Infer, v } from "convex/values";

const { literal, object, string, union } = v;

export const DISPLAY_NAME_MAX_CODE_POINTS = 64;

export const vAccountPresentation = union(
  object({
    kind: literal("displayName"),
    label: string(),
  }),
  object({
    kind: literal("email"),
    label: string(),
  }),
);

export type AccountPresentation = Infer<typeof vAccountPresentation>;

export function normalizeAccountEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
    throw new Error("A valid email address is required.");
  }
  return normalized;
}

export function normalizeDisplayName(displayName: string) {
  const normalized = displayName.trim();
  if (!normalized) {
    throw new Error("Display name cannot be blank.");
  }
  if (/[\r\n\u2028\u2029]/u.test(normalized)) {
    throw new Error("Display name must be one line.");
  }
  if (Array.from(normalized).length > DISPLAY_NAME_MAX_CODE_POINTS) {
    throw new Error(`Display name must be ${DISPLAY_NAME_MAX_CODE_POINTS} characters or fewer.`);
  }
  return normalized;
}

export function resolveAccountPresentation({
  displayName,
  email,
}: {
  displayName?: string;
  email?: string;
}): AccountPresentation {
  const normalizedEmail = normalizeAccountEmail(email ?? "");
  if (displayName !== undefined) {
    return {
      kind: "displayName",
      label: normalizeDisplayName(displayName),
    };
  }
  return {
    kind: "email",
    label: normalizedEmail,
  };
}
