import { describe, expect, it } from "vite-plus/test";

import {
  buildMachinesRouteSearch,
  buildPricingRouteSearch,
  validateMachineConnectRouteSearch,
  validateMachinesRouteSearch,
  validateMcpConsentRouteSearch,
  validatePricingRouteSearch,
} from "@/lib/authenticatedRouteSearch";

describe("authenticatedRouteSearch", () => {
  it("trims the MCP consent request id", () => {
    expect(
      validateMcpConsentRouteSearch({
        mcp_consent_request: "  mcpar_test  ",
      }),
    ).toEqual({
      mcp_consent_request: "mcpar_test",
    });
    expect(
      validateMcpConsentRouteSearch({
        mcp_consent_request: "   ",
      }),
    ).toEqual({});
  });

  it("accepts only known pricing checkout states", () => {
    expect(validatePricingRouteSearch({ checkout: "success" })).toEqual({
      checkout: "success",
    });
    expect(validatePricingRouteSearch({ checkout: "nope" })).toEqual({});
    expect(buildPricingRouteSearch("cancel")).toEqual({
      checkout: "cancel",
    });
    expect(buildPricingRouteSearch(null)).toEqual({});
  });

  it("normalizes the machine connect bootstrap flag by presence", () => {
    expect(
      validateMachineConnectRouteSearch({
        openedByCli: "",
        requestId: "  request-123  ",
      }),
    ).toEqual({
      openedByCli: true,
      requestId: "request-123",
    });
    expect(
      validateMachineConnectRouteSearch({
        openedByCli: "false",
        requestId: "   ",
      }),
    ).toEqual({
      openedByCli: true,
    });
    expect(
      validateMachineConnectRouteSearch({
        openedByCli: undefined,
      }),
    ).toEqual({});
  });

  it("normalizes machine workspace selections", () => {
    expect(
      validateMachinesRouteSearch({
        machineId: "  machine:123  ",
        threadId: " thread-123 ",
      }),
    ).toEqual({
      machineId: "machine:123",
      threadId: "thread-123",
    });
    expect(
      buildMachinesRouteSearch({
        machineId: " machine:123 ",
        threadId: " ",
      }),
    ).toEqual({
      machineId: "machine:123",
    });
  });
});
