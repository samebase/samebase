export type PublicLandingIntakeDraft = {
  message: string;
  email: string;
};

export const PUBLIC_LANDING_INTAKE_PLACEHOLDER_TEST_ID =
  "public-landing-intake-placeholder";
export const PUBLIC_LANDING_INTAKE_MESSAGE_INPUT_ID =
  "public-landing-intake-message";
export const PUBLIC_LANDING_INTAKE_EMAIL_INPUT_ID =
  "public-landing-intake-email";
export const PUBLIC_LANDING_INTAKE_SUBMIT_BUTTON_ID =
  "public-landing-intake-submit";

export const PUBLIC_LANDING_INTAKE_PROMPT =
  "What are you trying to make with noter.md?";
export const PUBLIC_LANDING_INTAKE_HELP_TEXT =
  "I'm actively building noter.md. Tell me what you'd want it to help with. Leave your email only if you want a reply.";
export const PUBLIC_LANDING_INTAKE_MESSAGE_PLACEHOLDER =
  "A repo-native notes space for product docs, lightweight publishing, and small tools.";
export const PUBLIC_LANDING_INTAKE_EMAIL_PLACEHOLDER =
  "Email for a reply (optional)";
export const PUBLIC_LANDING_INTAKE_BUTTON_LABEL = "Share idea";

const PUBLIC_LANDING_INTAKE_SUCCESS_MESSAGE =
  "Thanks. I'm reading these while noter.md is still taking shape.";
const PUBLIC_LANDING_INTAKE_SUCCESS_EMAIL_FOLLOW_UP =
  "If it makes sense, I'll follow up by email.";

/**
 * The landing success state changes slightly when a reply address was left,
 * but the primary acknowledgement stays the same so the shell and hydrated
 * form never diverge in tone.
 */
export function buildPublicLandingIntakeSuccessMessage(hasEmail: boolean) {
  if (!hasEmail) {
    return PUBLIC_LANDING_INTAKE_SUCCESS_MESSAGE;
  }

  return `${PUBLIC_LANDING_INTAKE_SUCCESS_MESSAGE} ${PUBLIC_LANDING_INTAKE_SUCCESS_EMAIL_FOLLOW_UP}`;
}
