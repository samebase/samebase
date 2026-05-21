import { z } from "zod";

const convexOAuthTokenResponseSchema = z
  .looseObject({
    access_token: z.string().min(1),
    token_type: z.literal("bearer"),
  })
  .transform(({ access_token, token_type, ...extraFields }) => {
    const fields = Object.keys(extraFields).sort();
    if (fields.length > 0) {
      // TODO: Send this schema-drift event through server-side PostHog once the
      // backend analytics client exists.
      console.warn("convex:api:unexpected_response_fields", {
        path: "/oauth/token",
        schemaName: "ConvexOAuthTokenResponse",
        fields,
      });
    }

    return { access_token, token_type };
  });

export type ConvexOAuthTokenResponse = z.infer<
  typeof convexOAuthTokenResponseSchema
>;

export function parseConvexOAuthTokenResponse(
  payload: unknown,
): ConvexOAuthTokenResponse {
  return convexOAuthTokenResponseSchema.parse(payload);
}
