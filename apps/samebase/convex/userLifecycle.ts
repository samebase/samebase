import { v, type Infer } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { resolveAccountPresentation } from "../shared/accountPresentation";
import {
  DELETED_SAMEBASE_ACCOUNT_LABEL,
  type UserReferencePresentation,
} from "../shared/userReferencePresentation";

const { boolean, id, literal, number, object, optional, string, union } = v;

const userProfileFields = {
  name: optional(string()),
  displayName: optional(string()),
  image: optional(string()),
  email: string(),
  emailVerificationTime: optional(number()),
  phone: optional(string()),
  phoneVerificationTime: optional(number()),
  isAnonymous: optional(boolean()),
  isApproved: optional(boolean()),
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

const vDeletedUserDoc = object({
  state: literal("deleted"),
  ...userDocFields,
  deletedAt: number(),
});

export const vUserLifecycleDoc = union(vActiveUserDoc, vDeletingUserDoc, vDeletedUserDoc);

export const vNonDeletedUserLifecycleDoc = union(vActiveUserDoc, vDeletingUserDoc);

export type UserLifecycleDoc = Infer<typeof vUserLifecycleDoc>;
export type NonDeletedUserLifecycleDoc = Infer<typeof vNonDeletedUserLifecycleDoc>;
export type ActiveUserDoc = Extract<UserLifecycleDoc, { state: "active" }>;

export function readUserLifecycle(user: Doc<"users">): UserLifecycleDoc {
  return user;
}

export function readActiveUser(user: Doc<"users">): ActiveUserDoc | null {
  const lifecycle = readUserLifecycle(user);
  return lifecycle.state === "active" ? lifecycle : null;
}

export function readNonDeletedUser(user: Doc<"users">): NonDeletedUserLifecycleDoc | null {
  const lifecycle = readUserLifecycle(user);
  return lifecycle.state === "deleted" ? null : lifecycle;
}

/** Copy only the profile fields allowed on non-deleted lifecycle variants. */
export function readUserProfile(user: NonDeletedUserLifecycleDoc): UserProfile {
  return {
    email: user.email,
    ...(user.name === undefined ? {} : { name: user.name }),
    ...(user.displayName === undefined ? {} : { displayName: user.displayName }),
    ...(user.image === undefined ? {} : { image: user.image }),
    ...(user.emailVerificationTime === undefined
      ? {}
      : { emailVerificationTime: user.emailVerificationTime }),
    ...(user.phone === undefined ? {} : { phone: user.phone }),
    ...(user.phoneVerificationTime === undefined
      ? {}
      : { phoneVerificationTime: user.phoneVerificationTime }),
    ...(user.isAnonymous === undefined ? {} : { isAnonymous: user.isAnonymous }),
    ...(user.isApproved === undefined ? {} : { isApproved: user.isApproved }),
  };
}

/** Resolve an approved durable user reference without hiding a missing row. */
export function resolveUserReferencePresentation(
  user: Doc<"users"> | null,
): UserReferencePresentation {
  if (user === null) {
    throw new Error("Samebase user reference is invalid.");
  }

  const lifecycle = readUserLifecycle(user);
  if (lifecycle.state === "deleted") {
    return {
      kind: "deleted",
      label: DELETED_SAMEBASE_ACCOUNT_LABEL,
    };
  }

  return resolveAccountPresentation(lifecycle);
}
