import { readString, type JsonRecord } from "./jsonUtils";
import type { SendEmailArgs } from "./email";

const NEW_USER_NOTIFICATION_TO = "nicuchiciuc@gmail.com";

export function buildNewUserNotification(args: {
  existingUserId: string | null;
  profile: JsonRecord;
  providerId: string;
  seededPasswordEmail: string | null;
  userId: string;
}): SendEmailArgs | null {
  const profileEmail = readString(args.profile, "email")?.trim();
  if (
    args.existingUserId !== null ||
    (args.providerId === "password" &&
      profileEmail !== undefined &&
      args.seededPasswordEmail !== null &&
      profileEmail.toLowerCase() === args.seededPasswordEmail.trim().toLowerCase())
  ) {
    return null;
  }

  const name = readString(args.profile, "name")?.trim() || "Not provided";
  return {
    to: NEW_USER_NOTIFICATION_TO,
    subject: "New Samebase signup",
    text: `A new user signed up for Samebase.

Name: ${name}
Email: ${profileEmail || "Not provided"}
User ID: ${args.userId}
Provider: ${args.providerId}`,
  };
}
