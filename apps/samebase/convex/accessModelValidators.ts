import { v } from "convex/values";
import { ACCESS_KEYS, VIEWER_ROLES } from "../shared/accessModel";

const { array, boolean, literal, object, union } = v;

export const vAccessKey = union(...ACCESS_KEYS.map((accessKey) => literal(accessKey)));
export const vViewerRole = union(...VIEWER_ROLES.map((role) => literal(role)));

export const vViewerAccess = object({
  role: vViewerRole,
  accessKeys: array(vAccessKey),
  termsAccepted: boolean(),
});

export const vViewerRoleResult = object({
  role: vViewerRole,
});
