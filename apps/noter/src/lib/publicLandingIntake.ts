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

// Keep the visible landing intake copy inside the fields so the form stays as
// minimal as possible while still hinting at the kind of message that helps.
export const PUBLIC_LANDING_INTAKE_MESSAGE_LABEL = "Message";
export const PUBLIC_LANDING_INTAKE_EMAIL_LABEL = "Email";
export const PUBLIC_LANDING_INTAKE_MESSAGE_PLACEHOLDER =
  "e.g. docs that stay close to the repo";
export const PUBLIC_LANDING_INTAKE_EMAIL_PLACEHOLDER =
  "e.g. name@team.com (optional)";
export const PUBLIC_LANDING_INTAKE_BUTTON_LABEL = "Send";
export const PUBLIC_LANDING_INTAKE_SUCCESS_MESSAGE = "Thanks.";
