import { describe, expect, expectTypeOf, it } from "vite-plus/test";

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
      name?: string;
      email: string;
    }>();
  });

  it("keeps the unauthenticated state free of account fields", () => {
    const unauthenticatedStatus = getAuthenticationStatusContract.returns.members[1];

    expect(Object.keys(unauthenticatedStatus.fields)).toEqual(["authenticated"]);
  });
});
