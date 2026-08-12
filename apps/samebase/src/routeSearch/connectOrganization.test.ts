import { describe, expect, it } from "vite-plus/test";

import { validateConnectOrganizationRouteSearch } from "./connectOrganization";

describe("connect organization route search", () => {
  it("keeps only a nonempty connection session", () => {
    expect(
      validateConnectOrganizationRouteSearch({
        "github-connection-session": "test-session",
        ignored: "value",
      }),
    ).toEqual({ "github-connection-session": "test-session" });
    expect(validateConnectOrganizationRouteSearch({ "github-connection-session": "" })).toEqual({});
  });
});
