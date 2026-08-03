import type { Doc } from "../_generated/dataModel";

export function isMcpOauthClientInactive(args: {
  client: Pick<Doc<"mcpOauthClients">, "registrationStatus" | "provisionalExpiresAt">;
  now: number;
}): boolean {
  return (
    args.client.registrationStatus === "expired" ||
    args.client.registrationStatus === "disabled" ||
    (typeof args.client.provisionalExpiresAt === "number" &&
      args.client.provisionalExpiresAt <= args.now)
  );
}
