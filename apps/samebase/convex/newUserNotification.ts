import type { PasswordAuthMode } from "./deploymentProfile";
import { readString, type JsonRecord } from "./jsonUtils";
import type { SendEmailArgs } from "./email";

const NEW_USER_NOTIFICATION_TO = "nicu@samebase.com";

export function buildNewUserNotification(args: {
  existingUserId: string | null;
  passwordAuthMode: PasswordAuthMode;
  profile: JsonRecord;
  providerId: string;
  userId: string;
}): SendEmailArgs | null {
  if (
    args.existingUserId !== null ||
    (args.providerId === "password" && args.passwordAuthMode !== "off")
  ) {
    return null;
  }

  const name = readString(args.profile, "name")?.trim() || "Not provided";
  const email = readString(args.profile, "email")?.trim() || "Not provided";
  return {
    to: NEW_USER_NOTIFICATION_TO,
    subject: "New Samebase signup",
    text: `A new user signed up for Samebase.

Name: ${name}
Email: ${email}
User ID: ${args.userId}
Provider: ${args.providerId}`,
  };
}
