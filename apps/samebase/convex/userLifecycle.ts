import { v, type Infer } from "convex/values";
import { omitUndefined } from "@samebase/dependent/object";

import type { Doc } from "./_generated/dataModel";
import { resolveAccountPresentation } from "../shared/accountPresentation";
import {
  DELETED_SAMEBASE_ACCOUNT_LABEL,
  type UserReferencePresentation,
} from "../shared/userReferencePresentation";

const { boolean, id, literal, number, object, optional, string, union } = v;

const vSessionRecordingConsent = object({
  decision: union(literal("granted"), literal("denied")),
  policyVersion: string(),
  decidedAt: number(),
});

const vProductUpdateEmailConsent = object({
  decision: union(literal("granted"), literal("denied")),
  email: string(),
  policyVersion: string(),
  decidedAt: number(),
  source: union(literal("terms_acceptance"), literal("account_settings"), literal("right_sidebar")),
});

const userProfileFields = {
  name: optional(string()),
  displayName: optional(string()),
  image: optional(string()),
  email: string(),
  emailVerificationTime: optional(number()),
  isApproved: optional(boolean()),
  termsVersion: optional(string()),
  termsAcceptedAt: optional(number()),
  productUpdateEmailConsent: optional(vProductUpdateEmailConsent),
  sessionRecordingConsent: optional(vSessionRecordingConsent),
};

export const vUserProfile = object(userProfileFields);
export type UserProfile = Infer<typeof vUserProfile>;

const deletingUserFields = {
  ...userProfileFields,
  runId: id("workflow_accountDeletion_runs"),
  requestedAt: number(),
};

export const vActiveUser = object({
  state: literal("active"),
  ...userProfileFields,
});

export const vDeletingUser = object({
  state: literal("deleting"),
  ...deletingUserFields,
});

export const vDeletedUser = object({
  state: literal("deleted"),
  deletedAt: number(),
});

export const vUserLifecycle = union(vActiveUser, vDeletingUser, vDeletedUser);

const userDocFields = {
  _id: id("users"),
  _creationTime: number(),
};

export const vActiveUserDoc = object({
  state: literal("active"),
  ...userDocFields,
  ...userProfileFields,
});

const vDeletingUserDoc = object({
  state: literal("deleting"),
  ...userDocFields,
  ...deletingUserFields,
});

export const vNonDeletedUserLifecycleDoc = union(vActiveUserDoc, vDeletingUserDoc);

export type NonDeletedUserLifecycleDoc = Infer<typeof vNonDeletedUserLifecycleDoc>;
export type ActiveUserDoc = Extract<Doc<"users">, { state: "active" }>;

export function readActiveUser(user: Doc<"users">): ActiveUserDoc | null {
  return user.state === "active" ? user : null;
}

export function readNonDeletedUser(user: Doc<"users">): NonDeletedUserLifecycleDoc | null {
  return user.state === "deleted" ? null : user;
}

/** Copy only the profile fields allowed on non-deleted lifecycle variants. */
export function readUserProfile(user: NonDeletedUserLifecycleDoc): UserProfile {
  return omitUndefined({
    email: user.email,
    name: user.name,
    displayName: user.displayName,
    image: user.image,
    emailVerificationTime: user.emailVerificationTime,
    isApproved: user.isApproved,
    termsVersion: user.termsVersion,
    termsAcceptedAt: user.termsAcceptedAt,
    productUpdateEmailConsent: user.productUpdateEmailConsent,
    sessionRecordingConsent: user.sessionRecordingConsent,
  });
}

/** Resolve an approved durable user reference without hiding a missing row. */
export function resolveUserReferencePresentation(
  user: Doc<"users"> | null,
): UserReferencePresentation {
  if (user === null) {
    throw new Error("Samebase user reference is invalid.");
  }

  if (user.state === "deleted") {
    return {
      kind: "deleted",
      label: DELETED_SAMEBASE_ACCOUNT_LABEL,
    };
  }

  return resolveAccountPresentation(user);
}
