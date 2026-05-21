import { z } from "zod";

const convexOAuthTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal("bearer"),
});

export type ConvexOAuthTokenResponse = z.infer<typeof convexOAuthTokenResponseSchema>;

export function parseConvexOAuthTokenResponse(payload: unknown): ConvexOAuthTokenResponse {
  const tokenResponse = convexOAuthTokenResponseSchema.parse(payload);
  const strictResult = convexOAuthTokenResponseSchema.strict().safeParse(payload);

  if (!strictResult.success) {
    // TODO: Send this schema-drift event through server-side PostHog once the
    // backend analytics client exists.
    console.warn("convex:api:unexpected_response_fields", {
      path: "/oauth/token",
      schemaName: "ConvexOAuthTokenResponse",
      keys: strictResult.error.issues,
    });
  }

  return tokenResponse;
}
