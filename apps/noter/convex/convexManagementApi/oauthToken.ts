import { z } from "zod";

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
  const tokenResponse = convexOAuthTokenResponseSchema.parse(payload);
  const strictResult = convexOAuthStrictTokenResponseSchema.safeParse(payload);
  if (strictResult.success) {
    return tokenResponse;
  }

  const fields = strictResult.error.issues
    .flatMap((issue) => (issue.code === "unrecognized_keys" ? issue.keys : []))
    .sort();
  if (fields.length === 0) {
    return tokenResponse;
  }

  // TODO: Send this schema-drift event through server-side PostHog once the
  // backend analytics client exists.
  console.warn("convex:api:unexpected_response_fields", {
    path: "/oauth/token",
    schemaName: "ConvexOAuthTokenResponse",
    fields,
  });
  return tokenResponse;
}
