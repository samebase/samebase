import type { PublicLandingIntakeDraft } from "@/lib/publicLandingIntake";

const PUBLIC_LANDING_INTAKE_DRAFT_KEY = "__noterPublicLandingIntakeDraft";

function isPublicLandingIntakeDraft(
  value: unknown,
): value is PublicLandingIntakeDraft {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (
    typeof Reflect.get(value, "message") === "string" &&
    typeof Reflect.get(value, "email") === "string"
  );
}

export function readPublicLandingIntakeDraft(): PublicLandingIntakeDraft {
  const value = Reflect.get(globalThis, PUBLIC_LANDING_INTAKE_DRAFT_KEY);
  if (isPublicLandingIntakeDraft(value)) {
    return value;
  }

  return {
    message: "",
    email: "",
  };
}

export function writePublicLandingIntakeDraft(value: PublicLandingIntakeDraft) {
  Reflect.set(globalThis, PUBLIC_LANDING_INTAKE_DRAFT_KEY, value);
}

export function clearPublicLandingIntakeDraft() {
  Reflect.deleteProperty(globalThis, PUBLIC_LANDING_INTAKE_DRAFT_KEY);
}
