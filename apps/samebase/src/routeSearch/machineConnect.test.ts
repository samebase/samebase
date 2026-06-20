import { describe, expect, it } from "vite-plus/test";
import { validateMachineConnectRouteSearch } from "./machineConnect";

describe("machineConnect route search", () => {
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
});
