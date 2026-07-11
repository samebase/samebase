import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import type { Id } from "../../_generated/dataModel";
import {
  getAuthenticationStatusContract,
  type McpAuthenticationStatus,
} from "./getAuthenticationStatus";

type AuthenticatedMcpStatus = Extract<McpAuthenticationStatus, { authenticated: true }>;

describe("get authentication status MCP contract", () => {
  it("requires canonical email for authenticated users", () => {
    const authenticatedStatus = getAuthenticationStatusContract.returns.members[0];

    expect(authenticatedStatus.fields.user.fields.email.isOptional).toBe("required");
    expectTypeOf<AuthenticatedMcpStatus["user"]>().toEqualTypeOf<{
      userId: Id<"users">;
      name?: string;
      email: string;
    }>();
  });

  it("keeps the unauthenticated user state null", () => {
    const unauthenticatedStatus = getAuthenticationStatusContract.returns.members[1];

    expect(unauthenticatedStatus.fields.user.kind).toBe("null");
  });
});
