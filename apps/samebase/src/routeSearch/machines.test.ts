import { describe, expect, it } from "vite-plus/test";
import { buildMachinesRouteSearch, validateMachinesRouteSearch } from "./machines";

describe("machines route search", () => {
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
