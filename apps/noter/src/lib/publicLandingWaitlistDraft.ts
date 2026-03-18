const PUBLIC_LANDING_WAITLIST_DRAFT_KEY = "__noterPublicLandingWaitlistDraft";

export function readPublicLandingWaitlistDraft() {
  const value = Reflect.get(globalThis, PUBLIC_LANDING_WAITLIST_DRAFT_KEY);
  return typeof value === "string" ? value : "";
}

export function writePublicLandingWaitlistDraft(value: string) {
  Reflect.set(globalThis, PUBLIC_LANDING_WAITLIST_DRAFT_KEY, value);
}

export function clearPublicLandingWaitlistDraft() {
  Reflect.deleteProperty(globalThis, PUBLIC_LANDING_WAITLIST_DRAFT_KEY);
}
