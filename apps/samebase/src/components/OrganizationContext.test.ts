import { describe, expect, it } from "vite-plus/test";
import type { Id } from "../../convex/_generated/dataModel";
import {
  findViewerOrganization,
  readAppOrganizationSurface,
  type ViewerOrganization,
} from "@/lib/organizationContext";

function fakeOrganizationId(value: string): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs
  // a stable value for route matching.
  return value;
}

const organization = {
  canCreateRepository: true,
  githubOwnerId: "456",
  githubOwnerLogin: "Samebase",
  githubOwnerType: "organization" as const,
  organizationId: fakeOrganizationId("organization_samebase"),
  role: "owner" as const,
} satisfies ViewerOrganization;

describe("organization context", () => {
  it.each([
    ["/org/samebase", "vaults"],
    ["/org/samebase/vaults", "vaults"],
    ["/org/samebase/providers", "providers"],
    ["/org/samebase/new-app", "new-app"],
    ["/org/samebase/connect-repo", "connect-repo"],
    ["/org/samebase/settings", "settings"],
    ["/org/samebase/settings/billing", "billing"],
  ] as const)("reads %s as an organization %s surface", (pathname, section) => {
    expect(readAppOrganizationSurface(pathname)).toEqual({
      kind: "organization",
      owner: "samebase",
      section,
      source: "organization",
    });
  });

  it("reads global, account, and vault detail surfaces", () => {
    expect(readAppOrganizationSurface("/vault")).toEqual({ kind: "allVaults" });
    expect(readAppOrganizationSurface("/settings/mcp")).toEqual({ kind: "account" });
    expect(readAppOrganizationSurface("/vault/Samebase/repo/src/index.ts")).toEqual({
      kind: "organization",
      owner: "Samebase",
      section: "vaults",
      source: "vault",
    });
  });

  it("matches organization owners without case sensitivity", () => {
    expect(findViewerOrganization([organization], "samebase")).toBe(organization);
    expect(findViewerOrganization([organization], "stale")).toBeNull();
  });
});
