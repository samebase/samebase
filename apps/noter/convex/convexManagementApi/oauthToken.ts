import { z, type ZodIssue } from "zod";
import { ConvexApiValidationError } from "./errors";

const convexOAuthTokenResponseFields = {
  access_token: z.string().min(1),
  token_type: z.literal("bearer"),
};
const convexOAuthTokenResponseSchema = z.object(convexOAuthTokenResponseFields);
const convexOAuthStrictTokenResponseSchema = z.strictObject(
  convexOAuthTokenResponseFields,
);

export type ConvexOAuthTokenResponse = z.infer<
  typeof convexOAuthTokenResponseSchema
>;

export function parseConvexOAuthTokenResponse(
  payload: unknown,
): ConvexOAuthTokenResponse {
  const result = convexOAuthTokenResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new ConvexApiValidationError({
      path: "/oauth/token",
      schemaName: "ConvexOAuthTokenResponse",
      validationErrors: result.error.issues.map(formatZodIssue),
    });
  }

  warnUnexpectedConvexOAuthTokenResponseFields(payload);
  return result.data;
}

function formatZodIssue(issue: ZodIssue): string {
  const path =
    issue.path.length > 0
      ? `/${issue.path.map((segment) => String(segment)).join("/")}`
      : "/";
  return `${path} ${issue.message}`;
}

function warnUnexpectedConvexOAuthTokenResponseFields(payload: unknown): void {
  const strictResult = convexOAuthStrictTokenResponseSchema.safeParse(payload);
  if (strictResult.success) {
    return;
  }

  const fields = strictResult.error.issues
    .flatMap((issue) => (issue.code === "unrecognized_keys" ? issue.keys : []))
    .sort();
  if (fields.length === 0) {
    return;
  }

  // TODO: Send this schema-drift event through server-side PostHog once the
  // backend analytics client exists.
  console.warn("convex:api:unexpected_response_fields", {
    path: "/oauth/token",
    schemaName: "ConvexOAuthTokenResponse",
    fields,
  });
}
